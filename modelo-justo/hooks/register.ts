// Modelo justo: clasifica cada petición y ajusta el turno a lo que pide.
//   Modo «modelo» (el de siempre): Haiku para lo simple, Sonnet para lo normal, Opus para lo complejo.
//   Modo «esfuerzo»: se queda en el modelo de la sesión y solo cambia el esfuerzo (low, medium, high).
//   Cambiar de modelo turno a turno pierde la caché de prompts, que es por modelo; cambiar el
//   esfuerzo no la pierde en los modelos que lo aceptan por mensaje. Por eso «esfuerzo» suele
//   salir más barato en conversaciones largas.
// /modelo-justo on | off | modo modelo | modo esfuerzo | (sin nada: estado)
import type { EngineInterface, Register } from 'claude-code'

type Tier = 'simple' | 'normal' | 'compleja'
type Mode = 'modelo' | 'esfuerzo'
type Effort = 'low' | 'medium' | 'high'

const MODEL: Record<Tier, string> = { simple: 'haiku', normal: 'sonnet', compleja: 'opus' }
const MODEL_LABEL: Record<Tier, string> = { simple: 'Haiku', normal: 'Sonnet', compleja: 'Opus' }
const EFFORT: Record<Tier, Effort> = { simple: 'low', normal: 'medium', compleja: 'high' }
// En modo modelo, medium basta para Sonnet y Opus en el trabajo de todos los días (es el nivel que
// la guía oficial recomienda para programar en interactivo); Haiku va en low para lo trivial.
const MODEL_EFFORT: Record<Tier, Effort> = { simple: 'low', normal: 'medium', compleja: 'medium' }

// Una respuesta corta («va», «sí», «1a, 2b») depende de la conversación, que el clasificador no ve:
// esas se quedan con el modelo y el esfuerzo de la sesión en vez de bajar a ciegas.
const MIN_CHARS = 60

const CLASSIFY = `Clasifica la petición que un usuario le hace a un agente de programación, según cuánto razonamiento necesita.

simple: saludos, preguntas cortas, consultar un dato, leer o listar algo, cambios triviales de una línea.
normal: tareas acotadas de código o texto, editar unos pocos archivos, explicar código, depurar algo concreto.
compleja: arquitectura, planeación, refactors grandes, trabajo que cruza varias piezas o repos, análisis profundo, decisiones con muchas restricciones.

Si dudas entre dos niveles, elige el más alto: quedarse corto cuesta más que sobrar.
Responde solo con una palabra: simple, normal o compleja.

Petición:
`

async function isOn($: EngineInterface): Promise<boolean> {
  return (await $.store.get('enabled')) !== false
}

async function getMode($: EngineInterface): Promise<Mode> {
  return (await $.store.get('mode')) === 'esfuerzo' ? 'esfuerzo' : 'modelo'
}

type Classified = { tier: Tier } | { why: string }

async function classify($: EngineInterface, text: string): Promise<Classified> {
  // Haiku 5.5 piensa antes de contestar y ese pensamiento cuenta contra maxTokens:
  // con un tope de 5 se quedaba sin espacio para la palabra. 256 alcanza de sobra a esfuerzo low.
  const r = await $.model.complete({
    model: 'haiku',
    prompt: CLASSIFY + text.slice(0, 4000),
    maxTokens: 256,
    effort: 'low',
    timeoutMs: 15000,
  })
  if (!r.isAnswered) return { why: r.reason }
  const word = r.text.toLowerCase()
  // la palabra más alta que aparezca gana, por si contesta con algo más que una palabra
  if (/\bcompleja\b/.test(word)) return { tier: 'compleja' }
  if (/\bnormal\b/.test(word)) return { tier: 'normal' }
  if (/\bsimple\b/.test(word)) return { tier: 'simple' }
  return { why: 'respuesta rara' }
}

type Choice = { model?: string; effort?: Effort }

export const register: Register = on => {
  // turnId → lo elegido para ese turno
  const chosen = new Map<string, Choice>()

  on('session.start', async ($, e, next) => {
    await $.command
      .register({
        name: 'modelo-justo',
        description: 'Modelo justo: on | off | modo modelo | modo esfuerzo (ajusta cada petición a lo que pide)',
      })
      .catch(() => {})
    $.ui.status((await isOn($)) ? `Modelo justo: listo · modo ${await getMode($)}` : undefined)
    return next(e)
  })

  on('command.run', { command: 'modelo-justo' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase().replace(/\s+/g, ' ')
    if (arg === 'on' || arg === 'off') {
      await $.store.set('enabled', arg === 'on')
      $.ui.status(arg === 'on' ? `Modelo justo: listo · modo ${await getMode($)}` : undefined)
      return { text: `Modelo justo ${arg === 'on' ? 'activado' : 'apagado'}.` }
    }
    if (arg === 'modo modelo' || arg === 'modo esfuerzo') {
      const mode: Mode = arg === 'modo esfuerzo' ? 'esfuerzo' : 'modelo'
      await $.store.set('mode', mode)
      if (await isOn($)) $.ui.status(`Modelo justo: listo · modo ${mode}`)
      return {
        text:
          mode === 'modelo'
            ? 'Modo modelo: Haiku, Sonnet u Opus según la petición. Ojo: cada cambio de modelo empieza la caché de cero.'
            : 'Modo esfuerzo: mismo modelo de la sesión, esfuerzo low, medium o high según la petición.',
      }
    }
    return {
      text: `Modelo justo está ${(await isOn($)) ? 'activado' : 'apagado'}, en modo ${await getMode($)}. Usa /modelo-justo on, off, modo modelo o modo esfuerzo.`,
    }
  })

  on('turn.start', async ($, e, next) => {
    const text = e.text.trim()
    if (e.agentId === undefined && text && !text.startsWith('/') && (await isOn($))) {
      if (text.length < MIN_CHARS) {
        $.ui.status('Modelo justo: respuesta corta · se queda como la sesión')
      } else {
        const mode = await getMode($)
        const c: Classified = await classify($, text).catch(() => ({ why: 'sin respuesta' }))
        if ('tier' in c) {
          const choice: Choice =
            mode === 'modelo' ? { model: MODEL[c.tier], effort: MODEL_EFFORT[c.tier] } : { effort: EFFORT[c.tier] }
          chosen.set(e.turnId, choice)
          $.ui.status(
            mode === 'modelo'
              ? `Modelo justo: ${MODEL_LABEL[c.tier]} ${MODEL_EFFORT[c.tier]} · tarea ${c.tier}`
              : `Modelo justo: esfuerzo ${EFFORT[c.tier]} · tarea ${c.tier}`,
          )
        } else {
          $.ui.status(`Modelo justo: sin clasificar (${c.why}) · se queda como la sesión`)
        }
      }
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const choice = e.agentId === undefined ? chosen.get(e.turnId) : undefined
    if (!choice) return yield* next(e)
    return yield* next({
      ...e,
      ...(choice.model ? { model: choice.model } : {}),
      // solo toca el esfuerzo donde el modelo lo acepta
      ...(choice.effort && e.effort !== undefined ? { effort: choice.effort } : {}),
    })
  })

  on('turn.complete', ($, e, next) => {
    chosen.delete(e.turnId)
    return next(e)
  })
}
