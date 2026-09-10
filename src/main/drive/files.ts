import { createReadStream, createWriteStream } from 'fs'
import { readFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { drive_v3 } from 'googleapis'

export const FOLDER_MIME = 'application/vnd.google-apps.folder'
export const MD_MIME = 'text/markdown'

export interface RemoteItem {
  id: string
  name: string
  mimeType: string
  parentId: string | null
  modifiedTime: string
  md5: string | null
  version: string | null
  trashed: boolean
}

const FILE_FIELDS = 'id, name, mimeType, parents, modifiedTime, md5Checksum, version, trashed'
const LIST_FIELDS = `nextPageToken, files(${FILE_FIELDS})`

function toRemote(f: drive_v3.Schema$File): RemoteItem {
  return {
    id: f.id!,
    name: f.name ?? '',
    mimeType: f.mimeType ?? '',
    parentId: f.parents?.[0] ?? null,
    modifiedTime: f.modifiedTime ?? '',
    md5: f.md5Checksum ?? null,
    version: f.version != null ? String(f.version) : null,
    trashed: f.trashed ?? false
  }
}

export async function listChildren(drive: drive_v3.Drive, folderId: string): Promise<RemoteItem[]> {
  const out: RemoteItem[] = []
  let pageToken: string | undefined
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: LIST_FIELDS,
      pageSize: 1000,
      pageToken,
      spaces: 'drive',
      supportsAllDrives: false
    })
    for (const f of res.data.files ?? []) out.push(toRemote(f))
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return out
}

export async function findRootFolder(drive: drive_v3.Drive, name: string): Promise<RemoteItem | null> {
  const res = await drive.files.list({
    q: `'root' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: LIST_FIELDS,
    pageSize: 10,
    spaces: 'drive'
  })
  const f = (res.data.files ?? [])[0]
  return f ? toRemote(f) : null
}

export async function createRemoteFolder(drive: drive_v3.Drive, name: string, parentId: string): Promise<RemoteItem> {
  const res = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: FILE_FIELDS
  })
  return toRemote(res.data)
}

export async function downloadNote(drive: drive_v3.Drive, fileId: string): Promise<string> {
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' })
  return typeof res.data === 'string' ? res.data : String(res.data)
}

/** Downloads a binary file to an absolute path, returning its byte size. */
export async function downloadBinaryTo(drive: drive_v3.Drive, fileId: string, destPath: string): Promise<number> {
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })
  const stream = res.data as unknown as NodeJS.ReadableStream
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(destPath)
    stream.on('error', reject)
    out.on('error', reject)
    out.on('finish', () => resolve())
    stream.pipe(out)
  })
  const bytes = await readFile(destPath)
  return bytes.byteLength
}

export async function uploadNewBinary(
  drive: drive_v3.Drive,
  name: string,
  parentId: string,
  absPath: string,
  mime: string
): Promise<UploadResult> {
  const res = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType: mime || 'application/octet-stream', body: createReadStream(absPath) },
    fields: 'id, md5Checksum, version, modifiedTime'
  })
  return {
    id: res.data.id!,
    md5: res.data.md5Checksum ?? null,
    version: res.data.version != null ? String(res.data.version) : null,
    modifiedTime: res.data.modifiedTime ?? new Date().toISOString()
  }
}

export async function uploadBinaryUpdate(
  drive: drive_v3.Drive,
  fileId: string,
  name: string,
  absPath: string,
  mime: string
): Promise<UploadResult> {
  const res = await drive.files.update({
    fileId,
    requestBody: { name },
    media: { mimeType: mime || 'application/octet-stream', body: createReadStream(absPath) },
    fields: 'id, md5Checksum, version, modifiedTime'
  })
  return {
    id: res.data.id!,
    md5: res.data.md5Checksum ?? null,
    version: res.data.version != null ? String(res.data.version) : null,
    modifiedTime: res.data.modifiedTime ?? new Date().toISOString()
  }
}

/** Temp-file scratch path used when buffering remote binaries. */
export function tempBinaryPath(name: string): string {
  return join(tmpdir(), `hal-${Date.now()}-${name.replace(/[^A-Za-z0-9._-]/g, '_')}`)
}

export async function cleanupTemp(path: string): Promise<void> {
  await unlink(path).catch(() => undefined)
}

export interface UploadResult {
  id: string
  md5: string | null
  version: string | null
  modifiedTime: string
}

export async function uploadNewNote(
  drive: drive_v3.Drive,
  name: string,
  parentId: string,
  content: string,
  modifiedLocal: number
): Promise<UploadResult> {
  const res = await drive.files.create(
    {
      requestBody: { name: `${name}.md`, parents: [parentId], modifiedTime: new Date(modifiedLocal).toISOString() },
      media: { mimeType: MD_MIME, body: content },
      fields: 'id, md5Checksum, version, modifiedTime'
    },
    { headers: { 'Content-Type': 'text/markdown' } }
  )
  return {
    id: res.data.id!,
    md5: res.data.md5Checksum ?? null,
    version: res.data.version != null ? String(res.data.version) : null,
    modifiedTime: res.data.modifiedTime ?? new Date().toISOString()
  }
}

export async function uploadNoteUpdate(
  drive: drive_v3.Drive,
  fileId: string,
  name: string,
  content: string,
  modifiedLocal: number
): Promise<UploadResult> {
  const res = await drive.files.update(
    {
      fileId,
      requestBody: { name: `${name}.md`, modifiedTime: new Date(modifiedLocal).toISOString() },
      media: { mimeType: MD_MIME, body: content },
      fields: 'id, md5Checksum, version, modifiedTime'
    },
    { headers: { 'Content-Type': 'text/markdown' } }
  )
  return {
    id: res.data.id!,
    md5: res.data.md5Checksum ?? null,
    version: res.data.version != null ? String(res.data.version) : null,
    modifiedTime: res.data.modifiedTime ?? new Date().toISOString()
  }
}

export async function trashRemoteItem(drive: drive_v3.Drive, fileId: string): Promise<void> {
  await drive.files.update({ fileId, requestBody: { trashed: true } })
}

export async function renameRemoteItem(drive: drive_v3.Drive, fileId: string, newName: string): Promise<void> {
  await drive.files.update({ fileId, requestBody: { name: newName } })
}

export async function moveRemoteItem(
  drive: drive_v3.Drive,
  fileId: string,
  addParent: string,
  removeParent: string
): Promise<void> {
  await drive.files.update({ fileId, addParents: addParent, removeParents: removeParent })
}

export async function getStartPageToken(drive: drive_v3.Drive): Promise<string> {
  const res = await drive.changes.getStartPageToken({ supportsAllDrives: false })
  return res.data.startPageToken!
}

export interface RemoteChange {
  fileId: string
  removed: boolean
  file: RemoteItem | null
}

interface ChangePage {
  changes: RemoteChange[]
  next?: string
  newStart?: string
}

async function fetchChangesPage(drive: drive_v3.Drive, pageToken: string): Promise<ChangePage> {
  const res = await drive.changes.list({
    pageToken,
    includeRemoved: true,
    restrictToMyDrive: true,
    fields: `newStartPageToken, nextPageToken, changes(fileId, removed, file(${FILE_FIELDS}))`
  })
  const out: RemoteChange[] = []
  for (const c of res.data.changes ?? []) {
    out.push({ fileId: c.fileId!, removed: c.removed ?? false, file: c.file ? toRemote(c.file) : null })
  }
  return {
    changes: out,
    next: res.data.nextPageToken ?? undefined,
    newStart: res.data.newStartPageToken ?? undefined
  }
}

export async function listChanges(
  drive: drive_v3.Drive,
  pageToken: string
): Promise<{ changes: RemoteChange[]; newStartPageToken: string }> {
  const changes: RemoteChange[] = []
  let token: string | undefined = pageToken
  let newStartPageToken: string = pageToken
  do {
    const page = await fetchChangesPage(drive, token)
    changes.push(...page.changes)
    if (page.newStart) newStartPageToken = page.newStart
    token = page.next
  } while (token)
  return { changes, newStartPageToken }
}
