export type Busy = boolean

declare module 'claude-code' {
  interface PluginState {
    'prompt-enhancer': { isBusy: Busy; isHidden: boolean }
  }
}
