export type MedidorVentana = { kind: string; percentUsed: number; resetsAt?: string }
export type MedidorLectura = { rateLimits: MedidorVentana[]; costUsd?: number }

declare module 'claude-code' {
  interface PluginState {
    'medidor-uso': {
      snapshot: MedidorLectura | null
      tick: number
      warned: Record<string, number>
      isHidden: boolean
    }
  }
}
