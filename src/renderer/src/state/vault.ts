import { create } from 'zustand'
import type { Backlink, TagCount, VaultSnapshot } from '@shared/types'
import { hal } from '@/lib/ipc'

let saveTimer: ReturnType<typeof setTimeout> | null = null
const SAVE_DEBOUNCE_MS = 700

interface VaultState {
  snapshot: VaultSnapshot
  tagCounts: TagCount[]
  activeId: string | null
  activeContent: string
  dirty: boolean
  saving: boolean
  backlinks: Backlink[]
  initialized: boolean

  init(): Promise<void>
  refresh(): Promise<void>
  refreshTags(): Promise<void>
  open(id: string): Promise<void>
  openByName(name: string): Promise<void>
  createNote(parentId: string | null): Promise<void>
  createFolder(parentId: string | null): Promise<void>
  setContent(content: string): void
  flushSave(): Promise<void>
  renameActive(name: string): Promise<void>
  trashNote(id: string): Promise<void>
  refreshBacklinks(): Promise<void>
  applyExternalUpdate(id: string, content: string): void
}

export const useVault = create<VaultState>((set, get) => ({
  snapshot: { notes: [], folders: [], driveConnected: false },
  tagCounts: [],
  activeId: null,
  activeContent: '',
  dirty: false,
  saving: false,
  backlinks: [],
  initialized: false,

  init: async () => {
    await get().refresh()
    await get().refreshTags()
    const { notes } = get().snapshot
    if (notes.length > 0 && !get().activeId) {
      const last = localStorage.getItem('hal.activeNote')
      const target = notes.find((n) => n.id === last) ?? notes[0]
      await get().open(target.id)
    }
    set({ initialized: true })
  },

  refresh: async () => {
    const snapshot = await hal.vaultList()
    let activeId = get().activeId
    if (activeId && !snapshot.notes.some((n) => n.id === activeId)) {
      // The note's id changed (offline note uploaded to Drive) — re-follow it by path.
      const prev = get().snapshot.notes.find((n) => n.id === activeId)
      activeId = prev ? (snapshot.notes.find((n) => n.path === prev.path)?.id ?? null) : null
    }
    set({ snapshot, activeId })
    if (activeId) localStorage.setItem('hal.activeNote', activeId)
    void get().refreshTags()
    void get().refreshBacklinks()
  },

  refreshTags: async () => {
    set({ tagCounts: await hal.tagsList() })
  },

  open: async (id) => {
    const s = get()
    if (s.dirty && s.activeId && s.activeId !== id) await s.flushSave()
    const note = await hal.noteOpen(id)
    if (!note) return
    set({ activeId: id, activeContent: note.content, dirty: false })
    localStorage.setItem('hal.activeNote', id)
    void get().refreshBacklinks()
  },

  openByName: async (name) => {
    const meta = await hal.resolveName(name)
    if (meta) await get().open(meta.id)
  },

  createNote: async (parentId) => {
    const meta = await hal.noteCreate(parentId)
    await get().refresh()
    await get().open(meta.id)
  },

  createFolder: async (parentId) => {
    await hal.folderCreate(parentId)
    await get().refresh()
  },

  setContent: (content) => {
    set({ activeContent: content, dirty: true })
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void get().flushSave()
    }, SAVE_DEBOUNCE_MS)
  },

  flushSave: async () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    const { activeId, activeContent, dirty } = get()
    if (!activeId || !dirty) return
    set({ saving: true })
    let res = await hal.noteSave(activeId, activeContent)
    if (!res) {
      // The id may have been swapped by a Drive upload mid-save; retry on the remapped id.
      const current = get().activeId
      if (current && current !== activeId) res = await hal.noteSave(current, activeContent)
    }
    set({ dirty: false, saving: false })
    await get().refresh()
  },

  renameActive: async (name) => {
    const { activeId } = get()
    if (!activeId || !name.trim()) return
    await get().flushSave()
    await hal.noteRename(activeId, name.trim())
    await get().refresh()
  },

  trashNote: async (id) => {
    const s = get()
    if (s.dirty && s.activeId === id) await s.flushSave()
    await hal.noteTrash(id)
    await get().refresh()
    if (get().activeId === id) {
      const first = get().snapshot.notes[0]
      if (first) await get().open(first.id)
      else set({ activeId: null, activeContent: '', dirty: false, backlinks: [] })
    }
  },

  refreshBacklinks: async () => {
    const { activeId } = get()
    set({ backlinks: activeId ? await hal.backlinks(activeId) : [] })
  },

  applyExternalUpdate: (id, content) => {
    const s = get()
    if (s.activeId === id && !s.dirty) set({ activeContent: content })
  }
}))
