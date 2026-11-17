// explica-guia: arma una guía visual (HTML y, si hay Chrome, PDF) de lo que Claude hizo.
//   /explica          → guía de la última tarea
//   /explica sesion   → guía de toda la sesión
//   /explica abrir    → además abre el resultado (se puede combinar: /explica sesion abrir)
//   /explica ocultar | mostrar → esconde o muestra el botón de arriba del prompt
// Registra archivos y comandos con tool.call en $.state; el modelo (fork de la propia sesión)
// lee la conversación y redacta la guía en JSON. Nada sale de la compu: no hay llamadas a internet.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMessage } from 'claude-code'

import type { ExplicaGuiaEvento } from '../types'
import { guiaDesdeRegistro, parseGuia, renderHtml } from './guia'

const MAX_REGISTRO = 400

const registro = atom({ plugin: 'explica-guia', key: 'registro' } as const, [] as ExplicaGuiaEvento[])
const turno = atom({ plugin: 'explica-guia', key: 'turno' } as const, 0)
const isHidden = atom({ plugin: 'explica-guia', key: 'isHidden' } as const, false)
const trabajando = atom({ plugin: 'explica-guia', key: 'trabajando' } as const, false)

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const dos = (n: number) => String(n).padStart(2, '0')

function fechaLegible(ms: number): string {
  const d = new Date(ms)
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}, ${dos(d.getHours())}:${dos(d.getMinutes())}`
}

function sello(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}`
}

/** Recorta un comando y le quita lo que parezca un secreto, porque la guía se queda en un archivo. */
export function limpiarComando(command: string): string {
  const plano = command
    .replace(/\s*\n\s*/g, ' ⏎ ')
    .replace(/(token|password|passwd|secret|api[_-]?key|authorization)(\s*[=:]\s*|\s+)\S+/gi, '$1=***')
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
    .replace(/\b(sk|ghp|gho|xox[abp])[-_][A-Za-z0-9_-]{12,}/g, '***')
  return plano.length > 220 ? `${plano.slice(0, 220)}…` : plano
}

/** Qué sistema es: uname en macOS y Linux; si no existe, Windows. */
async function plataforma($: EngineInterface): Promise<'mac' | 'linux' | 'windows'> {
  const r = await $.process.run(['uname', '-s'], { timeoutMs: 5000 }).catch(() => undefined)
  const name = r?.stdout.trim()
  if (name === 'Darwin') return 'mac'
  if (name === 'Linux') return 'linux'
  return 'windows'
}

/** Busca Chrome o Chromium en las rutas comunes. Sin instalar nada. */
async function buscarChrome($: EngineInterface, so: 'mac' | 'linux' | 'windows'): Promise<string | undefined> {
  const rutas: string[] = []
  if (so === 'mac') {
    const home = (await $.env.get('HOME')) ?? ''
    for (const base of ['/Applications', `${home}/Applications`]) {
      rutas.push(
        `${base}/Google Chrome.app/Contents/MacOS/Google Chrome`,
        `${base}/Chromium.app/Contents/MacOS/Chromium`,
        `${base}/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary`,
      )
    }
  } else if (so === 'linux') {
    rutas.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/opt/google/chrome/chrome',
    )
  } else {
    const dirs = [
      await $.env.get('PROGRAMFILES'),
      await $.env.get('PROGRAMFILES(X86)'),
      await $.env.get('LOCALAPPDATA'),
    ].filter((d): d is string => !!d)
    for (const d of dirs) {
      rutas.push(`${d}\\Google\\Chrome\\Application\\chrome.exe`, `${d}\\Chromium\\Application\\chrome.exe`)
    }
  }
  for (const ruta of rutas) {
    if (await $.fs.exists(ruta).catch(() => false)) return ruta
  }
  if (so !== 'windows') {
    for (const nombre of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
      const r = await $.process.run(['which', nombre], { timeoutMs: 5000 }).catch(() => undefined)
      const ruta = r?.exitCode === 0 ? r.stdout.trim().split('\n')[0] : undefined
      if (ruta) return ruta
    }
  }
  return undefined
}

function urlDeArchivo(ruta: string): string {
  const limpia = ruta.replace(/\\/g, '/')
  return encodeURI(limpia.startsWith('/') ? `file://${limpia}` : `file:///${limpia}`).replace(/#/g, '%23')
}

/** Convierte el HTML a PDF con Chrome headless. Devuelve la ruta del PDF o undefined. */
async function aPdf($: EngineInterface, so: 'mac' | 'linux' | 'windows', chrome: string, html: string): Promise<string | undefined> {
  const pdf = html.replace(/\.html$/, '.pdf')
  let perfil: string
  if (so === 'windows') {
    perfil = `${(await $.env.get('TEMP')) ?? '.'}\\explica-chrome-${await $.clock.now()}`
  } else {
    const t = await $.process.run(['mktemp', '-d'], { timeoutMs: 5000 }).catch(() => undefined)
    perfil = t?.exitCode === 0 ? t.stdout.trim() : `/tmp/explica-chrome-${await $.clock.now()}`
  }
  const r = await $.process
    .run(
      [
        chrome,
        '--headless',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${perfil}`,
        '--no-pdf-header-footer',
        `--print-to-pdf=${pdf}`,
        urlDeArchivo(html),
      ],
      { timeoutMs: 60_000 },
    )
    .catch(() => undefined)
  // El perfil temporal solo sirvió para esta conversión.
  if (so === 'windows') await $.process.run(['cmd', '/c', 'rmdir', '/s', '/q', perfil], { timeoutMs: 15_000 }).catch(() => undefined)
  else await $.process.run(['rm', '-rf', perfil], { timeoutMs: 15_000 }).catch(() => undefined)
  if (!r || (await $.fs.exists(pdf).catch(() => false)) === false) return undefined
  return pdf
}

async function abrir($: EngineInterface, so: 'mac' | 'linux' | 'windows', ruta: string): Promise<boolean> {
  const argv = so === 'mac' ? ['open', ruta] : so === 'linux' ? ['xdg-open', ruta] : ['cmd', '/c', 'start', '', ruta]
  const r = await $.process.run(argv, { timeoutMs: 15_000 }).catch(() => undefined)
  return r?.exitCode === 0
}

function prompt(alcance: 'ultima' | 'sesion', eventos: readonly ExplicaGuiaEvento[]): string {
  const lista = eventos
    .slice(-80)
    .map(e => (e.tipo === 'archivo' ? `- archivo (${e.accion ?? 'editado'}): ${e.texto}` : `- comando: ${e.texto}`))
    .join('\n')
  const que =
    alcance === 'sesion'
      ? 'TODO lo que se hizo en esta sesión, de principio a fin.'
      : 'SOLO la última tarea: lo último que la persona pidió y que implicó trabajo real, antes de este mensaje. No cuentes el comando /explica ni preguntas sueltas sin trabajo.'
  return `Haz una guía para una persona NO técnica que quiere entender qué se hizo y por qué. Alcance: ${que}

Registro automático de archivos y comandos de esa parte (úsalo para no equivocar nombres; ignora lo que no sea del alcance):
${lista || '(vacío: apóyate en la conversación)'}

Reglas:
- Español de México, claro, de tú, sin tecnicismos. Si una palabra técnica es inevitable, explícala en una frase en "glosario".
- No inventes nada: solo lo que de verdad pasó en la conversación. Si algo no se verificó, dilo en "verificar" o en "siguiente".
- "resumen": exactamente 3 frases cortas (qué se pidió, qué se hizo, cómo quedó).
- "pasos": en orden, de 2 a 8. Cada uno con título corto, "que_paso" en una o dos frases, los archivos que cambió (solo los importantes) y los comandos importantes (no ls, cd ni lecturas), cada uno con para qué sirvió.
- Escribe como un maestro paciente: la persona quiere APRENDER, no solo enterarse. Explica el porqué de cada cosa, no solo el qué.
- En cada paso, "como": 3 o 4 frases sencillas que expliquen CÓMO funciona lo que se hizo y por qué se hace así, como si se lo contaras a alguien que construye apps con IA y no sabe programar. Usa una comparación de la vida diaria cuando ayude (por ejemplo, una receta, una puerta con cerradura o un archivero). Toda palabra técnica se explica la primera vez que aparece.
- En "comandos" pon SOLO comandos que cambiaron algo (instalar, crear, borrar, correr pruebas, publicar). NO pongas comandos de solo lectura (ls, cd, cat, grep, find, sed, head, git status, git log). Y cada comando lleva en "para_que" una frase simple de qué hizo, sin copiar el comando.
- "aprendes": 2 o 3 ideas generales que la persona se lleva para entender mejor la próxima vez (por ejemplo, qué es un hook o por qué se prueba antes de publicar); no repitas los pasos.
- "decisiones": las que importan, con el porqué en palabras simples.
- "verificar": pasos concretos que la persona puede hacer y qué debería ver. Pon solo lo que de verdad se comprobó o se puede comprobar.
- "siguiente": pendientes o recomendaciones reales; si no hay, lista vacía.

Responde SOLO con un objeto JSON válido, sin \`\`\` ni texto antes o después, con esta forma:
{"titulo":"","resumen":["","",""],"pasos":[{"titulo":"","que_paso":"","como":"","cambios":[{"archivo":"","que_cambio":""}],"comandos":[{"comando":"","para_que":""}]}],"decisiones":[{"decision":"","porque":"","alternativa":""}],"verificar":[{"paso":"","resultado":""}],"siguiente":[""],"aprendes":[""],"glosario":[{"termino":"","significa":""}]}`
}

/** Archivos tocados y comandos corridos que se leen en la conversación, con el número de petición. */
function eventosDeConversacion(mensajes: readonly SessionMessage[]): ExplicaGuiaEvento[] {
  const salida: ExplicaGuiaEvento[] = []
  let turnoActual = 0
  for (const m of mensajes) {
    if (m.role === 'user') {
      const texto = m.text.trim()
      if (texto && !texto.startsWith('/') && !(m.toolResults && m.toolResults.length > 0 && texto === '')) turnoActual += 1
      continue
    }
    for (const uso of m.toolUses) {
      if (uso.isError) continue
      const entrada = uso.input
      if (uso.tool === 'Write' && typeof entrada.file_path === 'string') {
        salida.push({ turno: turnoActual, tipo: 'archivo', texto: entrada.file_path, accion: 'escrito', ms: 0 })
      } else if (uso.tool === 'Edit' && typeof entrada.file_path === 'string') {
        salida.push({ turno: turnoActual, tipo: 'archivo', texto: entrada.file_path, accion: 'editado', ms: 0 })
      } else if (uso.tool === 'NotebookEdit' && typeof entrada.notebook_path === 'string') {
        salida.push({ turno: turnoActual, tipo: 'archivo', texto: entrada.notebook_path, accion: 'editado', ms: 0 })
      } else if (uso.tool === 'Bash' && typeof entrada.command === 'string') {
        salida.push({ turno: turnoActual, tipo: 'comando', texto: limpiarComando(entrada.command), ms: 0 })
      }
    }
  }
  return salida.slice(-MAX_REGISTRO)
}

/** El texto de las últimas peticiones y respuestas, recortado para caber en una llamada. */
function resumenDeConversacion(mensajes: readonly SessionMessage[]): string {
  const filas: string[] = []
  for (const m of mensajes.slice(-60)) {
    const texto = m.text.trim()
    if (!texto) continue
    filas.push(`${m.role === 'user' ? 'Persona' : 'Claude'}: ${texto.slice(0, 1500)}`)
  }
  return filas.join('\n\n').slice(-30_000)
}


/**
 * Si el proyecto es un repositorio de git, agrega «explicaciones/» a su .gitignore una sola vez,
 * para que las guías no se suban por accidente. Nunca falla la guía por esto.
 */
async function asegurarGitignore($: EngineInterface, cwd: string, sep: string): Promise<void> {
  try {
    const raiz = cwd.replace(/[\\/]+$/, '')
    if (!(await $.fs.exists(`${raiz}${sep}.git`))) return
    const archivo = `${raiz}${sep}.gitignore`
    const actual = (await $.fs.exists(archivo)) ? await $.fs.read(archivo) : ''
    if (/^\/?explicaciones\/?\s*$/m.test(actual)) return
    const salto = actual === '' || actual.endsWith('\n') ? '' : '\n'
    await $.fs.write(archivo, `${actual}${salto}\n# Guías que arma el mod /explica (explica-guia)\nexplicaciones/\n`)
  } catch {
    // si no se puede tocar el .gitignore, la guía sigue
  }
}

async function generar(
  $: EngineInterface,
  alcance: 'ultima' | 'sesion',
  quiereAbrir: boolean,
): Promise<string> {
  // La conversación completa es la fuente más confiable: el registro propio solo ve lo que pasó
  // después de que el mod se cargó (en Desktop, con el primer mensaje).
  const mensajes = await $.session.messages().catch(() => [] as SessionMessage[])
  const desdeConversacion = eventosDeConversacion(mensajes)
  const todos = desdeConversacion.length > 0 ? desdeConversacion : await read($, registro)
  const actual = await read($, turno)
  // «Última tarea»: la petición más reciente que tuvo archivos o comandos.
  const ultimoConTrabajo = todos.reduce((m, e) => Math.max(m, e.turno), 0)
  const eventos = alcance === 'sesion' ? todos : todos.filter(e => e.turno === (ultimoConTrabajo || actual))

  let respuesta = await $.model.fork({ prompt: prompt(alcance, eventos) }).catch(() => undefined)
  let motivo = respuesta && !respuesta.isAnswered ? `${respuesta.reason}` : undefined
  if (!respuesta?.isAnswered) {
    // Si la sesión no se puede bifurcar, se le manda el texto de la conversación en una llamada normal.
    const resumen = resumenDeConversacion(mensajes)
    if (resumen) {
      const intento = await $.model
        .complete({
          model: 'sonnet',
          system: 'Eres quien explica a una persona no técnica lo que se hizo en una sesión de trabajo. Responde solo con lo pedido.',
          prompt: `Esta es la conversación (recortada):\n\n${resumen}\n\n${prompt(alcance, eventos)}`,
          maxTokens: 6000,
          timeoutMs: 120_000,
        })
        .catch(() => undefined)
      if (intento?.isAnswered) respuesta = intento
      else if (intento) motivo = `${motivo ?? 'fork'}; complete: ${intento.reason}`
    }
  }
  let guia = respuesta?.isAnswered ? parseGuia(respuesta.text) : undefined
  let aviso: string | undefined
  if (!guia) {
    guia = guiaDesdeRegistro(eventos, alcance)
    aviso = respuesta?.isAnswered
      ? 'Claude contestó en un formato que no pude leer, así que esta guía trae solo el registro de archivos y comandos. Vuelve a correr /explica para intentar de nuevo.'
      : `No pude pedirle a Claude la explicación (${motivo ?? 'sin motivo'}), así que esta guía trae solo el registro de archivos y comandos. Vuelve a correr /explica más tarde.`
  }

  const ahora = await $.clock.now()
  const cwd = await $.session.cwd()
  const proyecto = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd
  const html = renderHtml(guia, { fecha: fechaLegible(ahora), proyecto, alcance, aviso })

  const sep = cwd.includes('\\') && !cwd.includes('/') ? '\\' : '/'
  const carpeta = `${cwd.replace(/[\\/]+$/, '')}${sep}explicaciones`
  let ruta = `${carpeta}${sep}explica-${sello(ahora)}.html`
  for (let n = 2; await $.fs.exists(ruta).catch(() => false); n++) {
    ruta = `${carpeta}${sep}explica-${sello(ahora)}-${n}.html`
  }
  await asegurarGitignore($, cwd, sep)
  await $.fs.write(ruta, html)

  const so = await plataforma($)
  const chrome = await buscarChrome($, so)
  const pdf = chrome ? await aPdf($, so, chrome, ruta) : undefined

  const lineas = [`Guía lista (${alcance === 'sesion' ? 'toda la sesión' : 'última tarea'}).`, `HTML: ${ruta}`]
  if (pdf) lineas.push(`PDF: ${pdf}`)
  else if (chrome) lineas.push('Chrome no logró generar el PDF. Abre el HTML y usa Imprimir → Guardar como PDF.')
  else lineas.push('No encontré Chrome ni Chromium, así que solo dejé el HTML. Ábrelo en tu navegador y usa Imprimir → Guardar como PDF.')
  if (aviso) lineas.push(aviso)
  if (quiereAbrir) {
    const ok = await abrir($, so, pdf ?? ruta)
    lineas.push(ok ? 'Lo abrí.' : 'No pude abrirlo automáticamente: ábrelo desde la ruta de arriba.')
  }
  $.ui.toast(`Guía lista: ${pdf ?? ruta}`, { timeoutMs: 12_000 })
  return lineas.join('\n')
}

/** Lo que hacen /explica y sus botones: la misma ruta para los dos, sin pasar por command.run. */
async function ejecutar($: EngineInterface, args: string): Promise<{ text: string }> {
  const e = { args }
  try {
    const palabras = e.args
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/\s+/)
      .filter(Boolean)
    const conocidas = ['sesion', 'abrir', 'ocultar', 'mostrar']
    const raras = palabras.filter(p => !conocidas.includes(p))
    if (raras.length > 0) {
      return {
        text: `No entendí «${raras.join(' ')}». Usa /explica (última tarea), /explica sesion, /explica abrir, /explica ocultar o /explica mostrar.`,
      }
    }
    if (palabras.includes('ocultar') || palabras.includes('mostrar')) {
      const oculto = palabras.includes('ocultar')
      await update($, isHidden, () => oculto)
      await $.store.set('isHidden', oculto).catch(() => {})
      return { text: oculto ? 'Botón de /explica oculto. El comando sigue funcionando.' : 'Botón de /explica visible arriba del prompt.' }
    }
    if (await read($, trabajando)) return { text: 'Ya estoy armando una guía. Espera a que termine.' }
    await update($, trabajando, () => true)
    const alcance = palabras.includes('sesion') ? 'sesion' : 'ultima'
    // Armar la guía tarda más que el tiempo que tiene un hook para contestar: el comando responde
    // al instante y la guía se arma en segundo plano; al terminar sale un aviso con la ruta.
    void (async () => {
      try {
        await generar($, alcance, palabras.includes('abrir'))
      } catch (err) {
        const motivo = err instanceof Error ? err.message : String(err)
        $.ui.toast(`No pude armar la guía: ${motivo}`, { timeoutMs: 12_000 })
      } finally {
        await update($, trabajando, () => false).catch(() => {})
      }
    })()
    return {
      text:
        alcance === 'sesion'
          ? 'Armando la guía de toda la sesión. Te aviso con la ruta cuando esté (tarda un par de minutos).'
          : 'Armando la guía de la última tarea. Te aviso con la ruta cuando esté (tarda un par de minutos).',
    }
  } catch (err) {
    const detalle = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
    return { text: `Falló /explica por dentro. Mándale esto a Renata:\n${detalle.slice(0, 1500)}` }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command
      .register({
        name: 'explica',
        description: 'Guía visual de lo que Claude hizo (sesion = toda la sesión, abrir = la abre al terminar, ocultar/mostrar = el botón)',
      })
      .catch(() => {})
    const oculto = (await $.store.get('isHidden').catch(() => undefined)) === true
    await update($, isHidden, () => oculto)
    return r
  })

  // Cuenta las peticiones de la persona; los comandos con / y los mensajes ocultos no cuentan.
  on('prompt.submit', async ($, e, next) => {
    if (e.command === undefined && e.isMeta !== true) await update($, turno, n => n + 1).catch(() => {})
    return next(e)
  }).catch(($, e, next) => next(e))

  // Anota archivos y comandos que de verdad se ejecutaron. Nunca cambia la llamada.
  on('tool.call', async ($, e, next) => {
    const hecho = await next(e)
    try {
      if (hecho.deny !== undefined || hecho.isError === true) return hecho
      let nuevo: Omit<ExplicaGuiaEvento, 'turno' | 'ms'> | undefined
      if (e.tool === 'Write') nuevo = { tipo: 'archivo', texto: e.file_path, accion: 'escrito' }
      else if (e.tool === 'Edit') nuevo = { tipo: 'archivo', texto: e.file_path, accion: 'editado' }
      else if (e.tool === 'NotebookEdit') nuevo = { tipo: 'archivo', texto: e.notebook_path, accion: 'editado' }
      else if (e.tool === 'Bash') nuevo = { tipo: 'comando', texto: limpiarComando(e.command) }
      if (nuevo) {
        const evento: ExplicaGuiaEvento = { ...nuevo, turno: await read($, turno), ms: await $.clock.now() }
        await update($, registro, lista => {
          const ultimo = lista.at(-1)
          if (ultimo && ultimo.tipo === evento.tipo && ultimo.texto === evento.texto && ultimo.turno === evento.turno) return lista
          return [...lista, evento].slice(-MAX_REGISTRO)
        })
      }
    } catch {
      // el registro nunca debe estorbar a la herramienta
    }
    return hecho
  }).catch(($, e, next) => next(e))

  // /clear empieza una conversación nueva: el registro de la anterior ya no aplica.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, registro, () => []).catch(() => {})
      await update($, turno, () => 0).catch(() => {})
    }
    return next(e)
  })

  on('command.run', { command: 'explica' }, async ($, e) => {
    $.ui.toast('explica: recibí el comando', { timeoutMs: 4000 })
    return ejecutar($, e.args)
  }).catch(($, e, next) => ({ text: 'Falló /explica antes de empezar (el hook no pudo correr). Mándale esto a Renata.' }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const vistas = await read($, turno)
    const ocupado = await read($, trabajando)
    if (e.props.hasSurvey || vistas === 0 || (await read($, isHidden))) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const correr = (args: string) => () => {
      void ejecutar($, args)
        .then(r => $.ui.toast(r.text.split('\n')[0] ?? 'Armando la guía…', { timeoutMs: 8000 }))
        .catch(() => $.ui.toast('No pude arrancar /explica.'))
    }
    return (
      <Box flexDirection="row" paddingX={1}>
        <Text dimColor>{ocupado ? 'Armando la guía… ' : 'Guía visual: '}</Text>
        {ocupado ? null : <Button key="ultima" label="Explicar la última tarea" onPress={correr('')} />}
        {ocupado ? null : <Text> </Text>}
        {ocupado ? null : <Button key="sesion" label="Explicar la sesión" onPress={correr('sesion')} />}
      </Box>
    )
  })
}
