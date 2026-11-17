/** Una cosa que Claude hizo y que la guía puede contar: un archivo tocado o un comando corrido. */
export type ExplicaGuiaEvento = {
  /** Número de la petición (turno) en la que pasó; /explica sin argumentos usa la última con trabajo. */
  turno: number
  tipo: 'archivo' | 'comando'
  /** La ruta del archivo o el comando (recortado y sin secretos evidentes). */
  texto: string
  /** Solo en archivos: «escrito» (archivo nuevo o reemplazado) o «editado». */
  accion?: 'escrito' | 'editado'
  /** Hora (ms desde la época). */
  ms: number
}

declare module 'claude-code' {
  interface PluginState {
    'explica-guia': {
      /** Registro de archivos y comandos de la sesión (los últimos 400). */
      registro: ExplicaGuiaEvento[]
      /** Cuántas peticiones de la persona van en la sesión (los comandos con / no cuentan). */
      turno: number
      /** Oculta el botón de arriba del prompt. */
      isHidden: boolean
      /** Hay una guía armándose ahora mismo. */
      trabajando: boolean
    }
  }
}
