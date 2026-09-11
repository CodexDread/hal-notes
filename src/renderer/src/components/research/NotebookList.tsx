import { useState } from 'react'
import { useResearch } from '@/state/research'

export function NotebookList() {
  const notebooks = useResearch((s) => s.notebooks)
  const activeId = useResearch((s) => s.activeId)
  const open = useResearch((s) => s.open)
  const create = useResearch((s) => s.create)
  const rename = useResearch((s) => s.rename)
  const remove = useResearch((s) => s.remove)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const commitCreate = (): void => {
    setCreating(false)
    if (draft.trim()) void create(draft.trim())
    setDraft('')
  }

  const commitRename = (id: string): void => {
    setEditingId(null)
    if (editDraft.trim()) void rename(id, editDraft.trim())
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-[var(--hal-hairline)] bg-[var(--hal-plate)]">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--hal-dim)]">Notebooks</span>
        <button
          title="New notebook"
          className="rounded p-1 text-[var(--hal-dim)] hover:bg-[var(--hal-plate-2)] hover:text-[var(--hal-amber)]"
          onClick={() => setCreating(true)}
        >
          ＋
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {notebooks.length === 0 && !creating && (
          <p className="px-2 py-3 text-xs leading-5 text-[var(--hal-dim)] opacity-80">
            A notebook is a topic you're curious about. Sources, conversations, and learning paths all live inside one.
          </p>
        )}
        {creating && (
          <input
            autoFocus
            className="mb-1 w-full rounded-md border border-[var(--hal-hairline)] bg-[var(--hal-plate)] px-2 py-1.5 text-sm outline-none focus:border-[var(--hal-amber)]"
            placeholder="What are you curious about?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitCreate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCreate()
              if (e.key === 'Escape') setCreating(false)
            }}
          />
        )}
        {notebooks.map((nb) => (
          <div
            key={nb.id}
            className={`group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-[5px] text-sm hover:bg-[var(--hal-plate-2)] ${
              activeId === nb.id ? 'bg-[var(--hal-amber-dim)] text-[var(--hal-amber)]' : 'text-[var(--hal-ink)]'
            }`}
            onClick={() => void open(nb.id)}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setEditDraft(nb.name)
              setEditingId(nb.id)
            }}
          >
            <span className="text-xs">🔬</span>
            {editingId === nb.id ? (
              <input
                autoFocus
                className="min-w-0 flex-1 rounded bg-[var(--hal-plate)] px-1 text-sm outline outline-violet-500"
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onBlur={() => commitRename(nb.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(nb.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="min-w-0 flex-1 truncate">{nb.name}</span>
            )}
            {editingId !== nb.id && (
              <button
                title="Delete notebook"
                className="hidden shrink-0 rounded px-1 text-xs text-[var(--hal-dim)] hover:text-[var(--hal-lamp-red)] group-hover:block"
                onClick={(e) => {
                  e.stopPropagation()
                  if (window.confirm(`Delete notebook "${nb.name}"? Learning paths saved as notes stay in your vault.`)) {
                    void remove(nb.id)
                  }
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}
