import { create } from 'zustand'
import type { AppSettings, CaptureSuggestion, EmbedProgress, SyncStatus } from '@shared/types'
import { hal } from '@/lib/ipc'

export type SidebarTab = 'files' | 'search' | 'tags'
export type RightTab = 'hal' | 'backlinks'
export type ViewMode = 'edit' | 'split' | 'preview'
export type AppMode = 'notes' | 'research' | 'review'

interface UiState {
  mode: AppMode
  sidebarTab: SidebarTab
  sidebarOpen: boolean
  rightTab: RightTab
  rightOpen: boolean
  viewMode: ViewMode
  graphOpen: boolean
  settingsOpen: boolean
  settings: AppSettings | null
  embeddingsReady: boolean
  embedProgress: EmbedProgress | null
  syncStatus: SyncStatus | null
  suggestions: Record<string, CaptureSuggestion>
  searchSeed: string

  setMode(mode: AppMode): void
  toggleGraph(): void
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
  addSuggestion(s: CaptureSuggestion): void
  dismissSuggestion(noteId: string): void
  seedSearch(q: string): void
}

export const useUi = create<UiState>((set, get) => ({
  mode: 'notes',
  sidebarTab: 'files',
  sidebarOpen: true,
  rightTab: 'hal',
  rightOpen: true,
  viewMode: 'split',
  graphOpen: false,
  settingsOpen: false,
  settings: null,
  embeddingsReady: false,
  embedProgress: null,
  syncStatus: null,
  suggestions: {},
  searchSeed: '',

  setMode: (mode) => set({ mode }),
  toggleGraph: () => set((s) => ({ graphOpen: !s.graphOpen })),
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
  addSuggestion: (s) => set((st) => ({ suggestions: { ...st.suggestions, [s.noteId]: s } })),
  dismissSuggestion: (noteId) =>
    set((st) => {
      const next = { ...st.suggestions }
      delete next[noteId]
      return { suggestions: next }
    }),
  seedSearch: (q) => {
    set({ searchSeed: q, sidebarTab: 'search', sidebarOpen: true })
  }
}))

export async function loadSettings(): Promise<void> {
  const s = await hal.settingsGet()
  useUi.setState({ viewMode: s.defaultViewMode })
  useUi.getState().applySettings(s)
  await useUi.getState().refreshEmbeddingsReady()
}
