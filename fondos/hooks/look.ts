// El look de cada escena: la paleta de la app (para que el texto se lea sobre el fondo) y el
// vidrio esmerilado de los paneles. Una paleta por escena, generada con makeColors.

import type { ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'

const ROLES_CLAROS = { accent: '#c2603a', danger: '#c0392b', success: '#4f8a4b', warning: '#c98a14', pro: '#6f5fb8' }
const ROLES_OSCUROS = { accent: '#f0a35c', danger: '#e0574a', success: '#5faf68', warning: '#e8a63a', pro: '#9d8cf0' }

type Anclas = Parameters<typeof makeColors>[0]['dark'] extends infer M ? (M extends { gray?: { anchors?: infer A } } ? A : never) : never

function paleta(label: string, modo: 'light' | 'dark', anchors: Anclas, roles = modo === 'light' ? ROLES_CLAROS : ROLES_OSCUROS) {
  return makeColors({ label, only: modo, roles, [modo]: { gray: { anchors } } }).theme
}

const COLORES = {
  acuarela: paleta('Acuarela', 'light', {
    'surface-0': '#ece2d0',
    'surface-1': '#f4ecde',
    'surface-2': '#fbf6ec',
    'text-primary': '#2a2824',
    'text-secondary': '#524e46',
    'text-muted': '#716c61',
  }),
  ascii: paleta('ASCII', 'dark', {
    'surface-0': '#0e0805',
    'surface-1': '#150c07',
    'surface-2': '#1d110a',
    'surface-3': '#26170e',
    'text-primary': '#f6e6d4',
    'text-secondary': '#d9c2aa',
    'text-muted': '#aa917a',
  }),
  laponia: paleta('Laponia', 'dark', {
    'surface-0': '#070b16',
    'surface-1': '#0c1222',
    'surface-2': '#121a2e',
    'surface-3': '#192440',
    'text-primary': '#e8eefc',
    'text-secondary': '#bcc7e6',
    'text-muted': '#939fc4',
  }),
} as const

const VIDRIO = {
  acuarela: { blur: 16, tint: '#f6efe3', opacity: 0.6 },
  ascii: { blur: 14, tint: '#0e0805', opacity: 0.66 },
  laponia: { blur: 18, tint: '#070b16', opacity: 0.6 },
} as const

export function look(nombre: keyof typeof COLORES, modo: 'light' | 'dark'): ThemeSetArgs {
  return {
    colors: COLORES[nombre],
    backdrop: { scene: nombre, glass: VIDRIO[nombre] },
    overrideColorScheme: modo,
  }
}
