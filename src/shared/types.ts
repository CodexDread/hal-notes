export interface NoteMeta {
  id: string
  name: string
  path: string
  parentId: string | null
  modifiedLocal: number
  modifiedRemote: number | null
  trashed: boolean
  pendingSync: boolean
  createdAt: number
  updatedAt: number
}

export interface FolderMeta {
  id: string
  name: string
  path: string
  parentId: string | null
  trashed: boolean
}

export interface VaultSnapshot {
  notes: NoteMeta[]
  folders: FolderMeta[]
  driveConnected: boolean
}

export interface OpenNote {
  meta: NoteMeta
  content: string
}

export interface SearchHit {
  noteId: string
  name: string
  path: string
  snippet: string
  score: number
}

export type SyncState = 'unlinked' | 'offline' | 'idle' | 'syncing' | 'error' | 'conflict'

export interface SyncStatus {
  state: SyncState
  lastSyncAt: number | null
  message: string
  pending: number
}

export interface Backlink {
  noteId: string
  name: string
  path: string
}

export interface TagCount {
  tag: string
  count: number
}

export interface Citation {
  index: number
  noteId: string
  name: string
  path: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'hal'
  text: string
  citations: Citation[]
  streaming: boolean
}

export interface CaptureSuggestion {
  noteId: string
  baseVersion: number
  title: string
  tags: string[]
  links: { text: string; target: string }[]
}

export interface AppSettings {
  theme: 'dark' | 'light'
  syncIntervalMs: number
  vaultFolderName: string
  chatModel: string
  geminiKeySet: boolean
  geminiEmail: string
}

export interface EmbedProgress {
  done: number
  total: number
}

export interface DriveStatus {
  configured: boolean
  connected: boolean
  vaultFolderName: string
  vaultFolderId: string | null
  authUrl: string
}
