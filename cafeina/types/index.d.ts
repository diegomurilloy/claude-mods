declare module 'claude-code' {
  interface PluginState {
    cafeina: {
      /** Hasta cuándo (ms desde la época) se mantiene despierta; null si está apagada. */
      hastaMs: number | null
      /** Avanza cada minuto para redibujar la cuenta regresiva. */
      tick: number
      /** Oculta la fila sin apagar la cafeína. */
      isHidden: boolean
    }
  }
}
export type CafeinaHasta = number | null
