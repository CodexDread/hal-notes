import { useEffect, useRef, useState } from 'react'
import type { SearchHit } from '@shared/types'
import { hal } from '@/lib/ipc'
import { useUi } from '@/state/ui'
import { useVault } from '@/state/vault'

type Mode = 'text' | 'semantic'

export function SearchPane() {
  const seed = useUi((s) => s.searchSeed)
  const openSettings = useUi((s) => s.openSettings)
  const geminiKeySet = useUi((s) => s.settings?.geminiKeySet ?? false)
  const embeddingsReady = useUi((s) => s.embeddingsReady)
  const embedProgress = useUi((s) => s.embedProgress)
  const open = useVault((s) => s.open)
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState(seed)
  const [mode, setMode] = useState<Mode>('text')
  const [results, setResults] = useState<SearchHit[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (seed) {
      setQuery(seed)
      setMode('text')
    }
    inputRef.current?.focus()
  }, [seed])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setError('')
      return
    }
    setBusy(true)
    const t = setTimeout(() => {
      const run =
        mode === 'text' ? hal.searchText(q) : hal.searchSemantic(q).catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err))
          return [] as SearchHit[]
        })
      void run
        .then((r) => {
          if (mode !== 'semantic') setError('')
          setResults(r)
        })
        .finally(() => setBusy(false))
    }, 250)
    return () => clearTimeout(t)
  }, [query, mode])

  const semanticLocked = !geminiKeySet

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Search</span>
        <input
          ref={inputRef}
          className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm outline-none placeholder:text-zinc-600 focus:border-violet-500"
          placeholder={mode === 'text' ? 'Search notes…' : 'Describe what you mean…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="mt-1.5 flex overflow-hidden rounded-md border border-zinc-700 text-xs">
          <button
            className={`flex-1 px-2 py-1 ${mode === 'text' ? 'bg-violet-500/20 text-violet-300' : 'text-zinc-400 hover:bg-zinc-800'}`}
            onClick={() => setMode('text')}
          >
            Text
          </button>
          <button
            className={`flex-1 px-2 py-1 ${semanticLocked ? 'text-zinc-600' : mode === 'semantic' ? 'bg-violet-500/20 text-violet-300' : 'text-zinc-400 hover:bg-zinc-800'}`}
            onClick={() => (semanticLocked ? openSettings() : setMode('semantic'))}
            title={semanticLocked ? 'Add a Gemini API key in Settings' : 'Search by meaning'}
          >
            Semantic ✦
          </button>
        </div>
        {mode === 'semantic' && geminiKeySet && !embeddingsReady && (
          <div className="mt-2 rounded-md bg-zinc-800/60 p-2 text-[11px] text-zinc-400">
            Build the semantic index first — one-time pass over your vault.
            <button
              className="mt-1 block rounded bg-violet-500/20 px-2 py-1 text-violet-300 hover:bg-violet-500/30"
              onClick={() => void hal.embeddingsBackfill()}
            >
              Build index
            </button>
            {embedProgress && (
              <div className="mt-1.5">
                <div className="h-1 overflow-hidden rounded bg-zinc-700">
                  <div
                    className="h-full bg-violet-400 transition-all"
                    style={{ width: `${embedProgress.total ? (embedProgress.done / embedProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <span>
                  {embedProgress.done}/{embedProgress.total} notes
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {error && <p className="px-2 py-2 text-xs text-red-400">{error}</p>}
        {busy && <p className="px-2 py-2 text-xs text-zinc-600">Searching…</p>}
        {!busy && query && results.length === 0 && !error && (
          <p className="px-2 py-2 text-xs text-zinc-600">No matches.</p>
        )}
        {results.map((hit) => (
          <button
            key={hit.noteId}
            className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-zinc-800/70"
            onClick={() => void open(hit.noteId)}
          >
            <div className="truncate text-sm text-zinc-200">{hit.name}</div>
            <div className="truncate text-[10px] text-zinc-600">{hit.path}</div>
            <div
              className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500 [&_b]:text-zinc-300"
              dangerouslySetInnerHTML={{ __html: hit.snippet }}
            />
          </button>
        ))}
      </div>
    </div>
  )
}
