// Cafeína: mantiene la compu despierta un tiempo, con la cuenta regresiva arriba del prompt.
//   /cafeina 3h · /cafeina 90m · /cafeina 1h30m · /cafeina off · /cafeina (estado)
//   /cafeina ocultar | mostrar: esconde solo la fila, la cafeína sigue.
// macOS: caffeinate -dimsu. Linux: systemd-inhibit. El proceso vive con la sesión de Claude:
// si la sesión se cierra, la compu vuelve a poder dormirse (no deja procesos sueltos).
// Ojo: en una laptop con la tapa cerrada y sin corriente, el sistema se duerme de todos modos.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, HookStream, ProcessSpawnChunk, ProcessSpawnResult, Register, Timer } from 'claude-code'

import { bandsFile, orderRows, parseOrder, stackBands } from './bands'

const TICK_MS = 60_000
const MAX_MS = 24 * 3600_000

const hastaMs = atom({ plugin: 'cafeina', key: 'hastaMs' } as const, null as number | null)
const tick = atom({ plugin: 'cafeina', key: 'tick' } as const, 0)
const isHidden = atom({ plugin: 'cafeina', key: 'isHidden' } as const, false)

// El proceso que mantiene despierta la compu. Salir de su ciclo lo termina.
let child: HookStream<ProcessSpawnChunk, ProcessSpawnResult> | undefined
let bandOrder: Promise<string[]> | undefined

async function readBandOrder($: EngineInterface): Promise<string[]> {
  const file = bandsFile(await $.env.get('CLAUDE_CONFIG_DIR'), await $.env.get('HOME'))
  return file && (await $.fs.exists(file)) ? parseOrder(await $.fs.read(file)) : []
}

/** «3h», «90m», «1h30m», «2» (horas) → milisegundos; undefined si no se entiende. */
export function parseDuration(text: string): number | undefined {
  const t = text.trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return undefined
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 3600_000)
  const m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m(?:in)?)?$/.exec(t)
  if (!m || (!m[1] && !m[2])) return undefined
  const ms = (m[1] ? parseFloat(m[1]) * 3600_000 : 0) + (m[2] ? parseInt(m[2], 10) * 60_000 : 0)
  return ms > 0 ? Math.round(ms) : undefined
}

export function countdown(ms: number) {
  const minutes = Math.max(0, Math.ceil(ms / 60_000))
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

function hourOf(ms: number) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** El comando que inhibe el sueño en esta plataforma; undefined donde no hay uno conocido. */
async function inhibitor($: EngineInterface, seconds: number): Promise<string[] | undefined> {
  const os = await $.process.run(['uname', '-s']).catch(() => undefined)
  const name = os?.stdout.trim()
  if (name === 'Darwin') return ['caffeinate', '-dimsu', '-t', String(seconds)]
  if (name === 'Linux') {
    return ['systemd-inhibit', '--what=idle:sleep', '--who=cafeina', '--why=Claude Code trabajando', 'sleep', String(seconds)]
  }
  return undefined
}

async function stopChild() {
  const c = child
  child = undefined
  await c?.return(undefined as never).catch(() => {})
}

/** Arranca (o reinicia) la cafeína hasta `until`. Devuelve un error legible o undefined. */
async function start($: EngineInterface, until: number): Promise<string | undefined> {
  await stopChild()
  const seconds = Math.max(1, Math.round((until - (await $.clock.now())) / 1000))
  const argv = await inhibitor($, seconds)
  if (!argv) return 'Cafeína solo funciona en macOS y Linux por ahora.'
  const stream = $.process.spawn({ argv })
  child = stream
  await update($, hastaMs, () => until)
  void (async () => {
    try {
      for await (const _ of stream) {
        // caffeinate no escribe nada; el ciclo solo mantiene vivo el proceso
      }
    } catch {
      $.ui.toast(`Cafeína: no pude arrancar ${argv[0]}.`)
    }
    if (child === stream) {
      // terminó solo (se acabó el tiempo): limpia el estado
      child = undefined
      await update($, hastaMs, () => null).catch(() => {})
      $.ui.toast('Cafeína terminada: la compu ya se puede dormir.')
    }
  })()
  return undefined
}

export const register: Register = on => {
  let timer: Timer | undefined

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command
      .register({ name: 'cafeina', description: 'Cafeína: mantiene la compu despierta (3h, 90m, off, ocultar, mostrar)' })
      .catch(() => {})
    const hidden = (await $.store.get('isHidden').catch(() => undefined)) === true
    await update($, isHidden, () => hidden)
    timer?.cancel()
    timer = $.clock.every(TICK_MS, () => void update($, tick, n => n + 1).catch(() => {}))
    // Tras recargar el mod el proceso anterior murió: si quedaba tiempo, lo retoma.
    const until = await read($, hastaMs)
    if (until !== null) {
      if (until > (await $.clock.now())) await start($, until)
      else await update($, hastaMs, () => null)
    }
    return r
  })

  on('command.run', { command: 'cafeina' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const now = await $.clock.now()
    const until = await read($, hastaMs)

    if (arg === 'ocultar' || arg === 'mostrar') {
      const hidden = arg === 'ocultar'
      await update($, isHidden, () => hidden)
      await $.store.set('isHidden', hidden).catch(() => {})
      const activa = until !== null && until > now
      return {
        text: hidden
          ? 'Fila de cafeína oculta (la cafeína sigue si estaba activa).'
          : activa
            ? `Fila de cafeína visible: activa hasta las ${hourOf(until)}.`
            : 'Fila de cafeína visible, pero no hay cafeína activa y la fila solo aparece mientras la hay. Activa una con /cafeina 3h.',
      }
    }
    if (arg === 'off' || arg === 'apagar' || arg === 'quitar') {
      await stopChild()
      await update($, hastaMs, () => null)
      return { text: until ? 'Cafeína apagada: la compu ya se puede dormir.' : 'La cafeína ya estaba apagada.' }
    }
    if (!arg) {
      return {
        text: until && until > now
          ? `Cafeína activa hasta las ${hourOf(until)} (quedan ${countdown(until - now)}). /cafeina off la apaga.`
          : 'Cafeína apagada. Usa /cafeina 3h, /cafeina 90m o /cafeina 1h30m.',
      }
    }
    const ms = parseDuration(arg)
    if (!ms) return { text: `No entendí «${arg}». Prueba /cafeina 3h, /cafeina 90m o /cafeina off.` }
    const target = now + Math.min(ms, MAX_MS)
    const error = await start($, target)
    if (error) return { text: error }
    return { text: `Cafeína activa ${countdown(target - now)}, hasta las ${hourOf(target)}.${ms > MAX_MS ? ' (Máximo 24 h.)' : ''}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    await read($, tick)
    const until = await read($, hastaMs)
    if (e.props.hasSurvey || until === null || (await read($, isHidden))) return rest
    const now = await $.clock.now()
    if (until <= now) return rest
    const { Box, Text } = $.ui.resolve(e)
    const mine = (
      <Box flexDirection="row" paddingX={1}>
        <Text color="#c8875a">{'☕ '}</Text>
        <Text wrap="truncate">
          <Text>cafeína</Text>
          <Text dimColor>{` · quedan ${countdown(until - now)} · hasta las ${hourOf(until)}`}</Text>
        </Text>
      </Box>
    )
    bandOrder ??= readBandOrder($).catch(() => [])
    return stackBands(rest, 'cafeina', mine, 'above', await bandOrder)
  })

  on('ui.render', { component: 'AbovePromptList' }, async ($, e, next) => {
    bandOrder ??= readBandOrder($).catch(() => [])
    const rows = orderRows(e.props.rows, await bandOrder)
    return next(rows ? { ...e, props: { ...e.props, rows } } : e)
  })
}
