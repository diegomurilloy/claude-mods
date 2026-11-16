// Las escenas: cada una es un SVG animado solo con CSS (sin scripts). Desktop los dibuja en un
// marco aislado. Para que no se congele en Desktop, las animaciones mueven solo translate y
// opacity, con easing por palabra clave (linear, ease-in-out) y sin fill-mode.

export type Escena = {
  nombre: string
  descripcion: string
  modo: 'light' | 'dark'
  svg: () => string
}

// Números repetibles: la misma escena se dibuja igual cada vez.
function azar(semilla: number) {
  let s = semilla >>> 0
  const siguiente = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  return {
    entre: (a: number, b: number) => a + siguiente() * (b - a),
    de: <T>(lista: readonly T[]) => lista[Math.floor(siguiente() * lista.length)] as T,
  }
}

const abre = (css: string, defs: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs><style>${css}</style>`

// ---------- acuarela: manchas de pigmento que flotan sobre papel (claro) ----------
function acuarela(): string {
  const manchas = [
    { id: 'az', c: '#7fb6df', x: 260, y: 220, rx: 560, ry: 400, dx: 280, dy: 150, t: 38 },
    { id: 'co', c: '#e9937a', x: 1320, y: 240, rx: 500, ry: 360, dx: -240, dy: 180, t: 44 },
    { id: 'sa', c: '#9cc59b', x: 760, y: 760, rx: 620, ry: 340, dx: 300, dy: -120, t: 52 },
    { id: 'oc', c: '#e8c470', x: 1380, y: 800, rx: 460, ry: 300, dx: -320, dy: -90, t: 41 },
    { id: 'vi', c: '#a99be0', x: 180, y: 820, rx: 440, ry: 320, dx: 260, dy: -160, t: 47 },
    { id: 'az2', c: '#8fc8d8', x: 820, y: 180, rx: 420, ry: 260, dx: -200, dy: 120, t: 36 },
  ]
  const defs =
    `<linearGradient id="papel" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#f8f1e5"/><stop offset="1" stop-color="#efe4d1"/></linearGradient>` +
    manchas
      .map(
        m =>
          `<radialGradient id="${m.id}"><stop offset="0" stop-color="${m.c}" stop-opacity="0.78"/><stop offset="0.62" stop-color="${m.c}" stop-opacity="0.34"/><stop offset="1" stop-color="${m.c}" stop-opacity="0"/></radialGradient>`,
      )
      .join('')
  const css =
    `.m{animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}` +
    manchas
      .map((m, i) => `@keyframes d${i}{from{transform:translate(0px,0px)}to{transform:translate(${m.dx}px,${m.dy}px)}}`)
      .join('') +
    `@keyframes sube{from{transform:translate(0px,0px);opacity:0.15}to{transform:translate(30px,-90px);opacity:0.55}}` +
    `.p{animation:sube 9s ease-in-out infinite alternate}`
  const r = azar(7)
  const motas = Array.from({ length: 46 }, () => {
    const color = r.de(['#6fa3c9', '#d97f68', '#86b385', '#d6b35c', '#9585d1'])
    return `<circle class="p" cx="${Math.round(r.entre(40, 1560))}" cy="${Math.round(r.entre(60, 940))}" r="${r.entre(2, 6).toFixed(1)}" fill="${color}" style="animation-delay:-${r.entre(0, 9).toFixed(1)}s;animation-duration:${r.entre(7, 14).toFixed(1)}s"/>`
  }).join('')
  const grupos = manchas
    .map(
      (m, i) =>
        `<g class="m" style="animation-name:d${i};animation-duration:${m.t}s"><ellipse cx="${m.x}" cy="${m.y}" rx="${m.rx}" ry="${m.ry}" fill="url(#${m.id})"/><ellipse cx="${m.x}" cy="${m.y}" rx="${Math.round(m.rx * 0.74)}" ry="${Math.round(m.ry * 0.74)}" fill="none" stroke="${m.c}" stroke-opacity="0.16" stroke-width="3"/></g>`,
    )
    .join('')
  return `${abre(css, defs)}<rect width="1600" height="1000" fill="url(#papel)"/>${grupos}${motas}</svg>`
}

// ---------- geometría para dibujar con caracteres ----------
type Pt = [number, number]

const dentro = (p: Pt, poli: Pt[]): boolean => {
  let c = false
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [xi, yi] = poli[i] as Pt
    const [xj, yj] = poli[j] as Pt
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

const distSeg = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

const distPoli = (p: Pt, poli: Pt[]): number => {
  let m = Infinity
  for (let i = 0; i < poli.length; i++) m = Math.min(m, distSeg(p, poli[i] as Pt, poli[(i + 1) % poli.length] as Pt))
  return m
}

// Suaviza un contorno cerrado (cortes de esquina de Chaikin).
function suaviza(poli: Pt[], vueltas: number): Pt[] {
  let q = poli
  for (let v = 0; v < vueltas; v++) {
    const n: Pt[] = []
    for (let i = 0; i < q.length; i++) {
      const a = q[i] as Pt
      const b = q[(i + 1) % q.length] as Pt
      n.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    q = n
  }
  return q
}

// ---------- ascii: monarcas hechas de caracteres sobre un fondo marrón cálido (oscuro) ----------
// Ala izquierda de una monarca vista desde arriba, con el cuerpo en el origen. La derecha es su espejo.
const ALA_ANTERIOR = suaviza(
  [[0, -8], [-30, -62], [-84, -140], [-150, -196], [-212, -204], [-246, -160], [-236, -92], [-196, -40], [-132, -4], [-60, 10], [0, 12]],
  2,
)
const ALA_POSTERIOR = suaviza(
  [[0, 8], [-70, 0], [-140, 18], [-182, 62], [-170, 118], [-118, 156], [-62, 138], [-24, 96], [-6, 50]],
  2,
)
const VENAS: [Pt, Pt][] = [
  [[0, -4], [-226, -176]], [[0, -2], [-214, -126]], [[0, 0], [-196, -72]], [[0, 2], [-150, -14]],
  [[-60, -58], [-60, -150]], [[-100, -100], [-150, -158]],
  [[0, 12], [-166, 62]], [[0, 16], [-142, 124]], [[0, 20], [-86, 136]], [[0, 24], [-40, 116]],
]

const CEL_W = 7.8
const CEL_H = 13

function pintaAla(poli: Pt[], semilla: number): string {
  const r = azar(semilla)
  const xs = poli.map(p => p[0])
  const ys = poli.map(p => p[1])
  const x0 = Math.floor(Math.min(...xs) / CEL_W) * CEL_W
  const x1 = Math.max(...xs)
  const y0 = Math.floor(Math.min(...ys) / CEL_H) * CEL_H
  const y1 = Math.max(...ys)
  const naranjas = ['#ff9a2e', '#f2801f', '#ffb85e', '#e56f12']
  const out: string[] = []
  for (let y = y0; y <= y1; y += CEL_H) {
    let run = ''
    let color = ''
    let inicio = 0
    const cierra = () => {
      if (run) out.push(`<text x="${inicio.toFixed(1)}" y="${(y + CEL_H).toFixed(1)}" fill="${color}">${run}</text>`)
      run = ''
    }
    for (let x = x0; x <= x1; x += CEL_W) {
      const c: Pt = [x + CEL_W / 2, y + CEL_H / 2]
      let ch = ''
      let col = ''
      if (dentro(c, poli)) {
        const d = distPoli(c, poli)
        if (d < 9) {
          ch = r.de(['*', '.', ':', '*', '.'])
          col = '#ffe3c2'
        } else if (d < 17) {
          if (r.entre(0, 1) < 0.22) {
            ch = r.de(['.', ':', "'"])
            col = '#ffcf9a'
          }
        } else if (!VENAS.some(([a, b]) => distSeg(c, a, b) < 6)) {
          ch = '/'
          // bandas suaves de tono, como el degradado de la ala
          const t = Math.sin(c[0] * 0.05) + Math.cos(c[1] * 0.07)
          col = naranjas[t > 0.7 ? 2 : t > -0.2 ? 0 : t > -1 ? 1 : 3] as string
        }
      }
      if (ch && color !== col) cierra()
      if (ch) {
        if (!run) inicio = x
        color = col
        run += ch
      } else cierra()
    }
    cierra()
  }
  return out.join('')
}

function monarca(): string {
  const cuerpo = [-40, -26, -12, 2, 16, 30, 44, 58]
    .map((y, k) => `<text x="-3.9" y="${y}" fill="${k < 2 ? '#fff0dc' : '#f9cf9c'}">${k < 2 ? '0' : 'o'}</text>`)
    .join('')
  const antenas =
    `<path d="M-1,-36 C-12,-72 -28,-96 -52,-112 M1,-36 C14,-70 34,-92 58,-104" fill="none" stroke="#ffd9a8" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/>` +
    `<circle cx="-52" cy="-112" r="3.2" fill="#ffe9cf"/><circle cx="58" cy="-104" r="3.2" fill="#ffe9cf"/>`
  return pintaAla(ALA_ANTERIOR, 5) + pintaAla(ALA_POSTERIOR, 9) + cuerpo + antenas
}

function ascii(): string {
  const r = azar(11)
  const alas = monarca()
  const naranja = '<use href="#ala"/>'
  // una monarca: vuela en diagonal con aleteo; cada una con su tamaño, ruta y ritmo
  const vuelos = [
    { s: 1.35, x: -320, y: 1040, t: 30, ang: 50 },
    { s: 0.95, x: -240, y: 820, t: 26, ang: 46 },
    { s: 0.7, x: 160, y: 1080, t: 34, ang: 56 },
    { s: 0.55, x: -120, y: 600, t: 22, ang: 44 },
    { s: 0.85, x: 640, y: 1100, t: 38, ang: 52 },
    { s: 0.45, x: 360, y: 780, t: 28, ang: 48 },
  ].map((m, i) => {
    const rec = 1900
    const pts = [0, 1, 2, 3, 4, 5].map(k => {
      const f = k / 5
      return [m.x + f * rec, m.y - f * rec * 0.62 + Math.sin(f * 9 + i * 1.3) * 70] as const
    })
    const kf = pts
      .map(([x, y], k) => `${k * 20}%{transform:translate(${Math.round(x)}px,${Math.round(y)}px);opacity:${k === 0 || k === 5 ? 0 : 0.95}}`)
      .join('')
    const aleteo = r.entre(0.32, 0.5).toFixed(2)
    return {
      css: `@keyframes v${i}{${kf}}`,
      svg:
        `<g style="animation:v${i} ${m.t}s linear -${(m.t * (i / 6.2)).toFixed(1)}s infinite">` +
        `<g class="bob" style="animation-duration:${r.entre(1.2, 2).toFixed(2)}s"><g transform="rotate(${m.ang}) scale(${m.s})">` +
        `<g class="aleta" style="animation-duration:${aleteo}s">${naranja}</g>` +
        `<g transform="scale(-1,1)"><g class="aleta" style="animation-duration:${aleteo}s">${naranja}</g></g>` +
        `<use href="#cuerpo"/></g></g></g>`,
    }
  })
  const bits = Array.from({ length: 90 }, () =>
    `<text class="bit" x="${Math.round(r.entre(10, 1590))}" y="${Math.round(r.entre(20, 990))}" style="animation-duration:${r.entre(3, 9).toFixed(1)}s;animation-delay:-${r.entre(0, 9).toFixed(1)}s">${r.de(['0', '1', '01', '10', '1', '0'])}</text>`,
  ).join('')
  const brillos = Array.from({ length: 26 }, () =>
    `<text class="bit" x="${Math.round(r.entre(10, 1590))}" y="${Math.round(r.entre(20, 990))}" fill="#ffc98a" style="font-size:18px;animation-duration:${r.entre(2, 5).toFixed(1)}s;animation-delay:-${r.entre(0, 5).toFixed(1)}s">+</text>`,
  ).join('')
  const estelas = [
    'M-40,900 C300,820 520,860 780,700 S1250,420 1640,300',
    'M-40,640 C240,600 460,640 700,520 S1100,300 1640,120',
    'M300,1040 C560,960 820,980 1060,820 S1440,620 1640,560',
  ]
    .map(d => `<path class="estela" d="${d}" fill="none" stroke="#ffb066" stroke-width="2" stroke-dasharray="2 9" stroke-linecap="round"/>`)
    .join('')
  const css =
    `text{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px}` +
    `@keyframes parpadea{from{opacity:0.04}to{opacity:0.3}}` +
    `@keyframes aleteo{0%{transform:scaleX(1)}40%{transform:scaleX(0.92)}100%{transform:scaleX(0.4)}}` +
    `@keyframes flota{from{transform:translateY(-10px)}to{transform:translateY(12px)}}` +
    `@keyframes late{from{opacity:0.15}to{opacity:0.5}}` +
    `.bit{font-size:15px;fill:#b8793c;animation-name:parpadea;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}` +
    `.aleta{animation-name:aleteo;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}` +
    `.bob{animation-name:flota;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}` +
    `.estela{animation:late 7s ease-in-out infinite alternate}` +
    vuelos.map(v => v.css).join('')
  const defs =
    `<g id="ala">${alas.slice(0, alas.indexOf('<text x="-3.9"'))}</g>` +
    `<g id="cuerpo">${alas.slice(alas.indexOf('<text x="-3.9"'))}</g>` +
    `<radialGradient id="fondo" cx="0.72" cy="0.3" r="0.95"><stop offset="0" stop-color="#3c2515"/><stop offset="0.5" stop-color="#1d110a"/><stop offset="1" stop-color="#0c0704"/></radialGradient>` +
    `<radialGradient id="brasa" cx="0.9" cy="0.95" r="0.5"><stop offset="0" stop-color="#4a2a15" stop-opacity="0.7"/><stop offset="1" stop-color="#4a2a15" stop-opacity="0"/></radialGradient>`
  return `${abre(css, defs)}<rect width="1600" height="1000" fill="url(#fondo)"/><rect width="1600" height="1000" fill="url(#brasa)"/>${bits}${estelas}${brillos}${vuelos.map(v => v.svg).join('')}</svg>`
}

// ---------- laponia: aurora boreal, cabaña con humo, bosque nevado y lago helado (oscuro) ----------
function laponia(): string {
  const r = azar(31)
  const defs =
    `<linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#030613"/><stop offset="0.45" stop-color="#0a1731"/><stop offset="0.8" stop-color="#14304b"/><stop offset="1" stop-color="#1d4358"/></linearGradient>` +
    `<linearGradient id="rayo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8dffb8" stop-opacity="0.9"/><stop offset="0.35" stop-color="#37e08c" stop-opacity="0.5"/><stop offset="1" stop-color="#1fb7a0" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="rayoV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8a6ff" stop-opacity="0.8"/><stop offset="0.4" stop-color="#7f8cf5" stop-opacity="0.4"/><stop offset="1" stop-color="#3fb6c8" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="rayoT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ff5e0" stop-opacity="0.6"/><stop offset="0.5" stop-color="#2fc3d6" stop-opacity="0.25"/><stop offset="1" stop-color="#2b7fd0" stop-opacity="0"/></linearGradient>` +
    `<radialGradient id="halo"><stop offset="0" stop-color="#4dffa6" stop-opacity="0.46"/><stop offset="1" stop-color="#4dffa6" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="nieve" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbe8f6"/><stop offset="1" stop-color="#8aa6c4"/></linearGradient>` +
    `<linearGradient id="lago" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27506a"/><stop offset="1" stop-color="#143247"/></linearGradient>` +
    `<radialGradient id="luz"><stop offset="0" stop-color="#ffc75e" stop-opacity="0.85"/><stop offset="1" stop-color="#ff9f3a" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="bokeh"><stop offset="0" stop-color="#e6f1ff" stop-opacity="0.5"/><stop offset="1" stop-color="#e6f1ff" stop-opacity="0"/></radialGradient>` +
    // un pino: seis pisos con nieve encima de cada uno
    `<g id="pino">` +
    [0, 1, 2, 3, 4, 5]
      .map(i => {
        const base = 150 - i * 62
        const ancho = 92 - i * 12
        const tope = base - 92
        return `<polygon points="0,${tope} ${ancho},${base} -${ancho},${base}" fill="#0e2a30"/><polygon points="0,${tope} ${Math.round(ancho * 0.62)},${tope + 52} ${Math.round(ancho * 0.2)},${tope + 44} 0,${tope + 70} -${Math.round(ancho * 0.3)},${tope + 46} -${Math.round(ancho * 0.62)},${tope + 52}" fill="#e8f1fb" fill-opacity="0.9"/>`
      })
      .join('') +
    `<rect x="-9" y="150" width="18" height="30" fill="#2a1a12"/></g>`

  const estrellas = Array.from({ length: 110 }, () =>
    `<circle class="e" cx="${Math.round(r.entre(10, 1590))}" cy="${Math.round(r.entre(10, 600))}" r="${r.entre(0.8, 2.4).toFixed(1)}" fill="#eef4ff" style="animation-duration:${r.entre(2.5, 7).toFixed(1)}s;animation-delay:-${r.entre(0, 7).toFixed(1)}s"/>`,
  ).join('')

  // aurora: una cinta que sube desde la izquierda y se curva arriba a la derecha, hecha de cortinas
  const borde = (x: number) => {
    const f = (x - 180) / 1400
    return 520 - 330 * Math.sin(f * Math.PI * 0.92) + 34 * Math.sin(x / 85) + 18 * Math.sin(x / 41)
  }
  // altura de los rayos con ruido coherente: rayos vecinos se parecen, como en una cortina real
  const altura = (x: number, q: ReturnType<typeof azar>) =>
    170 + 110 * Math.sin(x / 63) * Math.sin(x / 151 + 1) + 70 * Math.sin(x / 29 + 2) + q.entre(-30, 30)
  const cortinas = (desde: number, hasta: number, relleno: string, semilla: number, ancho: number, desfase: number) => {
    const q = azar(semilla)
    const partes: string[] = []
    for (let x = desde; x < hasta; x += ancho) {
      const h = Math.max(70, altura(x, q))
      const y0 = borde(x) + desfase
      const y1 = borde(x + ancho) + desfase
      const f = (x - desde) / (hasta - desde)
      // los extremos de la cinta se desvanecen en vez de cortarse
      const envolvente = Math.min(1, Math.sin(f * Math.PI) * 2.2)
      const brillo = q.entre(0.5, 1) * envolvente
      partes.push(
        `<polygon points="${x},${y0.toFixed(0)} ${x + ancho},${y1.toFixed(0)} ${x + ancho},${(y1 + h * q.entre(0.85, 1.1)).toFixed(0)} ${x},${(y0 + h).toFixed(0)}" fill="url(#${relleno})" fill-opacity="${brillo.toFixed(2)}"/>`,
      )
    }
    return partes.join('')
  }
  const lineaBorde = (desde: number, hasta: number, color: string, grosor: number, op: number, desfase: number) => {
    const pts: string[] = []
    for (let x = desde; x <= hasta; x += 20) pts.push(`${x},${(borde(x) + desfase).toFixed(0)}`)
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="${grosor}" stroke-opacity="${op}" stroke-linecap="round" stroke-linejoin="round"/>`
  }
  const aurora =
    `<ellipse cx="900" cy="300" rx="900" ry="320" fill="url(#halo)"/>` +
    `<ellipse cx="560" cy="560" rx="420" ry="200" fill="url(#halo)" opacity="0.55"/>` +
    `<g class="a1">${cortinas(200, 1580, 'rayo', 3, 10, 0)}${lineaBorde(200, 1580, '#7dffb4', 34, 0.1, 0)}${lineaBorde(200, 1580, '#9dffc4', 12, 0.22, 0)}${lineaBorde(200, 1580, '#eafff2', 4, 0.8, 0)}</g>` +
    `<g class="a2">${cortinas(240, 1500, 'rayo', 8, 16, 70)}${lineaBorde(240, 1500, '#5ff0c0', 8, 0.35, 70)}</g>` +
    `<g class="a3">${cortinas(1000, 1580, 'rayoV', 12, 12, -20)}${lineaBorde(1000, 1580, '#d7bfff', 6, 0.5, -20)}</g>` +
    `<g class="a4">${cortinas(120, 900, 'rayoT', 17, 18, 150)}</g>`

  const montanas =
    `<path d="M700,720 L930,520 L1040,600 L1220,380 L1400,560 L1500,500 L1600,560 L1600,780 L700,780 Z" fill="#2a4560"/>` +
    `<path d="M1220,380 L1150,470 L1190,452 L1225,500 L1262,452 L1305,474 Z M930,520 L880,580 L925,566 L960,596 Z M1500,500 L1450,560 L1490,548 L1530,572 Z" fill="#e6eef8"/>` +
    `<path d="M0,760 L150,640 L300,720 L450,610 L620,730 L760,680 L760,790 L0,790 Z" fill="#223b55"/>`

  const lago = `<path d="M560,800 C760,770 1060,770 1320,790 C1400,800 1320,850 1100,858 C840,866 640,850 560,800 Z" fill="url(#lago)"/><ellipse cx="1000" cy="814" rx="380" ry="16" fill="#4dffa6" fill-opacity="0.26"/><ellipse cx="900" cy="822" rx="220" ry="9" fill="#bfffe0" fill-opacity="0.22"/>`

  const filaPinos = (n: number, y0: number, y1: number, e0: number, e1: number, op: number) =>
    Array.from({ length: n }, (_, k) => {
      const x = Math.round((k + 0.5) * (1600 / n) + r.entre(-30, 30))
      return `<use href="#pino" transform="translate(${x} ${Math.round(r.entre(y0, y1))}) scale(${r.entre(e0, e1).toFixed(2)})" opacity="${op}"/>`
    }).join('')

  const suelo = `<path d="M0,830 C260,800 560,850 860,826 C1140,804 1400,846 1600,816 L1600,1000 L0,1000 Z" fill="url(#nieve)"/>`
  const sendero = `<path d="M470,1000 C520,930 600,880 560,845 C620,880 760,920 880,1000 Z" fill="#ffe3a4" fill-opacity="0.35"/>`

  const humos = Array.from({ length: 7 }, (_, i) =>
    `<circle class="humo" cx="${512 + (i % 3) * 6}" cy="590" r="${16 + i * 4}" fill="#f4f8ff" style="animation-duration:${(8 + i * 0.7).toFixed(1)}s;animation-delay:-${(i * 1.25).toFixed(2)}s"/>`,
  ).join('')

  const troncos = [0, 1, 2, 3, 4, 5, 6].map(i => `<line x1="320" y1="${712 + i * 14}" x2="560" y2="${712 + i * 14}" stroke="#3a2214" stroke-width="3"/>`).join('')
  const cabana =
    `<ellipse cx="470" cy="842" rx="300" ry="62" fill="url(#luz)" opacity="0.6"/>` +
    sendero +
    `<rect x="320" y="702" width="240" height="116" fill="#6b4328"/>${troncos}` +
    `<rect x="496" y="580" width="34" height="76" fill="#4a2c1b"/><rect x="490" y="572" width="46" height="14" fill="#eef4fb"/>` +
    `<polygon points="290,712 440,596 590,712" fill="#3a2316"/><polygon points="282,716 440,586 598,716 586,722 440,604 294,722" fill="#f2f7fc"/>` +
    `<polygon points="318,700 440,606 562,700" fill="#f7fbff" fill-opacity="0.92"/>` +
    `<rect x="344" y="740" width="62" height="52" fill="#ffc861"/><rect x="344" y="740" width="62" height="52" fill="none" stroke="#3a2214" stroke-width="5"/><line x1="375" y1="740" x2="375" y2="792" stroke="#3a2214" stroke-width="4"/><line x1="344" y1="766" x2="406" y2="766" stroke="#3a2214" stroke-width="4"/>` +
    `<rect x="452" y="740" width="58" height="52" fill="#ffc861"/><rect x="452" y="740" width="58" height="52" fill="none" stroke="#3a2214" stroke-width="5"/><line x1="481" y1="740" x2="481" y2="792" stroke="#3a2214" stroke-width="4"/>` +
    `<ellipse cx="408" cy="768" rx="100" ry="70" fill="url(#luz)" opacity="0.5"/>` +
    `<rect x="310" y="810" width="260" height="16" fill="#e9f1fa"/>` + humos

  const copos = Array.from({ length: 130 }, () => {
    const x = Math.round(r.entre(0, 1600))
    return `<circle cx="${x}" cy="0" r="${r.entre(1.2, 3.6).toFixed(1)}" fill="#fff" fill-opacity="${r.entre(0.5, 0.95).toFixed(2)}" style="animation:cae${Math.floor(r.entre(0, 3))} ${r.entre(9, 21).toFixed(1)}s linear -${r.entre(0, 21).toFixed(1)}s infinite"/>`
  }).join('')
  const bokeh = Array.from({ length: 9 }, () =>
    `<circle cx="${Math.round(r.entre(0, 1600))}" cy="${Math.round(r.entre(0, 900))}" r="${r.entre(14, 40).toFixed(0)}" fill="url(#bokeh)" style="animation:cae${Math.floor(r.entre(0, 3))} ${r.entre(26, 48).toFixed(0)}s linear -${r.entre(0, 40).toFixed(0)}s infinite"/>`,
  ).join('')

  const css =
    `@keyframes brilla{from{opacity:0.15}to{opacity:1}}.e{animation:brilla 4s ease-in-out infinite alternate}` +
    `@keyframes oleaje{from{transform:translate(-26px,0px);opacity:0.7}to{transform:translate(26px,6px);opacity:1}}` +
    `@keyframes respira{from{opacity:0.62}to{opacity:1}}` +
    `.a1{animation:oleaje 11s ease-in-out infinite alternate,respira 5.5s ease-in-out infinite alternate}` +
    `.a2{animation:oleaje 16s ease-in-out -6s infinite alternate,respira 7s ease-in-out -2s infinite alternate;opacity:0.75}` +
    `.a3{animation:oleaje 13s ease-in-out -3s infinite alternate,respira 6s ease-in-out -4s infinite alternate}` +
    `.a4{animation:oleaje 19s ease-in-out -9s infinite alternate,respira 8s ease-in-out -1s infinite alternate;opacity:0.7}` +
    `@keyframes sube{from{transform:translate(0px,0px);opacity:0.5}to{transform:translate(70px,-230px);opacity:0}}` +
    `.humo{animation-name:sube;animation-timing-function:linear;animation-iteration-count:infinite}` +
    `@keyframes cae0{from{transform:translate(0px,-40px)}to{transform:translate(60px,1060px)}}` +
    `@keyframes cae1{from{transform:translate(0px,-40px)}to{transform:translate(-50px,1060px)}}` +
    `@keyframes cae2{from{transform:translate(0px,-40px)}to{transform:translate(20px,1060px)}}`

  return (
    `${abre(css, defs)}<rect width="1600" height="1000" fill="url(#cielo)"/>${estrellas}${aurora}${montanas}` +
    `${filaPinos(22, 760, 790, 0.5, 0.7, 0.55)}${lago}${filaPinos(14, 790, 830, 0.8, 1.05, 0.9)}${suelo}${cabana}` +
    `<use href="#pino" transform="translate(110 900) scale(2.3)"/><use href="#pino" transform="translate(300 940) scale(1.7)"/><use href="#pino" transform="translate(1490 910) scale(2.2)"/><use href="#pino" transform="translate(1330 950) scale(1.5)"/>` +
    `${copos}${bokeh}</svg>`
  )
}

export type NombreEscena = 'acuarela' | 'ascii' | 'laponia'

export const ESCENAS: Record<NombreEscena, Escena> = {
  acuarela: { nombre: 'acuarela', descripcion: 'manchas de pigmento flotando sobre papel (claro)', modo: 'light', svg: acuarela },
  ascii: { nombre: 'ascii', descripcion: 'mariposas monarca hechas de caracteres sobre marrón cálido (oscuro)', modo: 'dark', svg: ascii },
  laponia: { nombre: 'laponia', descripcion: 'aurora boreal, cabaña con humo, bosque nevado y lago helado (oscuro)', modo: 'dark', svg: laponia },
}

/** La escena con ese nombre, o nada si no existe. */
export function escena(nombre: string): Escena | undefined {
  return Object.prototype.hasOwnProperty.call(ESCENAS, nombre) ? ESCENAS[nombre as NombreEscena] : undefined
}
