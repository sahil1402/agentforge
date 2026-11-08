import { create } from 'zustand'

export type ConsoleTab = 'trace' | 'waterfall' | 'output' | 'tests' | 'history' | 'code'

/** Shell chrome state shared by the rail, top bar and console (nothing here is persisted). */
interface UiState {
  consoleTab: ConsoleTab
  consoleOpen: boolean
  consoleHeight: number
  paletteOpen: boolean   // command palette (⌘K)
  runBoxOpen: boolean    // run input popover
  deployOpen: boolean
  toolsOpen: boolean
  openConsole: (tab?: ConsoleTab) => void
  setConsoleTab: (tab: ConsoleTab) => void
  setConsoleOpen: (open: boolean) => void
  setConsoleHeight: (height: number) => void
  setPaletteOpen: (open: boolean) => void
  setRunBoxOpen: (open: boolean) => void
  setDeployOpen: (open: boolean) => void
  setToolsOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>()((set) => ({
  consoleTab: 'trace',
  consoleOpen: false,
  consoleHeight: 300,
  paletteOpen: false,
  runBoxOpen: false,
  deployOpen: false,
  toolsOpen: false,
  openConsole: (tab) => set((s) => ({ consoleOpen: true, consoleTab: tab ?? s.consoleTab })),
  setConsoleTab: (consoleTab) => set({ consoleTab, consoleOpen: true }),
  setConsoleOpen: (consoleOpen) => set({ consoleOpen }),
  setConsoleHeight: (consoleHeight) => set({ consoleHeight }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setRunBoxOpen: (runBoxOpen) => set({ runBoxOpen }),
  setDeployOpen: (deployOpen) => set({ deployOpen }),
  setToolsOpen: (toolsOpen) => set({ toolsOpen }),
}))
