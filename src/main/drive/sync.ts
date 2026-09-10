import type { drive_v3 } from 'googleapis'
import { readFile } from 'fs/promises'
import { computeSyncAction, conflictCopyName, isLocalId } from '@shared/sync-logic'
import type { SyncStatus } from '@shared/types'
import { bus } from '../events'
import {
  applyRemoteAttachment,
  attachmentPath,
  createAttachmentConflictCopy,
  getActiveAttachmentRows,
  getAttachmentByName,
  getAttachmentRow,
  getDirtyAttachments,
  markAttachmentRemoteTrashed,
  md5Buffer,
  renameAttachment,
  setAttachmentRemote,
  swapAttachmentId,
  upsertRemoteAttachmentRow,
  type AttachmentRow
} from '../store/attachments'
import { getMeta, setMeta } from '../store/db'
import {
  applyRemoteContent,
  applyRemoteRename,
  createNoteWithContent,
  ensureFolderUnder,
  getActiveNoteRows,
  getAllLocalFolders,
  getDirtyNotes,
  getFolderRow,
  getLocalFolders,
  getNoteRow,
  getNoteRowByPath,
  insertNote,
  markFolderRemoteTrashed,
  markRemoteTrashed,
  markSynced,
  md5,
  swapFolderId,
  swapNoteId,
  upsertRemoteFolder,
  type NoteRow
} from '../store/notes'
import { getSettings } from '../store/settings'
import { driveAuth } from './auth'
import {
  createRemoteFolder,
  downloadBinaryTo,
  downloadNote,
  findRootFolder,
  getStartPageToken,
  listChanges,
  listChildren,
  tempBinaryPath,
  trashRemoteItem,
  uploadBinaryUpdate,
  uploadNewBinary,
  uploadNewNote,
  uploadNoteUpdate,
  type RemoteChange,
  type RemoteItem
} from './files'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const PUSH_DEBOUNCE_MS = 2_000

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain'
}

function guessMime(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return 'application/octet-stream'
  return MIME_BY_EXT[name.slice(dot).toLowerCase()] ?? 'application/octet-stream'
}

class SyncEngine {
  status: SyncStatus = { state: 'unlinked', lastSyncAt: null, message: '', pending: 0 }
  private pushTimers = new Map<string, NodeJS.Timeout>()
  private pullTimer: NodeJS.Timeout | null = null
  private running = false
  private lastFocusPull = 0

  start(): void {
    bus.on('note:saved', (id: string) => this.queuePush(id))
    bus.on('attachment:saved', (id: string) => this.queueAttachmentPush(id))
    bus.on('settings:changed', () => this.restartPullLoop())
    this.restartPullLoop()
    void this.initialSync()
  }

  private restartPullLoop(): void {
    if (this.pullTimer) clearInterval(this.pullTimer)
    const interval = getSettings().syncIntervalMs
    this.pullTimer = setInterval(() => {
      void this.pullChanges()
    }, Math.max(10_000, interval))
  }

  onWindowFocus(): void {
    const now = Date.now()
    if (now - this.lastFocusPull < 5_000) return
    this.lastFocusPull = now
    void this.pullChanges()
  }

  private setStatus(partial: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...partial }
    this.status.pending = getDirtyNotes().length + getDirtyAttachments().length
    bus.emit('sync:status', this.status)
  }

  queueAttachmentPush(id: string, delay = PUSH_DEBOUNCE_MS): void {
    if (!driveAuth.isConnected()) return
    const key = `att:${id}`
    const existing = this.pushTimers.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.pushTimers.delete(key)
      void this.pushOneAttachment(id)
    }, delay)
    this.pushTimers.set(key, timer)
    this.setStatus({})
  }

  private vaultFolderId(): string | null {
    return getMeta('vault_folder_id')
  }

  private async initialSync(): Promise<void> {
    if (!driveAuth.isConnected()) {
      this.setStatus({ state: 'unlinked', message: '' })
      return
    }
    this.setStatus({ state: 'idle' })
    if (!getMeta('drive_change_token')) {
      await this.syncNow()
    } else {
      await this.pullChanges()
    }
  }

  queuePush(id: string, delay = PUSH_DEBOUNCE_MS): void {
    if (!driveAuth.isConnected()) return
    const existing = this.pushTimers.get(id)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.pushTimers.delete(id)
      void this.pushOne(id)
    }, delay)
    this.pushTimers.set(id, timer)
    this.setStatus({})
  }

  private async drive(): Promise<drive_v3.Drive> {
    return driveAuth.getDrive()
  }

  /** Ensures the vault root folder exists in Drive and returns its id. */
  private async ensureVaultFolder(): Promise<string> {
    const name = getSettings().vaultFolderName
    const drive = await this.drive()
    const existing = await findRootFolder(drive, name)
    const id = existing ? existing.id : (await createRemoteFolder(drive, name, 'root')).id
    const known = getMeta('vault_folder_id')
    if (known !== id) {
      setMeta('vault_folder_id', id)
      setMeta('drive_change_token', '')
    }
    return id
  }

  async syncNow(): Promise<void> {
    if (!driveAuth.isConnected()) {
      this.setStatus({ state: 'unlinked', message: 'Google Drive not connected' })
      return
    }
    if (this.running) return
    this.running = true
    this.setStatus({ state: 'syncing', message: '' })
    try {
      const rootId = await this.ensureVaultFolder()
      await this.pushLocalFolders(rootId)
      const tree = await this.fetchVaultTree(rootId)
      await this.reconcileRemoteTree(rootId, tree)
      await this.pushAllDirty(rootId)
      if (!getMeta('drive_change_token')) {
        setMeta('drive_change_token', await getStartPageToken(await this.drive()))
      }
      setMeta('last_sync_at', String(Date.now()))
      this.setStatus({ state: 'idle', message: '', lastSyncAt: Date.now() })
      bus.emit('vault:changed')
    } catch (err) {
      this.handleSyncError(err)
    } finally {
      this.running = false
    }
  }
  async pullChanges(): Promise<void> {
    if (!driveAuth.isConnected() || this.running) return
    const token = getMeta('drive_change_token')
    if (!token) {
      await this.syncNow()
      return
    }
    this.running = true
    this.setStatus({ state: 'syncing' })
    try {
      const drive = await this.drive()
      const rootId = this.vaultFolderId() ?? (await this.ensureVaultFolder())
      const { changes, newStartPageToken } = await listChanges(drive, token)
      let touched = false
      for (const change of changes) {
        if (await this.applyChange(rootId, change)) touched = true
      }
      setMeta('drive_change_token', newStartPageToken)
      setMeta('last_sync_at', String(Date.now()))
      if (touched) bus.emit('vault:changed')
      this.setStatus({ state: 'idle', lastSyncAt: Date.now() })
    } catch (err) {
      this.handleSyncError(err)
    } finally {
      this.running = false
    }
  }

  private async fetchVaultTree(
    rootId: string
  ): Promise<{ folders: RemoteItem[]; files: RemoteItem[]; binaries: RemoteItem[] }> {
    const drive = await this.drive()
    const folders: RemoteItem[] = []
    const files: RemoteItem[] = []
    const binaries: RemoteItem[] = []
    const walk = async (folderId: string, modelParentId: string | null): Promise<void> => {
      const children = await listChildren(drive, folderId)
      for (const child of children) {
        if (child.mimeType === FOLDER_MIME) {
          folders.push({ ...child, parentId: modelParentId })
          await walk(child.id, child.id)
        } else if (child.name.toLowerCase().endsWith('.md')) {
          files.push({ ...child, parentId: modelParentId })
        } else {
          binaries.push({ ...child, parentId: modelParentId })
        }
      }
    }
    await walk(rootId, null)
    return { folders, files, binaries }
  }

  private async reconcileRemoteTree(
    rootId: string,
    tree: { folders: RemoteItem[]; files: RemoteItem[]; binaries: RemoteItem[] }
  ): Promise<void> {
    const remoteFolderIds = new Set(tree.folders.map((f) => f.id))
    for (const folder of tree.folders) {
      upsertRemoteFolder(folder.id, folder.name, folder.parentId)
    }
    for (const row of getAllLocalFolders()) {
      if (!isLocalId(row.id) && !remoteFolderIds.has(row.id)) {
        markFolderRemoteTrashed(row.id)
      }
    }

    const remoteFileIds = new Set(tree.files.map((f) => f.id))
    for (const file of tree.files) {
      await this.applyRemoteFile(file, rootId)
    }
    for (const row of getActiveNoteRows()) {
      if (!isLocalId(row.id) && !remoteFileIds.has(row.id)) {
        markRemoteTrashed(row.id)
      }
    }

    const remoteBinaryIds = new Set(tree.binaries.map((f) => f.id))
    for (const file of tree.binaries) {
      await this.applyRemoteBinary(file)
    }
    for (const row of getActiveAttachmentRows()) {
      if (!isLocalId(row.id) && !remoteBinaryIds.has(row.id)) {
        markAttachmentRemoteTrashed(row.id)
      }
    }
  }

  /** A remote binary (attachment) we may or may not know: adopt, pull, or conflict-copy. */
  private async applyRemoteBinary(file: RemoteItem): Promise<void> {
    const name = file.name
    let existing = getAttachmentRow(file.id)

    if (!existing) {
      const twin = getAttachmentByName(name)
      if (twin && isLocalId(twin.id) && twin.synced_hash === '') {
        swapAttachmentId(twin.id, file.id)
        existing = getAttachmentRow(file.id)
        if (existing && existing.local_hash === file.md5) {
          setAttachmentRemote(file.id, {
            syncedHash: file.md5 ?? existing.local_hash,
            remoteVersion: file.version,
            remoteHash: file.md5
          })
          bus.emit('vault:changed')
          return
        }
        if (existing) {
          // Independently created on both sides: keep the local bytes as a conflict copy.
          createAttachmentConflictCopy(existing)
        }
      }
    }

    if (!existing) {
      upsertRemoteAttachmentRow({ id: file.id, name, mime: guessMime(name) })
      await this.pullBinaryContent(file)
      bus.emit('vault:changed')
      return
    }

    const action = computeSyncAction(existing.local_hash, existing.synced_hash, file.md5)
    if (action === 'pull') {
      await this.pullBinaryContent(file, existing.name)
    } else if (action === 'conflict') {
      createAttachmentConflictCopy(existing)
      await this.pullBinaryContent(file, existing.name)
      this.setStatus({ state: 'conflict', message: `Attachment conflict on "${existing.name}" — both versions kept` })
    } else if (existing.name !== name && existing.local_hash === existing.synced_hash) {
      renameAttachment(existing.id, name)
    } else {
      setAttachmentRemote(existing.id, {
        remoteHash: file.md5,
        remoteVersion: file.version,
        syncedHash: file.md5 ?? existing.synced_hash
      })
    }
  }

  private async pullBinaryContent(file: RemoteItem, localName?: string): Promise<void> {
    const drive = await this.drive()
    const row = getAttachmentRow(file.id)
    const destName = localName ?? file.name
    const tmp = tempBinaryPath(destName)
    await downloadBinaryTo(drive, file.id, tmp)
    const bytes = await readFile(tmp)
    applyRemoteAttachment(
      file.id,
      destName,
      new Uint8Array(bytes),
      file.md5 ?? md5Buffer(new Uint8Array(bytes)),
      file.version,
      guessMime(destName),
      Date.parse(file.modifiedTime) || Date.now()
    )
    void row
  }

  private async applyRemoteFile(file: RemoteItem, rootId: string): Promise<void> {
    const parentId = file.parentId === rootId ? null : file.parentId
    const name = file.name.replace(/\.md$/i, '')
    const existing = getNoteRow(file.id)

    if (!existing) {
      await this.adoptOrInsertRemote(file, parentId, name)
      return
    }

    const action = computeSyncAction(existing.local_hash, existing.synced_hash, file.md5)
    if (action === 'pull') {
      const drive = await this.drive()
      const content = await downloadNote(drive, file.id)
      applyRemoteContent(
        file.id,
        content,
        file.md5 ?? md5(content),
        file.version,
        Date.parse(file.modifiedTime) || Date.now()
      )
    } else if (action === 'conflict') {
      await this.resolveConflict(existing, file)
    } else if (existing.name !== name && existing.local_hash === existing.synced_hash) {
      applyRemoteRename(file.id, name)
    } else {
      markSynced(file.id, file.md5 ?? existing.local_hash, file.version, Date.parse(file.modifiedTime) || Date.now())
    }
  }

  /** A remote file we have never seen: adopt an identical offline-created local note, or insert fresh. */
  private async adoptOrInsertRemote(file: RemoteItem, parentId: string | null, name: string): Promise<void> {
    const folder = parentId ? getFolderRow(parentId) : null
    const path = folder ? `${folder.path}/${name}` : name
    const localTwin = getNoteRowByPath(path)

    if (localTwin && isLocalId(localTwin.id) && localTwin.synced_hash === '') {
      swapNoteId(localTwin.id, file.id)
      if (localTwin.local_hash === file.md5) {
        markSynced(file.id, file.md5 ?? localTwin.local_hash, file.version, Date.parse(file.modifiedTime) || Date.now())
      } else {
        // Both sides created content independently: local stays as the note, remote content is kept as a copy.
        const drive = await this.drive()
        const remoteContent = await downloadNote(drive, file.id)
        createNoteWithContent({ name: conflictCopyName(name), parentId, content: remoteContent })
        this.queuePush(file.id, 1_000)
      }
      bus.emit('vault:changed')
      return
    }

    const drive = await this.drive()
    const content = await downloadNote(drive, file.id)
    insertNote({
      id: file.id,
      name,
      parentId,
      content,
      syncedHash: file.md5 ?? md5(content),
      remoteHash: file.md5,
      remoteVersion: file.version,
      modifiedRemote: Date.parse(file.modifiedTime) || Date.now()
    })
    bus.emit('vault:changed')
  }

  private async resolveConflict(local: NoteRow, remote: RemoteItem): Promise<void> {
    const drive = await this.drive()
    const remoteContent = await downloadNote(drive, remote.id)
    const remoteModified = Date.parse(remote.modifiedTime) || 0
    const localWins = local.modified_local >= remoteModified

    if (localWins) {
      createNoteWithContent({ name: conflictCopyName(local.name), parentId: local.parent_id, content: remoteContent })
      this.queuePush(local.id, 1_000)
      bus.emit('vault:changed')
    } else {
      createNoteWithContent({ name: conflictCopyName(local.name), parentId: local.parent_id, content: local.content })
      applyRemoteContent(local.id, remoteContent, remote.md5 ?? md5(remoteContent), remote.version, remoteModified)
    }
    this.setStatus({ state: 'conflict', message: `Conflict in "${local.name}" — both versions kept` })
  }

  private async pushLocalFolders(rootId: string): Promise<void> {
    const drive = await this.drive()
    const locals = getLocalFolders().sort((a, b) => a.path.length - b.path.length)
    for (const folder of locals) {
      const parentRemoteId = this.parentRemoteId(folder.parent_id, rootId)
      const created = await createRemoteFolder(drive, folder.name, parentRemoteId)
      swapFolderId(folder.id, created.id)
      bus.emit('vault:changed')
    }
  }

  private async pushAllDirty(rootId: string): Promise<void> {
    for (const row of getDirtyNotes()) {
      try {
        await this.pushRow(row, rootId)
      } catch (err) {
        console.error(`Push failed for "${row.name}":`, err)
      }
    }
    for (const row of getDirtyAttachments()) {
      try {
        await this.pushAttachmentRow(row, rootId)
      } catch (err) {
        console.error(`Push failed for attachment "${row.name}":`, err)
      }
    }
  }

  private async pushOneAttachment(id: string): Promise<void> {
    if (!driveAuth.isConnected()) return
    if (this.running) {
      this.queueAttachmentPush(id, 3_000)
      return
    }
    const row = getAttachmentRow(id)
    if (!row) return
    const isDirty =
      row.local_hash !== row.synced_hash || (row.trashed === 1 && row.remote_trashed === 0)
    if (!isDirty) {
      this.setStatus({})
      return
    }
    this.setStatus({ state: 'syncing' })
    try {
      const rootId = this.vaultFolderId() ?? (await this.ensureVaultFolder())
      await this.pushAttachmentRow(row, rootId)
      this.setStatus({ state: 'idle', lastSyncAt: Date.now() })
    } catch (err) {
      this.handleSyncError(err)
    }
  }

  private async pushAttachmentRow(row: AttachmentRow, rootId: string): Promise<void> {
    if (row.trashed === 1 && isLocalId(row.id)) return
    const drive = await this.drive()

    if (row.trashed === 1 && row.remote_trashed === 0) {
      await trashRemoteItem(drive, row.id)
      markAttachmentRemoteTrashed(row.id)
      bus.emit('vault:changed')
      return
    }
    if (row.local_hash === row.synced_hash) return

    const folder = ensureFolderUnder(null, 'attachments')
    const parentRemoteId = this.parentRemoteId(folder.id, rootId)
    if (isLocalId(row.id)) {
      const res = await uploadNewBinary(drive, row.name, parentRemoteId, attachmentPath(row.name), row.mime)
      swapAttachmentId(row.id, res.id)
      setAttachmentRemote(res.id, { syncedHash: res.md5 ?? row.local_hash, remoteVersion: res.version })
    } else {
      const res = await uploadBinaryUpdate(drive, row.id, row.name, attachmentPath(row.name), row.mime)
      setAttachmentRemote(row.id, { syncedHash: res.md5 ?? row.local_hash, remoteVersion: res.version })
    }
    bus.emit('vault:changed')
  }

  private async pushOne(id: string): Promise<void> {
    if (!driveAuth.isConnected()) return
    if (this.running) {
      this.queuePush(id, 3_000)
      return
    }
    const row = getNoteRow(id)
    if (!row) return
    const isDirty = row.local_hash !== row.synced_hash || (row.trashed === 1 && row.remote_trashed === 0)
    if (!isDirty) {
      this.setStatus({})
      return
    }
    this.setStatus({ state: 'syncing' })
    try {
      const rootId = this.vaultFolderId() ?? (await this.ensureVaultFolder())
      await this.pushRow(row, rootId)
      this.setStatus({ state: 'idle', lastSyncAt: Date.now() })
    } catch (err) {
      this.handleSyncError(err)
    }
  }

  private async pushRow(row: NoteRow, rootId: string): Promise<void> {
    if (row.trashed === 1 && isLocalId(row.id)) return
    const drive = await this.drive()

    if (row.trashed === 1 && row.remote_trashed === 0) {
      await trashRemoteItem(drive, row.id)
      markRemoteTrashed(row.id)
      bus.emit('vault:changed')
      return
    }
    if (row.local_hash === row.synced_hash) return

    const parentRemoteId = this.parentRemoteId(row.parent_id, rootId)
    if (isLocalId(row.id)) {
      const res = await uploadNewNote(drive, row.name, parentRemoteId, row.content, row.modified_local)
      swapNoteId(row.id, res.id)
      markSynced(res.id, res.md5 ?? row.local_hash, res.version, Date.parse(res.modifiedTime) || Date.now())
    } else {
      const res = await uploadNoteUpdate(drive, row.id, row.name, row.content, row.modified_local)
      markSynced(row.id, res.md5 ?? row.local_hash, res.version, Date.parse(res.modifiedTime) || Date.now())
    }
    bus.emit('vault:changed')
  }

  private parentRemoteId(parentId: string | null, rootId: string): string {
    if (!parentId) return rootId
    const folder = getFolderRow(parentId)
    return folder && !isLocalId(folder.id) ? folder.id : rootId
  }

  private async applyChange(rootId: string, change: RemoteChange): Promise<boolean> {
    const { fileId, removed, file } = change
    const knownNote = getNoteRow(fileId)
    const knownFolder = getFolderRow(fileId)

    if (removed || file?.trashed) {
      if (knownNote && knownNote.remote_trashed === 0) {
        markRemoteTrashed(fileId)
        return true
      }
      if (knownFolder) {
        markFolderRemoteTrashed(fileId)
        return true
      }
      return false
    }
    if (!file || file.id === rootId) return false

    if (file.mimeType === FOLDER_MIME) {
      const inVault = file.parentId === rootId || !!getFolderRow(file.parentId ?? '')
      if (inVault) {
        upsertRemoteFolder(file.id, file.name, file.parentId === rootId ? null : file.parentId)
        return true
      }
      if (knownFolder) {
        markFolderRemoteTrashed(file.id)
        return true
      }
      return false
    }

    if (!file.name.toLowerCase().endsWith('.md')) {
      const inVault = file.parentId === rootId || !!getFolderRow(file.parentId ?? '')
      if (!inVault) {
        if (getAttachmentRow(file.id)) {
          markAttachmentRemoteTrashed(file.id)
          return true
        }
        return false
      }
      await this.applyRemoteBinary(file)
      return true
    }

    const inVault = file.parentId === rootId || !!getFolderRow(file.parentId ?? '')
    if (!inVault) {
      if (knownNote) {
        markRemoteTrashed(file.id)
        return true
      }
      return false
    }
    await this.applyRemoteFile(file, rootId)
    return true
  }

  private handleSyncError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err)
    if (/invalid_grant|invalid_request|401|unauthorized/i.test(message)) {
      driveAuth.disconnect()
      this.setStatus({ state: 'unlinked', message: 'Google Drive signed out — reconnect in Settings' })
      return
    }
    const offline = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|getaddrinfo|fetch failed/i.test(message)
    this.setStatus({ state: offline ? 'offline' : 'error', message })
  }
}

export const syncEngine = new SyncEngine()
