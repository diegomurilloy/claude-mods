// La guía: lee la respuesta del modelo (JSON) y la convierte en un HTML autocontenido.
// Sin dependencias, sin red: todo el CSS y los íconos van dentro del archivo.
import type { ExplicaGuiaEvento } from '../types'

export type Cambio = { archivo: string; queCambio: string }
export type Comando = { comando: string; paraQue: string }
export type Paso = { titulo: string; quePaso: string; como: string; cambios: Cambio[]; comandos: Comando[] }
export type Decision = { decision: string; porque: string; alternativa: string }
export type Verificacion = { paso: string; resultado: string }
export type Termino = { termino: string; significa: string }
export type Guia = {
  titulo: string
  resumen: string[]
  pasos: Paso[]
  decisiones: Decision[]
  verificar: Verificacion[]
  siguiente: string[]
  /** Lo que la persona puede llevarse para entender mejor la próxima vez. */
  aprendes: string[]
  glosario: Termino[]
}

export type Meta = {
  /** Fecha y hora ya formateadas para leerse. */
  fecha: string
  proyecto: string
  alcance: 'ultima' | 'sesion'
  /** Aviso que se muestra arriba (por ejemplo, que la guía se armó sin explicación del modelo). */
  aviso?: string
  /** Marca de «datos de ejemplo» para las guías de demostración. */
  esEjemplo?: boolean
}

export function esc(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const str = (v: unknown, max = 600): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** Saca el primer objeto JSON de la respuesta del modelo (aunque venga con ``` o con texto alrededor). */
export function parseGuia(raw: string): Guia | undefined {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  let data: Record<string, unknown>
  try {
    data = obj(JSON.parse(raw.slice(start, end + 1)))
  } catch {
    return undefined
  }
  const pasos = list(data.pasos)
    .map(p => obj(p))
    .map(p => ({
      titulo: str(p.titulo, 160),
      quePaso: str(p.que_paso, 900),
      como: str(p.como, 700),
      cambios: list(p.cambios)
        .map(c => obj(c))
        .map(c => ({ archivo: str(c.archivo, 300), queCambio: str(c.que_cambio, 400) }))
        .filter(c => c.archivo)
        .slice(0, 20),
      comandos: list(p.comandos)
        .map(c => obj(c))
        .map(c => ({ comando: str(c.comando, 400), paraQue: str(c.para_que, 400) }))
        .filter(c => c.comando)
        .slice(0, 10),
    }))
    .filter(p => p.titulo || p.quePaso)
    .slice(0, 14)
  if (pasos.length === 0) return undefined
  return {
    titulo: str(data.titulo, 160) || 'Lo que se hizo',
    resumen: list(data.resumen).map(s => str(s, 400)).filter(Boolean).slice(0, 3),
    pasos,
    decisiones: list(data.decisiones)
      .map(d => obj(d))
      .map(d => ({ decision: str(d.decision, 300), porque: str(d.porque, 600), alternativa: str(d.alternativa, 400) }))
      .filter(d => d.decision)
      .slice(0, 8),
    verificar: list(data.verificar)
      .map(v => obj(v))
      .map(v => ({ paso: str(v.paso, 400), resultado: str(v.resultado, 400) }))
      .filter(v => v.paso)
      .slice(0, 8),
    siguiente: list(data.siguiente).map(s => str(s, 400)).filter(Boolean).slice(0, 6),
    aprendes: list(data.aprendes).map(s => str(s, 400)).filter(Boolean).slice(0, 4),
    glosario: list(data.glosario)
      .map(t => obj(t))
      .map(t => ({ termino: str(t.termino, 80), significa: str(t.significa, 300) }))
      .filter(t => t.termino && t.significa)
      .slice(0, 8),
  }
}

/** Una guía mínima armada solo con el registro, para cuando el modelo no contesta. */
export function guiaDesdeRegistro(eventos: readonly ExplicaGuiaEvento[], alcance: 'ultima' | 'sesion'): Guia {
  const archivos = new Map<string, 'escrito' | 'editado'>()
  for (const e of eventos) if (e.tipo === 'archivo') archivos.set(e.texto, e.accion ?? 'editado')
  const comandos = eventos.filter(e => e.tipo === 'comando').map(e => e.texto)
  const pasos: Paso[] = []
  if (archivos.size > 0) {
    pasos.push({
      titulo: 'Archivos que cambiaron',
      quePaso: 'Claude creó o modificó estos archivos.',
      como: '',
      cambios: [...archivos].slice(0, 20).map(([archivo, accion]) => ({
        archivo,
        queCambio: accion === 'escrito' ? 'Se escribió el archivo completo (nuevo o reemplazado).' : 'Se editó una parte del archivo.',
      })),
      comandos: [],
    })
  }
  if (comandos.length > 0) {
    pasos.push({
      titulo: 'Comandos que se ejecutaron',
      quePaso: 'Claude corrió estos comandos en la terminal.',
      como: '',
      cambios: [],
      comandos: comandos.slice(-10).map(comando => ({ comando, paraQue: '' })),
    })
  }
  if (pasos.length === 0) {
    pasos.push({
      titulo: 'Sin cambios registrados',
      quePaso: 'Desde que se activó este mod no se registró ningún archivo cambiado ni comandos.',
      como: '',
      cambios: [],
      comandos: [],
    })
  }
  return {
    titulo: alcance === 'sesion' ? 'Lo que se hizo en la sesión' : 'Lo que se hizo en la última tarea',
    resumen: [
      `Se tocaron ${archivos.size} archivo(s).`,
      `Se ejecutaron ${comandos.length} comando(s).`,
      'Esta versión solo trae el registro, sin la explicación de Claude.',
    ],
    pasos,
    decisiones: [],
    verificar: [],
    siguiente: [],
    aprendes: [],
    glosario: [],
  }
}

const ICONOS = {
  resumen: '<path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  pasos: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  decisiones: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  verificar: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>',
  aprendes: '<path d="M12 3 2 9l10 6 10-6-10-6z"/><path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5"/>',
  siguiente: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  glosario: '<path d="M5 5a2 2 0 0 1 2-2h12v16H7a2 2 0 0 0-2 2z"/><path d="M5 19V5"/>',
  archivo: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
  terminal: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m7 10 3 2-3 2M12 15h5"/>',
} as const

const icono = (nombre: keyof typeof ICONOS, size = 22): string =>
  `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[nombre]}</svg>`

const seccion = (clase: string, nombre: keyof typeof ICONOS, titulo: string, cuerpo: string): string =>
  `<section class="sec ${clase}"><h2>${icono(nombre)}<span>${esc(titulo)}</span></h2>${cuerpo}</section>`

const CSS = `
:root{--ink:#1f2933;--muted:#5b6770;--line:#dde3e8;--bg:#f3f6f8;--card:#fff;--accent:#1f6f78;--accent-soft:#e3f0f1;--warn:#7a5200;--warn-soft:#fbf2dc;--code:#eef2f5}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.page{max-width:820px;margin:0 auto;padding:32px 20px 48px}
header.top{background:var(--accent);color:#fff;border-radius:14px;padding:28px 28px 24px}
header.top .kicker{font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.8;margin:0 0 6px}
header.top h1{margin:0 0 10px;font-size:28px;line-height:1.2}
header.top .meta{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:14px;opacity:.9}
.aviso{margin:16px 0 0;padding:12px 14px;border-radius:10px;background:var(--warn-soft);color:var(--warn);font-size:14px;border:1px solid #ecd9a6}
.sec{margin-top:28px}
.sec h2{display:flex;align-items:center;gap:10px;margin:0 0 14px;font-size:20px;color:var(--accent);break-after:avoid}
.ico{flex:none}
.resumen{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.resumen .card{display:flex;flex-direction:column;gap:8px}
.num{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:var(--accent);color:#fff;font-weight:700;font-size:15px;flex:none}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;break-inside:avoid;page-break-inside:avoid}
.card p{margin:0}
.paso{display:flex;gap:14px;margin-bottom:12px}
.paso .body{flex:1;min-width:0}
.paso h3{margin:2px 0 6px;font-size:17px}
.paso .que{margin:0 0 10px}
.como{margin:0 0 12px;padding:10px 12px;border-radius:10px;background:var(--accent-soft);border-left:4px solid var(--accent)}
.como b{display:block;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin-bottom:4px}
.como p{margin:0}
.sub{display:flex;align-items:center;gap:6px;margin:12px 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600}
.cambio{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;margin:6px 0;font-size:15px}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.chip{background:var(--accent-soft);color:#14515a;border-radius:6px;padding:1px 7px;font-size:13px;word-break:break-all}
.cmd{margin:6px 0 2px;background:var(--code);border-left:3px solid var(--accent);border-radius:6px;padding:8px 12px;font-size:13px;white-space:pre-wrap;word-break:break-word}
.para{margin:0 0 8px;color:var(--muted);font-size:14px}
.decision h3{margin:0 0 6px;font-size:16px}
.porque{margin-top:6px;padding:8px 12px;background:var(--accent-soft);border-radius:8px;font-size:15px}
.porque b{color:#14515a}
.alt{margin-top:6px;color:var(--muted);font-size:14px}
.check{display:flex;gap:12px;align-items:flex-start;margin-bottom:10px}
.box{flex:none;width:22px;height:22px;border:2px solid var(--accent);border-radius:6px;margin-top:2px}
.check .res{color:var(--muted);font-size:14px}
ul.sig{list-style:none;margin:0;padding:0}
ul.sig li{display:flex;gap:10px;align-items:flex-start;margin-bottom:8px}
ul.sig li .flecha{flex:none;color:var(--accent);margin-top:2px}
dl.glos{margin:0;display:grid;grid-template-columns:max-content 1fr;gap:6px 16px}
dl.glos dt{font-weight:600}
dl.glos dd{margin:0;color:var(--muted)}
footer{margin-top:32px;text-align:center;color:var(--muted);font-size:13px}
.boton{position:fixed;right:18px;bottom:18px;background:var(--accent);color:#fff;border:0;border-radius:999px;padding:10px 18px;font-size:14px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2)}
.ejemplo{display:inline-block;margin-top:10px;padding:2px 10px;border-radius:999px;background:#fff;color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.06em}
@media (max-width:640px){.resumen{grid-template-columns:1fr}header.top h1{font-size:23px}dl.glos{grid-template-columns:1fr}}
@page{size:A4;margin:14mm}
@media print{
  body{background:#fff;font-size:12.5px}
  .page{max-width:none;padding:0}
  .boton{display:none}
  .card{box-shadow:none}
  .sec{margin-top:20px}
  header.top{border-radius:8px;padding:20px 22px}
  header.top h1{font-size:23px}
  .paso,.check,.decision{break-inside:avoid;page-break-inside:avoid}
  a{color:inherit;text-decoration:none}
}
`

export function renderHtml(guia: Guia, meta: Meta): string {
  const resumen = guia.resumen
    .map((t, i) => `<div class="card"><span class="num">${i + 1}</span><p>${esc(t)}</p></div>`)
    .join('')

  const pasos = guia.pasos
    .map((p, i) => {
      const cambios = p.cambios.length
        ? `<div class="sub">${icono('archivo', 15)}Lo que cambió</div>` +
          p.cambios
            .map(
              c =>
                `<div class="cambio"><code class="chip">${esc(c.archivo)}</code><span>${esc(c.queCambio)}</span></div>`,
            )
            .join('')
        : ''
      const comandos = p.comandos.length
        ? `<div class="sub">${icono('terminal', 15)}Comandos importantes</div>` +
          p.comandos
            .map(c => `<pre class="cmd">${esc(c.comando.length > 150 ? `${c.comando.slice(0, 150)}…` : c.comando)}</pre>${c.paraQue ? `<p class="para">${esc(c.paraQue)}</p>` : ''}`)
            .join('')
        : ''
      return `<div class="card paso"><span class="num">${i + 1}</span><div class="body"><h3>${esc(p.titulo)}</h3>${p.quePaso ? `<p class="que">${esc(p.quePaso)}</p>` : ''}${p.como ? `<div class="como"><b>Cómo funciona, en palabras simples</b><p>${esc(p.como)}</p></div>` : ''}${cambios}${comandos}</div></div>`
    })
    .join('')

  const decisiones = guia.decisiones
    .map(
      d =>
        `<div class="card decision" style="margin-bottom:12px"><h3>${esc(d.decision)}</h3><div class="porque"><b>Por qué:</b> ${esc(d.porque)}</div>${d.alternativa ? `<p class="alt">Otra opción que se descartó: ${esc(d.alternativa)}</p>` : ''}</div>`,
    )
    .join('')

  const verificar = guia.verificar
    .map(
      v =>
        `<div class="card check"><span class="box"></span><div><div>${esc(v.paso)}</div>${v.resultado ? `<div class="res">Deberías ver: ${esc(v.resultado)}</div>` : ''}</div></div>`,
    )
    .join('')

  const siguiente = guia.siguiente.length
    ? `<ul class="sig">${guia.siguiente.map(s => `<li><span class="flecha">${icono('siguiente', 18)}</span><span>${esc(s)}</span></li>`).join('')}</ul>`
    : ''

  const aprendes = guia.aprendes.length
    ? `<ul class="sig">${guia.aprendes.map(s => `<li><span class="flecha">${icono('aprendes', 18)}</span><span>${esc(s)}</span></li>`).join('')}</ul>`
    : ''
  const glosario = guia.glosario.length
    ? `<div class="card"><dl class="glos">${guia.glosario.map(t => `<dt>${esc(t.termino)}</dt><dd>${esc(t.significa)}</dd>`).join('')}</dl></div>`
    : ''

  const alcance = meta.alcance === 'sesion' ? 'Toda la sesión' : 'Última tarea'

  return `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(guia.titulo)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="page">
<header class="top">
<p class="kicker">Guía de lo que se hizo</p>
<h1>${esc(guia.titulo)}</h1>
<div class="meta"><span>${esc(alcance)}</span><span>${esc(meta.fecha)}</span><span>Proyecto: ${esc(meta.proyecto)}</span></div>
${meta.esEjemplo ? '<span class="ejemplo">EJEMPLO · datos inventados</span>' : ''}
</header>
${meta.aviso ? `<div class="aviso">${esc(meta.aviso)}</div>` : ''}
${guia.resumen.length ? seccion('', 'resumen', 'En resumen', `<div class="resumen">${resumen}</div>`) : ''}
${seccion('', 'pasos', 'Qué se hizo, paso a paso', pasos)}
${guia.decisiones.length ? seccion('', 'decisiones', 'Decisiones y por qué', decisiones) : ''}
${guia.verificar.length ? seccion('', 'verificar', 'Cómo comprobar que funciona', verificar) : ''}
${siguiente ? seccion('', 'siguiente', 'Qué sigue', siguiente) : ''}
${aprendes ? seccion('', 'aprendes', 'Lo que te llevas para la próxima', aprendes) : ''}
${glosario ? seccion('', 'glosario', 'Palabras que aparecen', glosario) : ''}
<footer>Generada con explica-guia en tu computadora. Para sacar el PDF: Imprimir y elegir «Guardar como PDF».</footer>
</div>
<button class="boton" onclick="window.print()">Imprimir o guardar como PDF</button>
</body>
</html>
`
}
