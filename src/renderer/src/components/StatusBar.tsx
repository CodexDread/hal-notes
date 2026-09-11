import { useVault } from '@/state/vault'
import { useUi } from '@/state/ui'

function clock(ts: number | null): string {
  if (!ts) return '--:--'
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function StatusBar() {
  const activeContent = useVault((s) => s.activeContent)
  const dirty = useVault((s) => s.dirty)
  const saving = useVault((s) => s.saving)
  const status = useUi((s) => s.syncStatus)
  const driveConnected = useVault((s) => s.snapshot.driveConnected)

  const words = activeContent.trim() ? activeContent.trim().split(/\s+/).length : 0

  return (
    <footer
      className="flex h-6 shrink-0 items-center justify-between px-4"
      style={{ background: 'var(--hal-ground)' }}
    >
      <span className="legend" style={{ fontSize: 9 }}>
        {saving ? 'WRITING…' : dirty ? 'BUFFER DIRTY' : 'BUFFER CLEAN'}
      </span>
      <span className="mono" style={{ fontSize: 9, color: 'var(--hal-dim)' }}>
        {String(words).padStart(4, '0')} WRDS
      </span>
      <span className="flex items-center gap-3">
        {status?.state === 'conflict' && (
          <span className="legend" style={{ fontSize: 9, color: 'var(--hal-amber)' }}>
            {status.message}
          </span>
        )}
        {status?.state === 'error' && (
          <span className="legend" style={{ fontSize: 9, color: 'var(--hal-lamp-red)' }}>
            {status.message}
          </span>
        )}
        <span className="legend" style={{ fontSize: 9 }}>
          {driveConnected ? `LAST XFER ${clock(status?.lastSyncAt ?? null)}` : 'LOCAL VAULT · DRIVE UNLINKED'}
        </span>
      </span>
    </footer>
  )
}
