import { create } from 'zustand'
import type { DueCard, PathDetail, ResearchCitation, ResearchNotebook, ResearchNotebookDetail } from '@shared/types'
import { hal } from '@/lib/ipc'

export type ResearchTab = 'sources' | 'chat' | 'paths' | 'review'

interface ResearchState {
  loaded: boolean
  notebooks: ResearchNotebook[]
  activeId: string | null
  detail: ResearchNotebookDetail | null
  activeTab: ResearchTab
  activePathId: string | null
  pathDetail: PathDetail | null
  chatBusy: boolean
  chatError: string | null
  streamId: string | null
  streamText: string
  dueCards: DueCard[]

  load(): Promise<void>
  open(id: string): Promise<void>
  create(name: string): Promise<void>
  rename(id: string, name: string): Promise<void>
  remove(id: string): Promise<void>
  setActiveTab(tab: ResearchTab): void
  openPath(pathId: string): Promise<void>
  closePath(): void
  startPath(topic: string): Promise<void>
  refreshActive(): Promise<void>
  refreshPath(): Promise<void>
  ask(question: string): Promise<void>
  onChatDelta(id: string, delta: string): void
  onChatDone(id: string): void
  onChatError(id: string, error: string): void
  loadDue(): Promise<void>
}

export const useResearch = create<ResearchState>((set, get) => ({
  loaded: false,
  notebooks: [],
  activeId: null,
  detail: null,
  activeTab: 'paths',
  activePathId: null,
  pathDetail: null,
  chatBusy: false,
  chatError: null,
  streamId: null,
  streamText: '',
  dueCards: [],

  load: async () => {
    const notebooks = await hal.researchList()
    const last = localStorage.getItem('hal.research.notebook')
    set({ notebooks, loaded: true })
    const target = notebooks.find((n) => n.id === last) ?? notebooks[0]
    if (target) await get().open(target.id)
  },

  open: async (id) => {
    set({ activeId: id, activePathId: null, pathDetail: null, chatError: null })
    localStorage.setItem('hal.research.notebook', id)
    const detail = await hal.researchGet(id)
    set({ detail })
    void get().loadDue()
  },

  create: async (name) => {
    const notebook = await hal.researchCreate(name)
    set({ notebooks: await hal.researchList() })
    await get().open(notebook.id)
  },

  rename: async (id, name) => {
    await hal.researchRename(id, name)
    set({ notebooks: await hal.researchList() })
    if (get().activeId === id) {
      const detail = await hal.researchGet(id)
      set({ detail })
    }
  },

  remove: async (id) => {
    await hal.researchDelete(id)
    const notebooks = await hal.researchList()
    set({ notebooks })
    if (get().activeId === id) {
      const next = notebooks[0]
      if (next) await get().open(next.id)
      else set({ activeId: null, detail: null, activePathId: null, pathDetail: null })
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  openPath: async (pathId) => {
    set({ activePathId: pathId })
    await get().refreshPath()
  },

  closePath: () => set({ activePathId: null, pathDetail: null }),

  startPath: async (topic) => {
    const { activeId } = get()
    if (!activeId || !topic.trim()) return
    const row = await hal.researchStartPath(activeId, topic.trim())
    await get().refreshActive()
    await get().openPath(row.id)
  },

  refreshActive: async () => {
    const { activeId } = get()
    if (!activeId) return
    const detail = await hal.researchGet(activeId)
    set({ detail, notebooks: await hal.researchList() })
  },

  refreshPath: async () => {
    const { activePathId } = get()
    if (!activePathId) return
    const pathDetail = await hal.researchGetPath(activePathId)
    set({ pathDetail })
  },

  ask: async (question) => {
    const { activeId, detail, chatBusy } = get()
    if (!activeId || chatBusy || !question.trim()) return
    const id = crypto.randomUUID()
    const history = (detail?.messages ?? [])
      .slice(-6)
      .map((m) => ({ role: m.role, text: m.text }))
    set({ chatBusy: true, chatError: null, streamId: id, streamText: '' })
    try {
      await hal.researchChat(id, activeId, question, history)
    } catch (err) {
      get().onChatError(id, err instanceof Error ? err.message : String(err))
    }
  },

  onChatDelta: (id, delta) => {
    if (get().streamId !== id) return
    set((s) => ({ streamText: s.streamText + delta }))
  },

  onChatDone: (id) => {
    if (get().streamId !== id) return
    set({ streamId: null, streamText: '', chatBusy: false })
    void get().refreshActive()
  },

  onChatError: (id, error) => {
    if (get().streamId !== id) return
    set({ streamId: null, streamText: '', chatBusy: false, chatError: error })
  },

  loadDue: async () => {
    const { activeId } = get()
    if (!activeId) return
    set({ dueCards: await hal.researchDueCards(activeId).catch(() => []) })
  }
}))
