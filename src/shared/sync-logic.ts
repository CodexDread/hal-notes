/**
 * Pure sync decision logic. Hashes are md5 hex strings of note content:
 * - localHash:   md5 of the note content currently on this machine
 * - ancestorHash: md5 of the content at the last successful sync (common ancestor)
 * - remoteHash:  md5 reported by Drive for the remote file
 */

export type SyncAction = 'clean' | 'push' | 'pull' | 'conflict'

export function computeSyncAction(localHash: string, ancestorHash: string, remoteHash: string | null): SyncAction {
  const remote = remoteHash ?? ancestorHash
  if (localHash === remote) return 'clean'
  const localDirty = localHash !== ancestorHash
  const remoteDirty = remote !== ancestorHash
  if (localDirty && remoteDirty) return 'conflict'
  if (localDirty) return 'push'
  if (remoteDirty) return 'pull'
  return 'clean'
}

export function isLocalId(id: string): boolean {
  return id.startsWith('local-')
}

export function conflictCopyName(name: string, date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}`
  const trimmed = name.replace(/\s*\(conflict [^)]*\)\s*$/, '').trim()
  return `${trimmed} (conflict ${stamp})`
}

export function ftsQuery(query: string): string {
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"*`)
  if (tokens.length === 0) return '""'
  return tokens.slice(0, 8).join(' AND ')
}
