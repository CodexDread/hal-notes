import { useVault } from '@/state/vault'
import { useUi } from '@/state/ui'

function timeAgo(ts: number | null): string {
  if (!ts) return 'never'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

export function StatusBar() {
  const activeContent = useVault((s) => s.activeContent)
  const dirty = useVault((s) => s.dirty)
  const saving = useVault((s) => s.saving)
  const status = useUi((s) => s.syncStatus)
  const driveConnected = useVault((s) => s.snapshot.driveConnected)

  const words = activeContent.trim() ? activeContent.trim().split(/\s+/).length : 0

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-900/60 px-3 text-[11px] text-zinc-500">
      <div>{saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}</div>
      <div>{words} words</div>
      <div className="flex items-center gap-3">
        {status?.state === 'conflict' && <span className="text-orange-400">{status.message}</span>}
        {status?.state === 'error' && <span className="text-red-400">{status.message}</span>}
        {driveConnected ? (
          <span>Drive synced {timeAgo(status?.lastSyncAt ?? null)}</span>
        ) : (
          <span>Local vault — connect Google Drive in Settings</span>
        )}
      </div>
    </footer>
  )
}
