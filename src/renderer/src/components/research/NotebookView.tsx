import { useState } from 'react'
import { NotebookChat } from './NotebookChat'
import { PathPlayer } from './PathPlayer'
import { PathsTab } from './PathsTab'
import { SourcesTab } from './SourcesTab'
import { useResearch, type ResearchTab } from '@/state/research'

const TABS: { id: ResearchTab; label: string }[] = [
  { id: 'paths', label: 'Paths' },
  { id: 'chat', label: 'Chat' },
  { id: 'sources', label: 'Sources' }
]

export function NotebookView() {
  const detail = useResearch((s) => s.detail)
  const activeTab = useResearch((s) => s.activeTab)
  const setActiveTab = useResearch((s) => s.setActiveTab)
  const startPath = useResearch((s) => s.startPath)
  const [topic, setTopic] = useState('')

  if (!detail) {
    return (
      <div className="grid h-full flex-1 place-items-center">
        <div className="max-w-sm text-center">
          <div className="text-4xl text-[var(--hal-amber)]">🔬</div>
          <p className="mt-3 text-sm text-[var(--hal-dim)]">Create a notebook to start researching.</p>
          <p className="mt-1 text-xs text-[var(--hal-dim)] opacity-80">One notebook per topic — it collects sources, conversations, and learning paths.</p>
        </div>
      </div>
    )
  }

  const busy = detail.paths.some((p) => p.status === 'assessing' || p.status === 'researching' || p.status === 'writing')

  const submit = (): void => {
    if (!topic.trim()) return
    setTopic('')
    void startPath(topic)
  }

  return (
    <section className="relative flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--hal-hairline)] px-4 py-2">
        <input
          className="min-w-0 flex-1 rounded-lg border border-[var(--hal-hairline)] bg-[var(--hal-plate)] px-3 py-1.5 text-sm outline-none placeholder:text-[var(--hal-dim)] opacity-80 focus:border-[var(--hal-amber)]"
          placeholder="I want to learn… (HAL researches the web + your notes, then builds a learning path)"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <button
          className="rounded-lg bg-[var(--hal-amber)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-80 disabled:opacity-40"
          disabled={!topic.trim() || busy}
          onClick={submit}
        >
          Research it
        </button>
      </div>
      <div className="flex shrink-0 border-b border-[var(--hal-hairline)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`px-3 py-2 text-xs font-medium ${
              activeTab === t.id ? 'border-b-2 border-[var(--hal-amber)] text-[var(--hal-amber)]' : 'text-[var(--hal-dim)] hover:text-[var(--hal-ink)]'
            }`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'paths' && <PathsTab />}
        {activeTab === 'chat' && <NotebookChat />}
        {activeTab === 'sources' && <SourcesTab />}
      </div>
      <PathPlayer />
    </section>
  )
}
