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
        className="annun"
        title="Cards in spaced review — open Review"
        onClick={() => useUi.getState().setMode('review')}
      >
        <span className="lamp lamp-amber" />
        REVIEW {count}
      </button>
    )
  }

  return (
    <button
      className="annun"
      disabled={busy}
      title={error || 'Generate recall cards from this note'}
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
      <span className={`lamp ${busy ? 'lamp-amber lamp-blink' : ''}`} />
      {busy ? 'INDEXING…' : 'ADD REVIEW'}
    </button>
  )
}

function isImageName(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name)
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
    <section className="relative flex h-full min-w-0 flex-1 flex-col" style={{ background: 'var(--hal-ground)' }}>
      {/* Catalog entry: title block on the ground, per the approved comp */}
      <div className="relative shrink-0 px-8 pb-4" style={{ paddingTop: 46 }}>
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{ backgroundImage: 'linear-gradient(to right, var(--hal-hairline-dim) 1px, transparent 1px)', backgroundSize: '120px 100%', opacity: 0.6 }}
        />
        <div className="relative flex items-baseline gap-3">
          <input
            className="mono min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-[28px] uppercase leading-none tracking-[0.06em] outline-none"
            style={{ color: 'var(--hal-ivory)' }}
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
        </div>
        <div className="relative mt-1 flex items-center gap-2">
          <span className="lamp" style={{ background: pendingSync ? 'var(--hal-amber)' : 'var(--hal-lamp-green)' }} title={pendingSync ? 'Pending sync' : 'Synced'} />
          <span className="legend" style={{ color: '#4a4848' }}>
            {active.modifiedLocal ? `MOD ${new Date(active.modifiedLocal).toISOString().slice(5, 10).replace('-', '')}` : 'NEW ENTRY'} · {active.pendingSync ? 'PENDING XFER' : 'SYNCED'}
          </span>
        </div>
      </div>
      <SuggestionBar />
      <div className="relative flex min-h-0 flex-1">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{ backgroundImage: 'linear-gradient(to right, var(--hal-hairline-dim) 1px, transparent 1px)', backgroundSize: '120px 100%', opacity: 0.6 }}
        />
        {editorPane}
        {showEditor && showPreview && <div className="w-px shrink-0" style={{ background: 'var(--hal-hairline)' }} />}
        {previewPane}
      </div>
    </section>
  )
}
