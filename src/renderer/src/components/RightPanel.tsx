import { HalChat } from './HalChat'
import { useUi, type RightTab } from '@/state/ui'
import { useVault } from '@/state/vault'

function BacklinksPanel() {
  const backlinks = useVault((s) => s.backlinks)
  const open = useVault((s) => s.open)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      {backlinks.length === 0 ? (
        <p className="text-xs leading-5 text-zinc-600">
          No notes link here yet. Mention this note from another one with{' '}
          <span className="text-violet-400">[[double brackets]]</span> and it will show up.
        </p>
      ) : (
        <div className="space-y-1">
          {backlinks.map((b) => (
            <button
              key={b.noteId}
              className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-zinc-800/70"
              onClick={() => void open(b.noteId)}
            >
              <div className="truncate text-sm text-zinc-200">{b.name}</div>
              <div className="truncate text-[10px] text-zinc-600">{b.path}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const TABS: { id: RightTab; label: string }[] = [
  { id: 'hal', label: '◉ HAL' },
  { id: 'backlinks', label: 'Backlinks' }
]

export function RightPanel() {
  const tab = useUi((s) => s.rightTab)
  const setTab = useUi((s) => s.setRightTab)

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-zinc-800 bg-zinc-900/40">
      <div className="flex shrink-0 border-b border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`flex-1 px-2 py-2 text-xs font-medium ${
              tab === t.id ? 'border-b-2 border-violet-400 text-violet-300' : 'text-zinc-500 hover:text-zinc-300'
            }`}
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
