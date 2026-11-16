// Fondos: fondos animados para Claude Desktop (y el cel) que tú eliges.
//   /fondo                 muestra el actual y la lista
//   /fondo acuarela        cambia el fondo y los colores de la app a esa escena
//   /fondo ninguno         quita el fondo y regresa a los colores de siempre
// La elección se recuerda entre sesiones. En la terminal no se dibuja nada: es de Desktop y el cel.
import type { Register } from 'claude-code'

import { look } from './look.js'
import { ESCENAS, escena, type NombreEscena } from './escenas.js'

const LISTA = Object.values(ESCENAS)
  .map(e => `  ${e.nombre}: ${e.descripcion}`)
  .join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command
      .register({ name: 'fondo', description: 'Fondos: elige un fondo animado (acuarela, ascii, laponia) o ninguno' })
      .catch(() => {})
    // Solo si ya elegiste uno antes: sin elección el mod no toca tu tema.
    const guardado = await $.store.get('escena').catch(() => undefined)
    const previa = typeof guardado === 'string' ? escena(guardado) : undefined
    if (previa) await $.theme.set(look(previa.nombre as NombreEscena, previa.modo)).catch(() => {})
    return next(e)
  })

  on('command.run', { command: 'fondo' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const actual = await $.store.get('escena').catch(() => undefined)

    if (!arg || arg === 'lista') {
      const cual = (typeof actual === 'string' && escena(actual)?.nombre) || 'ninguno'
      return { text: `Fondo actual: ${cual}.\nEscenas:\n${LISTA}\nUsa /fondo <nombre> o /fondo ninguno.` }
    }

    if (arg === 'ninguno' || arg === 'off' || arg === 'quitar') {
      await $.store.set('escena', '').catch(() => {})
      const r = await $.theme.clear()
      // clear resuelve isDrawn:false siempre; el motivo dice si ya no hay tema
      return { text: `Fondo quitado. (${r.isDrawn ? 'listo' : r.reason})` }
    }

    const elegida = escena(arg)
    if (!elegida) return { text: `No conozco «${arg}». Escenas:\n${LISTA}` }

    const r = await $.theme.set(look(elegida.nombre as NombreEscena, elegida.modo))
    await $.store.set('escena', elegida.nombre).catch(() => {})
    return {
      text: r.isDrawn
        ? `Fondo «${elegida.nombre}» puesto: ${elegida.descripcion}.`
        : `Elegí «${elegida.nombre}», pero no se dibuja aquí: ${r.reason}. Se verá en Claude Desktop o en el cel.`,
    }
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)
    const dibujo = e.props.plugin === $.plugin.name ? escena(e.props.scene) : undefined
    if (!dibujo) return next(e)
    const { Svg } = $.ui.resolve(e)
    return <Svg source={dibujo.svg()} alt={`Fondo animado: ${dibujo.descripcion}`} isInteractive />
  })
}
