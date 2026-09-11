import { HalChat } from './HalChat'
import { useUi, type RightTab } from '@/state/ui'
import { useVault } from '@/state/vault'

function BacklinksPanel() {
  const backlinks = useVault((s) => s.backlinks)
  const open = useVault((s) => s.open)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      {backlinks.length === 0 ? (
        <p className="text-xs leading-5 text-[var(--hal-dim)] opacity-80">
          No notes link here yet. Mention this note from another one with{' '}
          <span className="text-[var(--hal-amber)]">[[double brackets]]</span> and it will show up.
        </p>
      ) : (
        <div className="space-y-1">
          {backlinks.map((b) => (
            <button
              key={b.noteId}
              className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--hal-plate-2)]"
              onClick={() => void open(b.noteId)}
            >
              <div className="truncate text-sm text-[var(--hal-ink)]">{b.name}</div>
              <div className="truncate text-[10px] text-[var(--hal-dim)] opacity-80">{b.path}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const TABS: { id: RightTab; label: string }[] = [
  { id: 'hal', label: 'BAY' },
  { id: 'backlinks', label: 'LINKS' }
]

export function RightPanel() {
  const tab = useUi((s) => s.rightTab)
  const setTab = useUi((s) => s.setRightTab)

  return (
    <aside className="flex h-full w-80 min-w-72 shrink-0 flex-col border-l" style={{ background: 'var(--hal-plate)', borderColor: 'var(--hal-hairline)' }}>
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--hal-hairline)' }}>
        <span className="relative inline-grid place-items-center">
          <span className="absolute h-4 w-4 rounded-full border" style={{ borderColor: 'var(--hal-amber)', opacity: 0.85 }} />
          <span className="h-1 w-1 rounded-full" style={{ background: 'var(--hal-amber)' }} />
        </span>
        <span className="legend" style={{ color: 'var(--hal-ivory)' }}>HAL — OBSERVER</span>
        <span className="flex-1" />
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`annun border-0 px-2 ${tab === t.id ? 'annun-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'hal' ? <HalChat /> : <BacklinksPanel />}
    </aside>
  )
}
