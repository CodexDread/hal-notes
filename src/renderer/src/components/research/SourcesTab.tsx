import { useEffect, useState } from 'react'
import type { SearchHit } from '@shared/types'
import { hal } from '@/lib/ipc'
import { useResearch } from '@/state/research'

function AddNoteSource() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const addSource = useResearch((s) => s.detail) // re-render on detail change
  void addSource

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      void hal.searchText(q, 8).then(setResults).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const add = (hit: SearchHit): void => {
    const state = useResearch.getState()
    if (!state.activeId) return
    void hal.researchAddSource(state.activeId, 'note', hit.noteId, hit.name).then(() => state.refreshActive())
    setQuery('')
    setResults([])
  }

  return (
    <div>
      <input
        className="w-full rounded-md border border-[var(--hal-hairline)] bg-[var(--hal-plate)] px-2.5 py-1.5 text-sm outline-none placeholder:text-[var(--hal-dim)] opacity-80 focus:border-[var(--hal-amber)]"
        placeholder="Pin a note from your vault — search by name or content…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <div className="mt-1.5 space-y-0.5 rounded-md border border-[var(--hal-hairline)] bg-[var(--hal-plate)] p-1">
          {results.map((r) => (
            <button
              key={r.noteId}
              className="block w-full rounded px-2 py-1 text-left text-sm text-[var(--hal-ink)] hover:bg-[var(--hal-plate-2)]"
              onClick={() => add(r)}
            >
              ＋ {r.name} <span className="text-[10px] text-[var(--hal-dim)] opacity-80">{r.path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SourcesTab() {
  const detail = useResearch((s) => s.detail)
  if (!detail) return null
  const notes = detail.sources.filter((s) => s.kind === 'note')
  const web = detail.sources.filter((s) => s.kind === 'web')
  const removeSource = (id: string): void => {
    void hal.researchRemoveSource(id).then(() => useResearch.getState().refreshActive())
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--hal-dim)]">Your notes in this notebook</h3>
      <div className="mt-2">
        <AddNoteSource />
      </div>
      <div className="mt-2 space-y-1">
        {notes.length === 0 && <p className="text-xs text-[var(--hal-dim)] opacity-80">Nothing pinned yet. Notes you pin become citable context for chat and paths.</p>}
        {notes.map((s) => (
          <div key={s.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--hal-plate-2)]">
            <span className="text-xs">📄</span>
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--hal-ink)]">{s.title}</span>
            <button className="hidden text-xs text-[var(--hal-dim)] hover:text-[var(--hal-lamp-red)] group-hover:block" onClick={() => removeSource(s.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-[var(--hal-dim)]">Web sources</h3>
      <p className="mt-1 text-xs text-[var(--hal-dim)] opacity-80">Found by HAL during research runs.</p>
      <div className="mt-2 space-y-1">
        {web.length === 0 && <p className="text-xs text-[var(--hal-dim)] opacity-80">None yet — run a learning path and sources collect here.</p>}
        {web.map((s) => (
          <div key={s.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--hal-plate-2)]">
            <span className="text-xs">🌐</span>
            <a
              className="min-w-0 flex-1 truncate text-sm text-[var(--hal-amber)] hover:underline"
              href={s.uri}
              target="_blank"
              rel="noopener noreferrer"
            >
              {s.title || s.uri}
            </a>
            {s.addedBy === 'hal' && <span className="shrink-0 rounded-full bg-[var(--hal-amber-dim)] px-1.5 text-[10px] text-[var(--hal-amber)]">HAL</span>}
            <button className="hidden text-xs text-[var(--hal-dim)] hover:text-[var(--hal-lamp-red)] group-hover:block" onClick={() => removeSource(s.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
