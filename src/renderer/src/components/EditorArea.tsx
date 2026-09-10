import { useEffect, useRef, useState } from 'react'
import { hal } from '@/lib/ipc'
import { EditorPane } from './EditorPane'
import { EmptyState } from './EmptyState'
import { PreviewPane } from './PreviewPane'
import { SuggestionBar } from './SuggestionBar'
import { useUi } from '@/state/ui'
import { useVault } from '@/state/vault'

function NoteReviewButton() {
  const activeId = useVault((s) => s.activeId)
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setCount(0)
    setError('')
    if (activeId) void hal.reviewNoteCardCount(activeId).then(setCount).catch(() => setCount(0))
  }, [activeId])

  if (!activeId) return null

  if (count > 0) {
    return (
      <button
        className="shrink-0 rounded-md px-2 py-0.5 text-xs text-violet-300 hover:bg-zinc-800"
        title="Cards in spaced review — click to open Review mode"
        onClick={() => useUi.getState().setMode('review')}
      >
        🧠 {count} in review
      </button>
    )
  }

  return (
    <button
      className="shrink-0 rounded-md px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-violet-300 disabled:opacity-50"
      disabled={busy}
      title={error || 'Generate recall cards from this note (active recall + spaced repetition)'}
      onClick={() => {
        setBusy(true)
        setError('')
        void hal
          .reviewAddNote(activeId)
          .then((r) => setCount(r.count))
          .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
          .finally(() => setBusy(false))
      }}
    >
      {busy ? '🧠 Generating…' : '🧠 Add to review'}
    </button>
  )
}

export function EditorArea() {
  const activeId = useVault((s) => s.activeId)
  const active = useVault((s) => s.snapshot.notes.find((n) => n.id === s.activeId))
  const pendingSync = active?.pendingSync ?? false
  const viewMode = useUi((s) => s.viewMode)
  const renameActive = useVault((s) => s.renameActive)
  const [nameDraft, setNameDraft] = useState(active?.name ?? '')
  const previewRef = useRef<HTMLDivElement>(null)
  const renamingRef = useRef(false)

  useEffect(() => {
    if (!renamingRef.current) setNameDraft(active?.name ?? '')
  }, [active?.name, activeId])

  if (!activeId || !active) return <EmptyState />

  const commitName = (): void => {
    renamingRef.current = false
    if (nameDraft.trim() && nameDraft.trim() !== active.name) void renameActive(nameDraft.trim())
  }

  const showEditor = viewMode !== 'preview'
  const showPreview = viewMode !== 'edit'

  const editorPane = showEditor && <EditorPane previewRef={previewRef} />
  const previewPane = showPreview && <PreviewPane containerRef={previewRef} />

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-zinc-950">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-800/70 px-4">
        <input
          className="min-w-0 flex-1 truncate bg-transparent text-sm font-medium text-zinc-200 outline-none placeholder:text-zinc-600"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onFocus={() => (renamingRef.current = true)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setNameDraft(active.name)
              renamingRef.current = false
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        <NoteReviewButton />
        {pendingSync && (
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400/80" title="Waiting to sync to Drive" />
        )}
      </div>
      <SuggestionBar />
      <div className="flex min-h-0 flex-1">
        {editorPane}
        {showEditor && showPreview && <div className="w-px shrink-0 bg-zinc-800/70" />}
        {previewPane}
      </div>
    </section>
  )
}
