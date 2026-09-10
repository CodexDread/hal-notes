import { createHash, randomUUID } from 'crypto'
import {
  buildPath,
  parseTags,
  parseWikiLinks,
  sanitizeFileName,
  stripMdExtension
} from '@shared/parse'
import type { Backlink, FolderMeta, NoteMeta, SearchHit, TagCount, VaultSnapshot } from '@shared/types'
import { ftsQuery } from '@shared/sync-logic'
import { bus } from '../events'
import { getDb } from './db'

export function md5(s: string): string {
  return createHash('md5').update(s, 'utf8').digest('hex')
}

export function newLocalId(): string {
  return `local-${randomUUID()}`
}

export interface NoteRow {
  id: string
  name: string
  path: string
  parent_id: string | null
  content: string
  local_hash: string
  synced_hash: string
  remote_hash: string | null
  remote_version: string | null
  modified_local: number
  modified_remote: number | null
  trashed: number
  remote_trashed: number
  conflicted: number
  content_version: number
  created_at: number
  updated_at: number
}

export interface FolderRow {
  id: string
  name: string
  path: string
  parent_id: string | null
  trashed: number
  remote_trashed: number
}

function toNoteMeta(r: NoteRow): NoteMeta {
  return {
    id: r.id,
    name: r.name,
    path: r.path,
    parentId: r.parent_id,
    modifiedLocal: r.modified_local,
    modifiedRemote: r.modified_remote,
    trashed: r.trashed === 1,
    pendingSync: r.local_hash !== r.synced_hash || (r.trashed === 1 && r.remote_trashed === 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

function toFolderMeta(r: FolderRow): FolderMeta {
  return { id: r.id, name: r.name, path: r.path, parentId: r.parent_id, trashed: r.trashed === 1 }
}

export function listVault(): VaultSnapshot {
  const notes = getDb()
    .prepare<[], NoteRow>('SELECT * FROM notes WHERE trashed = 0 ORDER BY path COLLATE NOCASE')
    .all()
    .map(toNoteMeta)
  const folders = getDb()
    .prepare<[], FolderRow>('SELECT * FROM folders WHERE trashed = 0 ORDER BY path COLLATE NOCASE')
    .all()
    .map(toFolderMeta)
  return { notes, folders, driveConnected: false }
}

export function getNoteRow(id: string): NoteRow | undefined {
  return getDb().prepare<[string], NoteRow>('SELECT * FROM notes WHERE id = ?').get(id)
}

export function getFolderRow(id: string): FolderRow | undefined {
  return getDb().prepare<[string], FolderRow>('SELECT * FROM folders WHERE id = ?').get(id)
}

export function openNote(id: string): { meta: NoteMeta; content: string } | null {
  const row = getNoteRow(id)
  if (!row) return null
  return { meta: toNoteMeta(row), content: row.content }
}

function folderPath(parentId: string | null): string | null {
  if (!parentId) return null
  const f = getFolderRow(parentId)
  return f ? f.path : null
}

function uniqueName(parentId: string | null, desired: string, isFolder: boolean): string {
  const table = isFolder ? 'folders' : 'notes'
  const parentPath = folderPath(parentId)
  const prefix = parentPath ? `${parentPath}/` : ''
  let name = sanitizeFileName(desired)
  let candidate = name
  let n = 2
  const stmt = getDb().prepare(`SELECT 1 FROM ${table} WHERE path = ?`)
  while (stmt.get(prefix + candidate)) {
    candidate = `${name} ${n}`
    n++
  }
  return candidate
}

export function insertNote(opts: {
  id: string
  name: string
  parentId: string | null
  content: string
  syncedHash?: string
  remoteHash?: string | null
  remoteVersion?: string | null
  modifiedRemote?: number | null
}): NoteMeta {
  const now = Date.now()
  const parentPath = folderPath(opts.parentId)
  const name = uniqueName(opts.parentId, opts.name, false)
  const path = buildPath(parentPath, name)
  getDb()
    .prepare(
      `INSERT INTO notes (id, name, path, parent_id, content, local_hash, synced_hash, remote_hash, remote_version,
        modified_local, modified_remote, trashed, remote_trashed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
    )
    .run(
      opts.id,
      name,
      path,
      opts.parentId,
      opts.content,
      md5(opts.content),
      opts.syncedHash ?? '',
      opts.remoteHash ?? null,
      opts.remoteVersion ?? null,
      now,
      opts.modifiedRemote ?? null,
      now,
      now
    )
  const row = getNoteRow(opts.id)!
  reindexNote(opts.id, opts.content)
  return toNoteMeta(row)
}

export function getNoteRowByPath(path: string): NoteRow | undefined {
  return getDb().prepare<[string], NoteRow>('SELECT * FROM notes WHERE path = ?').get(path)
}

export function getAllLocalFolders(): FolderRow[] {
  return getDb().prepare<[], FolderRow>('SELECT * FROM folders WHERE trashed = 0').all()
}

export function getActiveNoteRows(): NoteRow[] {
  return getDb().prepare<[], NoteRow>('SELECT * FROM notes WHERE trashed = 0').all()
}

/** Name-only remote change: no local-dirty bump, no push. */
export function applyRemoteRename(id: string, name: string): void {
  const row = getNoteRow(id)
  if (!row) return
  const path = buildPath(folderPath(row.parent_id), name)
  getDb().prepare('UPDATE notes SET name = ?, path = ?, updated_at = ? WHERE id = ?').run(name, path, Date.now(), id)
  bus.emit('vault:changed')
}

export function createNote(parentId: string | null, desiredName = 'Untitled'): NoteMeta {
  const meta = insertNote({ id: newLocalId(), name: desiredName, parentId, content: '' })
  bus.emit('vault:changed')
  bus.emit('note:saved', meta.id)
  return meta
}

export function createNoteWithContent(opts: {
  id?: string
  name: string
  parentId: string | null
  content: string
}): NoteMeta {
  return insertNote({ id: opts.id ?? newLocalId(), name: opts.name, parentId: opts.parentId, content: opts.content })
}

export function saveNoteContent(id: string, content: string): NoteMeta | null {
  const row = getNoteRow(id)
  if (!row) return null
  const now = Date.now()
  getDb()
    .prepare(
      `UPDATE notes SET content = ?, local_hash = ?, modified_local = ?, updated_at = ?,
        content_version = content_version + 1 WHERE id = ?`
    )
    .run(content, md5(content), now, now, id)
  reindexNote(id, content)
  const meta = toNoteMeta(getNoteRow(id)!)
  bus.emit('note:saved', id)
  bus.emit('vault:changed')
  return meta
}

/** Remote content applied by the sync engine: does not bump content_version or queue a push. */
export function applyRemoteContent(
  id: string,
  content: string,
  remoteHash: string,
  remoteVersion: string | null,
  modifiedRemote: number
): void {
  const row = getNoteRow(id)
  if (!row) return
  getDb()
    .prepare(
      `UPDATE notes SET content = ?, local_hash = ?, synced_hash = ?, remote_hash = ?, remote_version = ?,
        modified_remote = ?, modified_local = ?, updated_at = ? WHERE id = ?`
    )
    .run(content, remoteHash, remoteHash, remoteHash, remoteVersion, modifiedRemote, modifiedRemote, Date.now(), id)
  reindexNote(id, content)
  bus.emit('note:updated', id, content)
  bus.emit('vault:changed')
}

export function renameNote(id: string, desiredName: string): NoteMeta | null {
  const row = getNoteRow(id)
  if (!row) return null
  const name = uniqueName(row.parent_id, stripMdExtension(desiredName), false)
  const path = buildPath(folderPath(row.parent_id), name)
  const now = Date.now()
  getDb().prepare('UPDATE notes SET name = ?, path = ?, modified_local = ?, updated_at = ? WHERE id = ?').run(
    name,
    path,
    now,
    now,
    id
  )
  bus.emit('note:saved', id)
  bus.emit('vault:changed')
  return toNoteMeta(getNoteRow(id)!)
}

export function trashNote(id: string): void {
  getDb().prepare('UPDATE notes SET trashed = 1, updated_at = ? WHERE id = ?').run(Date.now(), id)
  bus.emit('note:saved', id)
  bus.emit('vault:changed')
}

export function createFolder(parentId: string | null, desiredName = 'New folder'): FolderMeta {
  const name = uniqueName(parentId, desiredName, true)
  const path = buildPath(folderPath(parentId), name)
  const id = newLocalId()
  getDb()
    .prepare('INSERT INTO folders (id, name, path, parent_id) VALUES (?, ?, ?, ?)')
    .run(id, name, path, parentId)
  bus.emit('vault:changed')
  const row = getFolderRow(id)!
  return toFolderMeta(row)
}

/** Finds an untrashed folder by name under a parent (null = vault root), creating it if missing. */
export function ensureFolderUnder(parentId: string | null, name: string): FolderMeta {
  const existing = getDb()
    .prepare<[string | null, string], FolderRow>(
      'SELECT * FROM folders WHERE parent_id IS ? AND name = ? AND trashed = 0'
    )
    .get(parentId, name)
  if (existing) return toFolderMeta(existing)
  return createFolder(parentId, name)
}

export function renameFolder(id: string, desiredName: string): void {
  const row = getFolderRow(id)
  if (!row) return
  const name = uniqueName(row.parent_id, desiredName, true)
  renameFolderRow(id, name)
}

function renameFolderRow(id: string, name: string): void {
  const row = getFolderRow(id)
  if (!row) return
  const newPath = buildPath(folderPath(row.parent_id), name)
  const db = getDb()
  db.transaction(() => {
    db.prepare('UPDATE folders SET name = ?, path = ? WHERE id = ?').run(name, newPath, id)
    rewriteDescendantPaths('folders', id, newPath, row.path)
    rewriteDescendantPaths('notes', id, newPath, row.path)
  })()
  bus.emit('vault:changed')
}

function rewriteDescendantPaths(table: 'folders' | 'notes', folderId: string, newPath: string, oldPath: string): void {
  const db = getDb()
  const rows = db.prepare(`SELECT id, path FROM ${table} WHERE parent_id = ?`).all(folderId) as { id: string; path: string }[]
  for (const r of rows) {
    const childName = r.path.startsWith(`${oldPath}/`) ? r.path.slice(oldPath.length + 1) : r.path.split('/').pop()!
    const childPath = `${newPath}/${childName}`
    db.prepare(`UPDATE ${table} SET path = ? WHERE id = ?`).run(childPath, r.id)
    if (table === 'folders') rewriteDescendantPaths('folders', r.id, childPath, r.path)
    if (table === 'folders') rewriteDescendantPaths('notes', r.id, childPath, r.path)
  }
}

export function trashFolder(id: string): void {
  const db = getDb()
  const row = getFolderRow(id)
  if (!row) return
  db.transaction(() => {
    db.prepare('UPDATE folders SET trashed = 1 WHERE id = ?').run(id)
    trashDescendants(id)
  })()
  bus.emit('vault:changed')
}

function trashDescendants(folderId: string): void {
  const db = getDb()
  const folders = db.prepare('SELECT id FROM folders WHERE parent_id = ?').all(folderId) as { id: string }[]
  for (const f of folders) {
    db.prepare('UPDATE folders SET trashed = 1 WHERE id = ?').run(f.id)
    trashDescendants(f.id)
  }
  db.prepare('UPDATE notes SET trashed = 1, updated_at = ? WHERE parent_id = ?').run(Date.now(), folderId)
}

export function reindexNote(id: string, content: string): void {
  const db = getDb()
  const links = parseWikiLinks(content)
  const tags = parseTags(content)
  db.transaction(() => {
    db.prepare('DELETE FROM links WHERE source_id = ?').run(id)
    db.prepare('DELETE FROM tags WHERE note_id = ?').run(id)
    const insLink = db.prepare('INSERT OR IGNORE INTO links (source_id, target_name) VALUES (?, ?)')
    const insTag = db.prepare('INSERT OR IGNORE INTO tags (note_id, tag) VALUES (?, ?)')
    for (const l of links) insLink.run(id, l.target.toLowerCase())
    for (const t of tags) insTag.run(id, t.toLowerCase())
  })()
}

interface FtsRow {
  id: string
  name: string
  path: string
  rank: number
  snip: string
}

export function searchText(query: string, limit = 50): SearchHit[] {
  const q = ftsQuery(query)
  const rows = getDb()
    .prepare<[string, number], FtsRow>(
      `SELECT n.id, n.name, n.path, bm25(notes_fts) AS rank,
        snippet(notes_fts, 1, '\u0001', '\u0002', '…', 24) AS snip
       FROM notes_fts JOIN notes n ON n.rowid = notes_fts.rowid
       WHERE notes_fts MATCH ? AND n.trashed = 0
       ORDER BY rank LIMIT ?`
    )
    .all(q, limit)
  return rows.map((r) => ({
    noteId: r.id,
    name: r.name,
    path: r.path,
    snippet: r.snip.replaceAll('\u0001', '<b>').replaceAll('\u0002', '</b>'),
    score: -r.rank
  }))
}

export function backlinksFor(noteId: string): Backlink[] {
  const note = getNoteRow(noteId)
  if (!note) return []
  const rows = getDb()
    .prepare<[string, string], { id: string; name: string; path: string }>(
      `SELECT n.id, n.name, n.path FROM links l JOIN notes n ON n.id = l.source_id
       WHERE l.target_name = ? AND n.trashed = 0 AND n.id != ?
       ORDER BY n.updated_at DESC`
    )
    .all(note.name.toLowerCase(), noteId)
  return rows.map((r) => ({ noteId: r.id, name: r.name, path: r.path }))
}

export function resolveByName(name: string): NoteMeta | null {
  const target = name.trim().toLowerCase()
  const row = getDb()
    .prepare<[string], NoteRow>('SELECT * FROM notes WHERE trashed = 0 AND lower(name) = ? ORDER BY path LIMIT 1')
    .get(target)
  return row ? toNoteMeta(row) : null
}

interface TagRow {
  tag: string
  count: number
}

export function listTags(): TagCount[] {
  return getDb()
    .prepare<[], TagRow>(
      `SELECT t.tag, COUNT(*) AS count FROM tags t JOIN notes n ON n.id = t.note_id
       WHERE n.trashed = 0 GROUP BY t.tag ORDER BY count DESC, t.tag`
    )
    .all()
}

export function noteIdsForTag(tag: string): string[] {
  const rows = getDb()
    .prepare<[string], { note_id: string }>(
      `SELECT t.note_id FROM tags t JOIN notes n ON n.id = t.note_id
       WHERE t.tag = ? AND n.trashed = 0`
    )
    .all(tag.toLowerCase())
  return rows.map((r) => r.note_id)
}

export function swapNoteId(oldId: string, newId: string): void {
  if (oldId === newId) return
  getDb().prepare('UPDATE notes SET id = ? WHERE id = ?').run(newId, oldId)
}

export function swapFolderId(oldId: string, newId: string): void {
  if (oldId === newId) return
  const db = getDb()
  db.transaction(() => {
    db.prepare('UPDATE folders SET id = ? WHERE id = ?').run(newId, oldId)
    db.prepare('UPDATE folders SET parent_id = ? WHERE parent_id = ?').run(newId, oldId)
    db.prepare('UPDATE notes SET parent_id = ? WHERE parent_id = ?').run(newId, oldId)
  })()
}

export function markSynced(
  id: string,
  remoteHash: string,
  remoteVersion: string | null,
  modifiedRemote: number
): void {
  getDb()
    .prepare(
      `UPDATE notes SET synced_hash = ?, remote_hash = ?, remote_version = ?, modified_remote = ?,
        remote_trashed = 0 WHERE id = ?`
    )
    .run(remoteHash, remoteHash, remoteVersion, modifiedRemote, id)
}

export function markRemoteTrashed(id: string): void {
  getDb().prepare('UPDATE notes SET remote_trashed = 1, trashed = 1 WHERE id = ?').run(id)
}

export function getDirtyNotes(): NoteRow[] {
  return getDb()
    .prepare<[], NoteRow>(
      `SELECT * FROM notes WHERE trashed = 0 AND local_hash != synced_hash
       UNION ALL SELECT * FROM notes WHERE trashed = 1 AND remote_trashed = 0 AND id NOT LIKE 'local-%'`
    )
    .all()
}

export function getLocalFolders(): FolderRow[] {
  return getDb().prepare<[], FolderRow>("SELECT * FROM folders WHERE trashed = 0 AND id LIKE 'local-%'").all()
}

export function getAllNoteRows(): NoteRow[] {
  return getDb().prepare<[], NoteRow>('SELECT * FROM notes').all()
}

export function noteNameList(limit = 2000): string[] {
  const rows = getDb()
    .prepare<[number], { name: string }>('SELECT name FROM notes WHERE trashed = 0 ORDER BY updated_at DESC LIMIT ?')
    .all(limit)
  return rows.map((r) => r.name)
}

export function upsertRemoteFolder(id: string, name: string, parentId: string | null): FolderMeta {
  const existing = getFolderRow(id)
  if (existing) {
    if (existing.name !== name || existing.parent_id !== parentId) {
      const db = getDb()
      const newPath = buildPath(folderPath(parentId), name)
      const oldPath = existing.path
      db.transaction(() => {
        db.prepare('UPDATE folders SET name = ?, path = ?, parent_id = ? WHERE id = ?').run(name, newPath, parentId, id)
        rewriteDescendantPaths('folders', id, newPath, oldPath)
        rewriteDescendantPaths('notes', id, newPath, oldPath)
      })()
    }
    return toFolderMeta(getFolderRow(id)!)
  }
  const path = buildPath(folderPath(parentId), name)
  getDb().prepare('INSERT INTO folders (id, name, path, parent_id) VALUES (?, ?, ?, ?)').run(id, name, path, parentId)
  return toFolderMeta(getFolderRow(id)!)
}

export function markFolderRemoteTrashed(id: string): void {
  const db = getDb()
  db.prepare('UPDATE folders SET trashed = 1, remote_trashed = 1 WHERE id = ?').run(id)
  const children = db.prepare('SELECT id FROM folders WHERE parent_id = ?').all(id) as { id: string }[]
  for (const c of children) markFolderRemoteTrashed(c.id)
  db.prepare('UPDATE notes SET trashed = 1, remote_trashed = 1 WHERE parent_id = ?').run(id)
}
