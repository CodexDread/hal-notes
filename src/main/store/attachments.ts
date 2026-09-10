import { createHash, randomUUID } from 'crypto'
import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync, rmSync } from 'fs'
import { join } from 'path'
import type { AttachmentMeta } from '@shared/types'
import { bus } from '../events'
import { getDb } from './db'

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

export interface AttachmentRow {
  id: string
  name: string
  parent_id: string | null
  mime: string
  size: number
  local_hash: string
  synced_hash: string
  remote_hash: string | null
  remote_version: string | null
  remote_trashed: number
  trashed: number
  created_at: number
  updated_at: number
}

export function attachmentsDir(): string {
  return join(app.getPath('userData'), 'attachments')
}

export function ensureAttachmentsDir(): void {
  mkdirSync(attachmentsDir(), { recursive: true })
}

export function attachmentPath(name: string): string {
  return join(attachmentsDir(), name)
}

function toMeta(r: AttachmentRow): AttachmentMeta {
  return {
    id: r.id,
    name: r.name,
    mime: r.mime,
    size: r.size,
    pendingSync: r.local_hash !== r.synced_hash || (r.trashed === 1 && r.remote_trashed === 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function md5Buffer(bytes: Uint8Array): string {
  return createHash('md5').update(bytes).digest('hex')
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

export function listAttachmentMetas(): AttachmentMeta[] {
  return getDb()
    .prepare<[], AttachmentRow>('SELECT * FROM attachments WHERE trashed = 0 ORDER BY name COLLATE NOCASE')
    .all()
    .map(toMeta)
}

export function getAttachmentRow(id: string): AttachmentRow | undefined {
  return getDb().prepare<[string], AttachmentRow>('SELECT * FROM attachments WHERE id = ?').get(id)
}

export function getAttachmentByName(name: string): AttachmentRow | undefined {
  return getDb().prepare<[string], AttachmentRow>('SELECT * FROM attachments WHERE name = ?').get(name)
}

/** De-duplicates a filename against all attachment rows (trashed included — names are globally unique). */
function dedupeName(name: string): string {
  const db = getDb()
  const stmt = db.prepare('SELECT 1 FROM attachments WHERE name = ?')
  let candidate = name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let n = 2
  while (stmt.get(candidate)) {
    candidate = `${stem} ${n}${ext}`
    n++
  }
  return candidate
}

export function createAttachment(name: string, mime: string, bytes: Uint8Array): AttachmentMeta {
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Attachment too large (${Math.round(bytes.byteLength / 1024 / 1024)}MB) — 25MB max`)
  }
  ensureAttachmentsDir()
  const safeName = dedupeName(name.replace(/[\\/:*?"<>|#]/g, '-').trim() || 'attachment')
  const now = Date.now()
  const id = `local-${randomUUID()}`
  writeFileSync(attachmentPath(safeName), bytes)
  const hash = md5Buffer(bytes)
  getDb()
    .prepare(
      `INSERT INTO attachments (id, name, parent_id, mime, size, local_hash, synced_hash, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, '', ?, ?)`
    )
    .run(id, safeName, mime, bytes.byteLength, hash, now, now)
  bus.emit('vault:changed')
  bus.emit('attachment:saved', id)
  return toMeta(getAttachmentRow(id)!)
}

export function setAttachmentRemote(id: string, patch: {
  remoteHash?: string | null
  remoteVersion?: string | null
  syncedHash?: string
  size?: number
  mime?: string
}): void {
  const db = getDb()
  const sets: string[] = ['updated_at = ?']
  const vals: unknown[] = [Date.now()]
  if (patch.syncedHash !== undefined) {
    sets.push('synced_hash = ?', 'remote_hash = ?')
    vals.push(patch.syncedHash, patch.syncedHash)
  }
  if (patch.remoteVersion !== undefined) {
    sets.push('remote_version = ?')
    vals.push(patch.remoteVersion)
  }
  if (patch.remoteHash !== undefined) {
    sets.push('remote_hash = ?')
    vals.push(patch.remoteHash)
  }
  if (patch.size !== undefined) {
    sets.push('size = ?')
    vals.push(patch.size)
  }
  if (patch.mime !== undefined) {
    sets.push('mime = ?')
    vals.push(patch.mime)
  }
  vals.push(id)
  db.prepare(`UPDATE attachments SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

/** Applies remote binary content: writes the file and re-baselines the row. */
export function applyRemoteAttachment(
  id: string,
  name: string,
  bytes: Uint8Array,
  remoteHash: string,
  remoteVersion: string | null,
  mime: string,
  modifiedRemote: number
): void {
  void modifiedRemote
  ensureAttachmentsDir()
  writeFileSync(attachmentPath(name), bytes)
  const db = getDb()
  db.prepare(
    `UPDATE attachments SET local_hash = ?, synced_hash = ?, remote_hash = ?, remote_version = ?, mime = ?, size = ?,
      remote_trashed = 0, trashed = 0, updated_at = ? WHERE id = ?`
  ).run(md5Buffer(bytes), remoteHash, remoteHash, remoteVersion, mime, bytes.byteLength, Date.now(), id)
  bus.emit('vault:changed')
}

export function swapAttachmentId(oldId: string, newId: string): void {
  if (oldId === newId) return
  getDb().prepare('UPDATE attachments SET id = ? WHERE id = ?').run(newId, oldId)
}

export function upsertRemoteAttachmentRow(opts: {
  id: string
  name: string
  mime: string
}): AttachmentRow {
  const existing = getAttachmentRow(opts.id)
  if (existing) return existing
  // Drive permits duplicate names across folders; the local cache is flat, so de-dupe.
  let name = opts.name
  const taken = getAttachmentByName(name)
  if (taken && taken.id !== opts.id) {
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    let n = 2
    while (getAttachmentByName(`${stem} ${n}${ext}`)) n++
    name = `${stem} ${n}${ext}`
  }
  const now = Date.now()
  getDb()
    .prepare('INSERT INTO attachments (id, name, mime, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(opts.id, name, opts.mime, now, now)
  return getAttachmentRow(opts.id)!
}

export function renameAttachment(id: string, newName: string): void {
  const row = getAttachmentRow(id)
  if (!row) return
  const safe = dedupeName(newName.replace(/[\\/:*?"<>|#]/g, '-').trim())
  try {
    if (existsSync(attachmentPath(row.name))) {
      copyFileSync(attachmentPath(row.name), attachmentPath(safe))
      rmSync(attachmentPath(row.name))
    }
  } catch (err) {
    console.error('[attachments] rename file failed:', err)
  }
  getDb().prepare('UPDATE attachments SET name = ?, updated_at = ? WHERE id = ?').run(safe, Date.now(), id)
  bus.emit('vault:changed')
  bus.emit('attachment:saved', id)
}

export function trashAttachment(id: string): void {
  getDb().prepare('UPDATE attachments SET trashed = 1, updated_at = ? WHERE id = ?').run(Date.now(), id)
  bus.emit('vault:changed')
  bus.emit('attachment:saved', id)
}

export function markAttachmentRemoteTrashed(id: string): void {
  getDb().prepare('UPDATE attachments SET trashed = 1, remote_trashed = 1 WHERE id = ?').run(id)
}

export function getDirtyAttachments(): AttachmentRow[] {
  return getDb()
    .prepare<[], AttachmentRow>(
      `SELECT * FROM attachments WHERE trashed = 0 AND local_hash != synced_hash
       UNION ALL SELECT * FROM attachments WHERE trashed = 1 AND remote_trashed = 0 AND id NOT LIKE 'local-%'`
    )
    .all()
}

export function getActiveAttachmentRows(): AttachmentRow[] {
  return getDb().prepare<[], AttachmentRow>('SELECT * FROM attachments WHERE trashed = 0').all()
}

/** Conflict copy: duplicates the on-disk file under a conflict name and rows it as a new local attachment. */
export function createAttachmentConflictCopy(row: AttachmentRow): AttachmentMeta {
  const dot = row.name.lastIndexOf('.')
  const stem = dot > 0 ? row.name.slice(0, dot) : row.name
  const ext = dot > 0 ? row.name.slice(dot) : ''
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`
  const conflictName = dedupeName(`${stem} (conflict ${stamp})${ext}`)
  ensureAttachmentsDir()
  try {
    const src = readFileSync(attachmentPath(row.name))
    writeFileSync(attachmentPath(conflictName), src)
    const now = Date.now()
    const id = `local-${randomUUID()}`
    getDb()
      .prepare(
        `INSERT INTO attachments (id, name, mime, size, local_hash, synced_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, '', ?, ?)`
      )
      .run(id, conflictName, row.mime, row.size, md5Buffer(src), now, now)
    bus.emit('vault:changed')
    return toMeta(getAttachmentRow(id)!)
  } catch (err) {
    console.error('[attachments] conflict copy failed:', err)
    throw err
  }
}
