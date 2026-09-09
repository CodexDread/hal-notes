import { useUi } from '@/state/ui'
import { useVault } from '@/state/vault'

export function TagsPane() {
  const tags = useVault((s) => s.tagCounts)
  const seedSearch = useUi((s) => s.seedSearch)

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Tags</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {tags.length === 0 ? (
          <p className="py-2 text-xs text-zinc-600">
            No tags yet. Add <span className="text-emerald-300">#tags</span> to your notes and they'll collect here.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <button
                key={t.tag}
                className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-400/20"
                onClick={() => seedSearch(t.tag)}
              >
                #{t.tag}
                <span className="ml-1 text-emerald-500/70">{t.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
