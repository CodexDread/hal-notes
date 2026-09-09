import { create } from 'zustand'
import type { AppSettings, CaptureSuggestion, EmbedProgress, SyncStatus } from '@shared/types'
import { hal } from '@/lib/ipc'

export type SidebarTab = 'files' | 'search' | 'tags'
export type RightTab = 'hal' | 'backlinks'
export type ViewMode = 'edit' | 'split' | 'preview'

interface UiState {
  sidebarTab: SidebarTab
  sidebarOpen: boolean
  rightTab: RightTab
  rightOpen: boolean
  viewMode: ViewMode
  settingsOpen: boolean
  settings: AppSettings | null
  embeddingsReady: boolean
  embedProgress: EmbedProgress | null
  syncStatus: SyncStatus | null
  suggestion: CaptureSuggestion | null
  searchSeed: string

  setSidebarTab(tab: SidebarTab): void
  toggleSidebar(): void
  setRightTab(tab: RightTab): void
  toggleRight(): void
  setViewMode(mode: ViewMode): void
  openSettings(): void
  closeSettings(): void
  applySettings(s: AppSettings): void
  refreshEmbeddingsReady(): Promise<void>
  setEmbedProgress(p: EmbedProgress | null): void
  setSyncStatus(s: SyncStatus): void
  setSuggestion(s: CaptureSuggestion | null): void
  seedSearch(q: string): void
}

export const useUi = create<UiState>((set, get) => ({
  sidebarTab: 'files',
  sidebarOpen: true,
  rightTab: 'hal',
  rightOpen: true,
  viewMode: 'split',
  settingsOpen: false,
  settings: null,
  embeddingsReady: false,
  embedProgress: null,
  syncStatus: null,
  suggestion: null,
  searchSeed: '',

  setSidebarTab: (tab) => set({ sidebarTab: tab, sidebarOpen: true }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setRightTab: (tab) => set({ rightTab: tab, rightOpen: true }),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  setViewMode: (mode) => set({ viewMode: mode }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  applySettings: (s) => set({ settings: s }),
  refreshEmbeddingsReady: async () => {
    set({ embeddingsReady: await hal.embeddingsReady().catch(() => false) })
  },
  setEmbedProgress: (p) => set({ embedProgress: p }),
  setSyncStatus: (s) => set({ syncStatus: s }),
  setSuggestion: (s) => set({ suggestion: s }),
  seedSearch: (q) => {
    set({ searchSeed: q, sidebarTab: 'search', sidebarOpen: true })
  }
}))

export async function loadSettings(): Promise<void> {
  const s = await hal.settingsGet()
  useUi.getState().applySettings(s)
  await useUi.getState().refreshEmbeddingsReady()
}
