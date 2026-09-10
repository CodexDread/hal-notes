import type {
  AppSettings,
  AttachmentMeta,
  Backlink,
  CaptureSuggestion,
  CardAnswerResult,
  ChatMessage,
  Citation,
  DriveStatus,
  DueCard,
  EmbedProgress,
  FolderMeta,
  GraphData,
  NoteMeta,
  OpenNote,
  PathDetail,
  ResearchChatMessage,
  ResearchCitation,
  ResearchNotebook,
  ResearchNotebookDetail,
  ResearchPath,
  ResearchSource,
  DueItem,
  ReviewCard,
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
  'research-chat:delta': { id: string; notebookId: string; delta: string }
  'research-chat:done': { id: string; notebookId: string; citations: ResearchCitation[] }
  'research-chat:error': { id: string; notebookId: string; error: string }
  'research:path-updated': { pathId: string; notebookId: string }
  'research:path-error': { pathId: string; notebookId: string; error: string }
  'console:line': import('./types').ConsoleLine
}

export type HalEventChannel = keyof HalEventPayloads

export interface HalApi {
  appVersion(): Promise<string>
  vaultList(): Promise<VaultSnapshot>
  attachmentCreate(name: string, bytes: Uint8Array): Promise<AttachmentMeta>
  attachmentTrash(id: string): Promise<void>
  attachmentOpenExternal(name: string): Promise<void>
  graphData(): Promise<GraphData>
  noteOpen(id: string): Promise<OpenNote | null>
  noteCreate(parentId: string | null, name?: string): Promise<NoteMeta>
  noteSave(id: string, content: string): Promise<NoteMeta | null>
  noteRename(id: string, name: string): Promise<NoteMeta | null>
  noteTrash(id: string): Promise<void>
  noteMove(id: string, parentId: string | null): Promise<NoteMeta | null>
  folderMove(id: string, parentId: string | null): Promise<void>
  folderCreate(parentId: string | null, name?: string): Promise<FolderMeta>
  folderRename(id: string, name: string): Promise<void>
  folderTrash(id: string): Promise<void>
  resolveName(name: string): Promise<NoteMeta | null>
  searchText(q: string, limit?: number): Promise<SearchHit[]>
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
  researchList(): Promise<ResearchNotebook[]>
  researchCreate(name: string): Promise<ResearchNotebook>
  researchRename(id: string, name: string): Promise<void>
  researchDelete(id: string): Promise<void>
  researchGet(id: string): Promise<ResearchNotebookDetail>
  researchAddSource(notebookId: string, kind: 'web' | 'note', uri: string, title: string): Promise<ResearchSource>
  researchRemoveSource(sourceId: string): Promise<void>
  researchChat(id: string, notebookId: string, question: string, history: Pick<ResearchChatMessage, 'role' | 'text'>[]): Promise<void>
  researchStartPath(notebookId: string, topic: string): Promise<ResearchPath>
  researchGetPath(pathId: string): Promise<PathDetail>
  researchAnswerCard(pathId: string, cardIndex: number, answer: string): Promise<CardAnswerResult>
  researchCompleteCard(pathId: string, cardIndex: number): Promise<PathDetail>
  researchSavePathNote(pathId: string): Promise<{ noteId: string }>
  researchDueCards(notebookId: string): Promise<DueCard[]>
  researchAnswerReview(progress: { pathId: string; cardIndex: number }, answer: string): Promise<CardAnswerResult>
  reviewAddNote(noteId: string): Promise<{ count: number }>
  reviewNoteCardCount(noteId: string): Promise<number>
  reviewDue(): Promise<{ note: ReviewCard[]; research: DueCard[] }>
  reviewAnswer(cardId: string, answer: string): Promise<CardAnswerResult>
  consoleFetch(): Promise<import('./types').ConsoleLine[]>
  consoleClear(): Promise<void>
  on<K extends HalEventChannel>(channel: K, cb: (payload: HalEventPayloads[K]) => void): () => void
}
