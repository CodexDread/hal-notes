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
  defaultViewMode: 'edit' | 'split' | 'preview'
  captureDelayMs: number
  editorFontSize: number
  accentColor: string
  pathLengthCards: number
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

// ── Research mode ─────────────────────────────────────────────────────────────

export interface ResearchNotebook {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
}

export interface ResearchSource {
  id: string
  notebookId: string
  kind: 'web' | 'note'
  uri: string
  title: string
  gist: string
  addedBy: 'you' | 'hal'
  addedAt: number
}

export interface ResearchCitation {
  index: number
  sourceId: string | null
  title: string
  uri: string | null
  noteId: string | null
}

export interface ResearchChatMessage {
  id: string
  role: 'user' | 'hal'
  text: string
  citations: ResearchCitation[]
  createdAt: number
}

export interface CheckIn {
  kind: 'mcq' | 'short'
  question: string
  options: string[]
  answer: string
  guidance: string
}

export interface LessonCard {
  index: number
  title: string
  body: string
  checkIn: CheckIn
  exercise: string
  links: string[]
}

export interface LearningPath {
  topic: string
  knownAnchors: string[]
  cards: LessonCard[]
  tinyProject: { title: string; body: string }
  sources: { title: string; uri: string }[]
}

export type PathStatus = 'assessing' | 'researching' | 'writing' | 'ready' | 'error'

export interface ResearchPath {
  id: string
  notebookId: string
  question: string
  status: PathStatus
  path: LearningPath | null
  noteId: string | null
  error: string
  createdAt: number
  updatedAt: number
}

export type CardState = 'locked' | 'active' | 'done'

export interface CardProgress {
  pathId: string
  cardIndex: number
  state: CardState
  attempts: number
  reviews: number
  lastAnswer: string
  lastFeedback: string
  nextDue: number | null
  updatedAt: number
}

export interface PathDetail extends ResearchPath {
  progress: CardProgress[]
}

export interface ResearchNotebookDetail {
  notebook: ResearchNotebook
  sources: ResearchSource[]
  messages: ResearchChatMessage[]
  paths: ResearchPath[]
}

export interface DueCard extends CardProgress {
  path: ResearchPath
}

export interface CardAnswerResult {
  feedback: string
  onTarget: boolean
  progress: CardProgress
}
