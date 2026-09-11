import { useResearch } from '@/state/research'

const STATUS_LABEL: Record<string, string> = {
  assessing: 'Assessing what you already know…',
  researching: 'Researching the web…',
  writing: 'Writing your learning path…',
  ready: '',
  error: 'Failed'
}

export function PathsTab() {
  const detail = useResearch((s) => s.detail)
  const openPath = useResearch((s) => s.openPath)
  if (!detail) return null

  if (detail.paths.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-md">
          <div className="text-3xl">🌱</div>
          <p className="mt-3 text-sm text-[var(--hal-ink)]">No learning paths yet.</p>
          <p className="mt-1.5 text-xs leading-5 text-[var(--hal-dim)]">
            Type a topic above — anything you're curious about. HAL researches it across the web and your notes, then
            builds an interactive path of small cards you work through one at a time.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-3">
      <div className="space-y-2">
        {detail.paths.map((p) => {
          const running = p.status === 'assessing' || p.status === 'researching' || p.status === 'writing'
          const cardCount = p.path?.cards.length ?? 0
          return (
            <button
              key={p.id}
              className="block w-full rounded-lg border border-[var(--hal-hairline)] bg-[var(--hal-plate)] px-4 py-3 text-left transition-colors hover:border-[var(--hal-hairline)]"
              onClick={() => void openPath(p.id)}
            >
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${p.status === 'error' ? 'text-[var(--hal-dim)]' : 'text-[var(--hal-ivory)]'}`}>
                  {p.question}
                </span>
                <span className="flex-1" />
                {running && <span className="animate-pulse text-xs text-[var(--hal-amber)]">{STATUS_LABEL[p.status]}</span>}
                {p.status === 'ready' && (
                  <span className="rounded-full bg-[var(--hal-amber-dim)] px-2 py-0.5 text-[10px] text-[var(--hal-amber)]">
                    {cardCount} cards
                  </span>
                )}
                {p.noteId && (
                  <span className="rounded-full bg-[var(--hal-amber-dim)] px-2 py-0.5 text-[10px] text-[var(--hal-amber)]" title="Saved as a note in your vault">
                    saved ✓
                  </span>
                )}
              </div>
              {p.status === 'error' && <p className="mt-1 text-xs text-[var(--hal-lamp-red)]">{p.error}</p>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
