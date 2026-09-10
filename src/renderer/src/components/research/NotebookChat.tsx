import { useEffect, useRef, useState } from 'react'
import { renderMarkdown } from '@/lib/markdown'
import { useResearch } from '@/state/research'
import { useUi } from '@/state/ui'
import { useVault } from '@/state/vault'

export function NotebookChat() {
  const detail = useResearch((s) => s.detail)
  const chatBusy = useResearch((s) => s.chatBusy)
  const chatError = useResearch((s) => s.chatError)
  const streamText = useResearch((s) => s.streamText)
  const ask = useResearch((s) => s.ask)
  const geminiKeySet = useUi((s) => s.settings?.geminiKeySet ?? false)
  const openSettings = useUi((s) => s.openSettings)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const messages = detail?.messages ?? []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, streamText])

  const send = (): void => {
    const q = input.trim()
    if (!q || chatBusy) return
    setInput('')
    void ask(q)
  }

  if (!geminiKeySet) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="text-4xl text-violet-400">🔬</span>
        <p className="text-sm text-zinc-400">Notebook chat needs a Gemini API key.</p>
        <button className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-400" onClick={openSettings}>
          Add key in Settings
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !streamText && (
          <div className="rounded-lg bg-zinc-800/40 p-3 text-xs leading-5 text-zinc-400">
            <span className="text-violet-300">🔬 Notebook chat</span> answers from this notebook's sources — HAL asks
            questions back, teaches in your direction, and never grades. Pin notes in Sources; HAL adds web sources
            during research runs.
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-violet-500/20 px-3 py-2 text-sm text-violet-100">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex flex-col gap-1.5">
              <div className="text-[11px] font-semibold text-violet-300">🔬 HAL</div>
              <div
                className="preview prose prose-sm prose-zinc max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }}
              />
              {m.citations.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.citations.map((c) =>
                    c.noteId ? (
                      <button
                        key={`${m.id}-${c.index}`}
                        className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-700"
                        title={c.title}
                        onClick={() => {
                          useUi.getState().setMode('notes')
                          void useVault.getState().open(c.noteId!)
                        }}
                      >
                        [{c.index}] {c.title}
                      </button>
                    ) : (
                      <a
                        key={`${m.id}-${c.index}`}
                        className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-sky-300 hover:bg-zinc-700"
                        href={c.uri ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        [{c.index}] {c.title}
                      </a>
                    )
                  )}
                </div>
              )}
            </div>
          )
        )}
        {streamText && (
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] font-semibold text-violet-300">🔬 HAL</div>
            <div
              className="preview prose prose-sm prose-zinc max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(streamText) }}
            />
          </div>
        )}
        {chatError && <p className="text-xs text-red-400">{chatError}</p>}
        <div ref={bottomRef} />
      </div>
      <div className="shrink-0 border-t border-zinc-800 p-3">
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            className="min-h-0 flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-violet-500"
            placeholder="Ask about this notebook's sources…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button
            className="rounded-lg bg-violet-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-40"
            disabled={chatBusy || !input.trim()}
            onClick={send}
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  )
}
