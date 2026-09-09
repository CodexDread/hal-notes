import type {
  AppSettings,
  Backlink,
  CaptureSuggestion,
  ChatMessage,
  Citation,
  DriveStatus,
  EmbedProgress,
  FolderMeta,
  NoteMeta,
  OpenNote,
  SearchHit,
  SyncStatus,
  TagCount,
  VaultSnapshot
} from './types'

export interface HalEventPayloads {
  'vault:changed': undefined
  'note:updated': { id: string; content: string }
  'sync:status': SyncStatus
  'settings:changed': AppSettings
  'hal:delta': { id: string; delta: string }
  'hal:done': { id: string; citations: Citation[] }
  'hal:error': { id: string; error: string }
  'embed:progress': EmbedProgress
  'capture:suggestion': CaptureSuggestion
  'drive:status-changed': undefined
  'drive:auth-url': string
}

export type HalEventChannel = keyof HalEventPayloads

export interface HalApi {
  vaultList(): Promise<VaultSnapshot>
  noteOpen(id: string): Promise<OpenNote | null>
  noteCreate(parentId: string | null, name?: string): Promise<NoteMeta>
  noteSave(id: string, content: string): Promise<NoteMeta | null>
  noteRename(id: string, name: string): Promise<NoteMeta | null>
  noteTrash(id: string): Promise<void>
  folderCreate(parentId: string | null, name?: string): Promise<FolderMeta>
  folderRename(id: string, name: string): Promise<void>
  folderTrash(id: string): Promise<void>
  resolveName(name: string): Promise<NoteMeta | null>
  searchText(q: string): Promise<SearchHit[]>
  searchSemantic(q: string): Promise<SearchHit[]>
  backlinks(id: string): Promise<Backlink[]>
  tagsList(): Promise<TagCount[]>
  settingsGet(): Promise<AppSettings>
  settingsSet(patch: Partial<AppSettings>): Promise<AppSettings>
  driveStatus(): Promise<DriveStatus>
  driveConfigure(secretJson: string): Promise<void>
  driveConnect(): Promise<void>
  driveDisconnect(): Promise<void>
  driveSyncNow(): Promise<void>
  aiSetKey(key: string): Promise<void>
  aiClearKey(): Promise<void>
  aiTest(): Promise<void>
  aiModels(): Promise<string[]>
  embeddingsBackfill(): Promise<void>
  embeddingsReady(): Promise<boolean>
  halAsk(id: string, question: string, history: Pick<ChatMessage, 'role' | 'text'>[]): Promise<void>
  on<K extends HalEventChannel>(channel: K, cb: (payload: HalEventPayloads[K]) => void): () => void
}
