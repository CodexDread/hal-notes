import { useState } from 'react'
import { NotebookChat } from './NotebookChat'
import { PathPlayer } from './PathPlayer'
import { PathsTab } from './PathsTab'
import { ReviewTab } from './ReviewTab'
import { SourcesTab } from './SourcesTab'
import { useResearch, type ResearchTab } from '@/state/research'

const TABS: { id: ResearchTab; label: string }[] = [
  { id: 'paths', label: 'Paths' },
  { id: 'chat', label: 'Chat' },
  { id: 'sources', label: 'Sources' },
  { id: 'review', label: 'Review' }
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
          <div className="text-4xl text-emerald-400">🔬</div>
          <p className="mt-3 text-sm text-zinc-400">Create a notebook to start researching.</p>
          <p className="mt-1 text-xs text-zinc-600">One notebook per topic — it collects sources, conversations, and learning paths.</p>
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
      <div className="flex items-center gap-2 border-b border-zinc-800/70 px-4 py-2">
        <input
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none placeholder:text-zinc-600 focus:border-emerald-500"
          placeholder="I want to learn… (HAL researches the web + your notes, then builds a learning path)"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <button
          className="rounded-lg bg-emerald-500/90 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
          disabled={!topic.trim() || busy}
          onClick={submit}
        >
          Research it
        </button>
      </div>
      <div className="flex shrink-0 border-b border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`px-3 py-2 text-xs font-medium ${
              activeTab === t.id ? 'border-b-2 border-emerald-400 text-emerald-300' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
            {t.id === 'review' && <span className="ml-1 text-[10px] text-emerald-500/80">due</span>}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'paths' && <PathsTab />}
        {activeTab === 'chat' && <NotebookChat />}
        {activeTab === 'sources' && <SourcesTab />}
        {activeTab === 'review' && <ReviewTab />}
      </div>
      <PathPlayer />
    </section>
  )
}
