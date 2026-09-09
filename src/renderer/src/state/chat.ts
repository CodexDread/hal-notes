import { create } from 'zustand'
import type { ChatMessage, Citation } from '@shared/types'
import { hal } from '@/lib/ipc'

interface ChatState {
  messages: ChatMessage[]
  busy: boolean
  error: string | null

  ask(question: string): Promise<void>
  onDelta(id: string, delta: string): void
  onDone(id: string, citations: Citation[]): void
  onError(id: string, error: string): void
  clear(): void
}

export const useChat = create<ChatState>((set, get) => ({
  messages: [],
  busy: false,
  error: null,

  ask: async (question) => {
    const { messages, busy } = get()
    if (busy || !question.trim()) return
    const id = crypto.randomUUID()
    const history = messages
      .filter((m) => !m.streaming)
      .slice(-6)
      .map((m) => ({ role: m.role, text: m.text }))
    set({
      messages: [
        ...messages,
        { id: crypto.randomUUID(), role: 'user', text: question, citations: [], streaming: false },
        { id, role: 'hal', text: '', citations: [], streaming: true }
      ],
      busy: true,
      error: null
    })
    try {
      await hal.halAsk(id, question, history)
    } catch (err) {
      get().onError(id, err instanceof Error ? err.message : String(err))
    }
  },

  onDelta: (id, delta) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m))
    })),

  onDone: (id, citations) =>
    set((s) => ({
      busy: false,
      messages: s.messages.map((m) => (m.id === id ? { ...m, citations, streaming: false } : m))
    })),

  onError: (id, error) =>
    set((s) => ({
      busy: false,
      error,
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, text: m.text || `(error: ${error})`, streaming: false } : m
      )
    })),

  clear: () => set({ messages: [], error: null })
}))
