import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Busy } from "../types"

const isBusy = atom({ plugin: 'prompt-enhancer', key: 'isBusy' } as const, false as Busy)
const isHidden = atom({ plugin: 'prompt-enhancer', key: 'isHidden' } as const, false)

const RULES = `Reescribe el borrador de abajo como un prompt completo para Claude Code. No ejecutes la tarea: devuelve solo el prompt reescrito, en español, sin preámbulo, sin comillas y sin bloque de código.

Escríbelo para los modelos actuales de Claude, que siguen las instrucciones al pie de la letra y planean solos. Lo que más mejora el resultado es el contexto que solo el usuario conoce: para quién es, qué proyecto es, qué cuenta como bien hecho y por qué existe cada restricción. Describe el objetivo y cómo se ve terminado, no la receta para llegar; usa pasos numerados solo donde el orden de verdad importa. Cada restricción va una sola vez, en tono normal y con su porqué, sin mayúsculas de alarma ni palabras como «CRÍTICO» o «NUNCA», porque los modelos actuales sobreaplican el énfasis. No pidas que piense paso a paso ni pongas límites de palabras: eso se controla fuera del prompt. Respeta la intención del borrador y no agregues alcance que no pidió. No inventes rutas, archivos ni datos: usa solo lo que aparece en el contexto y, si falta algo, ponlo como pregunta.

El prompt reescrito lleva estas secciones con estos títulos:
Tarea: lo que se pide y para qué, claro y concreto, en una o dos frases.
Contexto: lo del proyecto que importa (carpetas, archivos, reglas de CLAUDE.md, convenciones, quién va a usar el resultado). Nada inventado.
Skills: las skills o agentes instalados que encajan, por su nombre exacto, y para qué sirve cada una aquí. Solo nombres de la lista disponible; si ninguna encaja, dilo.
Restricciones: lo que no se debe tocar o hacer, cada una con su razón. Si hay acciones riesgosas o difíciles de deshacer (borrar, publicar, gastar, hacer push), di que se confirmen antes; y nombra lo que sí está aprobado para que no pida permiso de más.
Antes de empezar, pregúntame: las decisiones que de verdad dependen del usuario, numeradas. Si no hay ninguna, escribe que puede arrancar directo.
Cómo verificar: cómo se comprueba que quedó bien (correr algo, revisar un archivo, comparar contra un criterio).
Resultado esperado: qué se entrega, en qué formato y dónde, y cómo se reporta al final: un resumen que se entienda sin haber visto el trabajo.`

async function projectContext($: EngineInterface): Promise<string> {
  const cwd = await $.session.cwd()
  const memory = await $.fs.read('CLAUDE.md').catch(() => '')
  const commands = await $.command.list().catch(() => [])
  const skills = commands
    .filter(c => c.source !== 'builtin')
    .map(c => `- ${c.name}: ${c.description}`)
    .join('\n')

  return [
    `Carpeta del proyecto: ${cwd}`,
    memory ? `CLAUDE.md del proyecto:\n${memory.slice(0, 20000)}` : 'Sin CLAUDE.md.',
    `Skills y comandos disponibles:\n${skills || '(ninguno)'}`,
  ].join('\n\n')
}

async function enhance($: EngineInterface): Promise<void> {
  if (await read($, isBusy)) return
  const { text } = await $.prompt.read()
  const draft = text.trim()
  if (!draft) {
    $.ui.toast('Escribe primero tu idea en la caja.')
    return
  }

  await update($, isBusy, () => true)
  try {
    const ask = `${RULES}\n\nBorrador:\n${draft}`
    // The fork reads the whole session: installed skills and CLAUDE.md included.
    let r = await $.model.fork({ prompt: ask, effort: 'medium' })
    if (!r.isAnswered && r.reason === 'nothing-to-fork') {
      const context = await projectContext($)
      r = await $.model.complete({
        model: 'sonnet',
        system: context,
        prompt: ask,
        maxTokens: 2000,
        timeoutMs: 60000,
      })
    }

    if (!r.isAnswered || !r.text.trim()) {
      $.ui.toast('No se pudo mejorar el prompt. Intenta otra vez.')
      return
    }

    const filled = await $.prompt.fill({ text: r.text.trim(), mode: 'replace' })
    if (!filled.isFilled) $.ui.toast('No pude escribir en la caja del prompt.')
  } finally {
    await update($, isBusy, () => false)
  }
}

async function send($: EngineInterface): Promise<void> {
  const { text } = await $.prompt.read()
  if (!text.trim()) return
  await $.prompt.fill({ text: '', mode: 'replace' })
  await $.prompt.submit({ text })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'enhance',
      description: 'Prompt Enhancer: reescribe el borrador de la caja como un prompt completo',
    })
    await $.command
      .register({ name: 'enhance-botones', description: 'Prompt Enhancer: muestra u oculta los botones Enhance y Send (on | off)' })
      .catch(() => {})
    const hidden = (await $.store.get('isHidden').catch(() => undefined)) === true
    await update($, isHidden, () => hidden)
    return next(e)
  })

  on('command.run', { command: 'enhance' }, async $ => {
    void enhance($)
    return { text: 'Mejorando el borrador…' }
  })

  on('command.run', { command: 'enhance-botones' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const want = arg === 'on' ? false : arg === 'off' ? true : undefined
    const hidden = await update($, isHidden, h => (want === undefined ? !h : want))
    await $.store.set('isHidden', hidden).catch(() => {})
    return { text: hidden ? 'Botones Enhance y Send ocultos. /enhance-botones los vuelve a mostrar (/enhance sigue funcionando).' : 'Botones Enhance y Send visibles.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.plugin !== $.plugin.name || (await read($, isHidden))) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const busy = await read($, isBusy)

    return (
      <Box>
        <Button
          key="enhance"
          label={busy ? 'Mejorando…' : 'Enhance'}
          hotkey="e"
          onPress={() => enhance($)}
        />
        <Text> </Text>
        <Button key="send" label="Send" hotkey="s" onPress={() => send($)} />
      </Box>
    )
  })
}
