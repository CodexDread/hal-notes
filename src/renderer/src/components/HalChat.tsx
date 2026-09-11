import { useEffect, useRef, useState } from 'react'
import { renderMarkdown } from '@/lib/markdown'
import { hal } from '@/lib/ipc'
import { useUi } from '@/state/ui'
import { useChat } from '@/state/chat'
import { useVault } from '@/state/vault'

export function HalChat() {
  const messages = useChat((s) => s.messages)
  const busy = useChat((s) => s.busy)
  const error = useChat((s) => s.error)
  const ask = useChat((s) => s.ask)
  const clear = useChat((s) => s.clear)
  const geminiKeySet = useUi((s) => s.settings?.geminiKeySet ?? false)
  const dark = useUi((s) => (s.settings?.theme ?? 'dark') === 'dark')
  const openSettings = useUi((s) => s.openSettings)
  const embeddingsReady = useUi((s) => s.embeddingsReady)
  const embedProgress = useUi((s) => s.embedProgress)
  const [input, setInput] = useState('')
  const [buildingIndex, setBuildingIndex] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const send = (): void => {
    const q = input.trim()
    if (!q || busy) return
    setInput('')
    void ask(q)
  }

  if (!geminiKeySet) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="text-4xl text-[var(--hal-amber)]">◉</span>
        <p className="text-sm text-[var(--hal-dim)]">HAL needs a Gemini API key to chat with your notes.</p>
        <button
          className="rounded-lg bg-[var(--hal-amber)] px-4 py-2 text-sm font-medium text-white hover:opacity-80"
          onClick={openSettings}
        >
          Add key in Settings
        </button>
        <p className="text-[11px] text-[var(--hal-dim)] opacity-80">Free at aistudio.google.com — your AI Pro/Ultra plan lifts its limits.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!embeddingsReady && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--hal-amber)] bg-[var(--hal-amber-dim)] px-3 py-1.5 text-[11px] text-[var(--hal-amber)]">
          <span>Semantic index not built — Ask HAL may miss notes.</span>
          <button
            className="rounded bg-[var(--hal-amber-dim)] px-2 py-0.5 text-amber-200 hover:bg-amber-400/30 disabled:opacity-50"
            disabled={buildingIndex}
            onClick={() => {
              setBuildingIndex(true)
              void hal
                .embeddingsBackfill()
                .then(() => useUi.getState().refreshEmbeddingsReady())
                .catch((err: unknown) => console.error(err))
                .finally(() => setBuildingIndex(false))
            }}
          >
            {buildingIndex ? 'Building…' : 'Build index'}
          </button>
          {embedProgress && (
            <span className="text-[var(--hal-amber)]">
              {embedProgress.done}/{embedProgress.total}
            </span>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="rounded-lg bg-[var(--hal-plate-2)] p-3 text-xs leading-5 text-[var(--hal-dim)]">
            <span className="text-[var(--hal-amber)]">◉ HAL</span> reads your notes and answers with citations like{' '}
            <span className="text-[var(--hal-amber)]">[1]</span>. Try: <em>"What do my notes say about the garden project?"</em>
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-[var(--hal-amber-dim)] px-3 py-2 text-sm text-violet-100">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--hal-amber)]">
                ◉ HAL {m.streaming && <span className="animate-pulse text-[var(--hal-dim)]">thinking…</span>}
              </div>
              <div
                className={`preview prose prose-sm prose-zinc max-w-none whitespace-pre-wrap ${dark ? 'prose-invert' : ''}`}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }}
              />
              {m.citations.length > 0 && !m.streaming && (
                <div className="flex flex-wrap gap-1">
                  {m.citations.map((c) => (
                    <button
                      key={`${m.id}-${c.index}`}
                      title={c.path}
                      className="rounded-full bg-[var(--hal-plate-2)] px-2 py-0.5 text-[10px] text-[var(--hal-ink)] hover:bg-[var(--hal-plate-2)]"
                      onClick={() => void useVault.getState().open(c.noteId)}
                    >
                      [{c.index}] {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        )}
        {error && <p className="text-xs text-[var(--hal-lamp-red)]">{error}</p>}
        <div ref={bottomRef} />
      </div>
      <div className="shrink-0 border-t border-[var(--hal-hairline)] p-2">
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            className="min-h-0 flex-1 resize-none rounded-lg border border-[var(--hal-hairline)] bg-[var(--hal-plate)] px-3 py-2 text-sm outline-none placeholder:text-[var(--hal-dim)] opacity-80 focus:border-[var(--hal-amber)]"
            placeholder="Ask HAL about your notes…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <div className="flex flex-col gap-1">
            <button
              className="rounded-lg bg-[var(--hal-amber)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-80 disabled:opacity-40"
              disabled={busy || !input.trim()}
              onClick={send}
            >
              Ask
            </button>
            {messages.length > 0 && (
              <button className="rounded-lg px-3 py-1 text-[11px] text-[var(--hal-dim)] hover:bg-[var(--hal-plate-2)]" onClick={clear}>
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
