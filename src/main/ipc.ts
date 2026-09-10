import { app, ipcMain } from 'electron'
import type { ChatMessage } from '@shared/types'
import { askHal } from './ai/chat'
import { backfillEmbeddings, embeddingsReady, embedSingle, semanticSearch } from './ai/embed'
import { listChatModels, testKey } from './ai/gemini'
import { driveAuth } from './drive/auth'
import { syncEngine } from './drive/sync'
import { bus } from './events'
import { answerCard, answerReview, completeCard, getPathDetailOrThrow, savePathNote, startLearningPath } from './research/engine'
import { notebookChat } from './research/chat'
import { answerNoteCard, dueReviewCards, generateReviewCards, noteCardCount } from './research/reviewcards'
import * as research from './research/store'
import { deleteMeta, getMeta } from './store/db'
import {
  backlinksFor,
  createFolder,
  createNote,
  listTags,
  listVault,
  openNote,
  renameFolder,
  renameNote,
  resolveByName,
  saveNoteContent,
  searchText,
  trashFolder,
  trashNote
} from './store/notes'
import { clearGeminiKey, getSettings, setGeminiKey, updateSettings } from './store/settings'
import { broadcast } from './windows'

function handle(channel: string, fn: (...args: never[]) => unknown): void {
  ipcMain.handle(channel, async (_event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => {
    try {
      return await fn(...(args as never[]))
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })
}

export function registerIpc(): void {
  handle('app:version', () => app.getVersion())
  handle('vault:list', () => ({ ...listVault(), driveConnected: driveAuth.isConnected() }))
  handle('notes:open', (id: string) => openNote(id))
  handle('notes:create', (parentId: string | null, name?: string) => createNote(parentId, name))
  handle('notes:save', (id: string, content: string) => saveNoteContent(id, content))
  handle('notes:rename', (id: string, name: string) => renameNote(id, name))
  handle('notes:trash', (id: string) => trashNote(id))
  handle('notes:resolve', (name: string) => resolveByName(name))
  handle('notes:backlinks', (id: string) => backlinksFor(id))
  handle('folders:create', (parentId: string | null, name?: string) => createFolder(parentId, name))
  handle('folders:rename', (id: string, name: string) => renameFolder(id, name))
  handle('folders:trash', (id: string) => trashFolder(id))
  handle('search:text', (q: string, limit?: number) => searchText(q, limit ?? 50))
  handle('search:semantic', (q: string) => semanticSearch(q))
  handle('tags:list', () => listTags())

  handle('settings:get', () => getSettings())
  handle('settings:set', (patch: Record<string, unknown>) => {
    const next = updateSettings(patch)
    bus.emit('settings:changed')
    broadcast('settings:changed', next)
    return next
  })

  handle('drive:status', () => ({
    configured: driveAuth.isConfigured(),
    connected: driveAuth.isConnected(),
    vaultFolderName: getSettings().vaultFolderName,
    vaultFolderId: getMeta('vault_folder_id'),
    authUrl: ''
  }))
  handle('drive:configure', (secretJson: string) => driveAuth.configure(secretJson))
  handle('drive:connect', async () => {
    await driveAuth.connect((url) => broadcast('drive:auth-url', url))
    await syncEngine.syncNow()
  })
  handle('drive:disconnect', () => {
    driveAuth.disconnect()
    deleteMeta('drive_change_token')
    deleteMeta('vault_folder_id')
  })
  handle('drive:sync-now', () => syncEngine.syncNow())

  handle('ai:set-key', (key: string) => setGeminiKey(key))
  handle('ai:clear-key', () => clearGeminiKey())
  handle('ai:test', () => testKey())
  handle('ai:models', () => listChatModels())
  handle('embed:backfill', () => backfillEmbeddings())
  handle('embed:ready', () => embeddingsReady())

  handle('hal:ask', async (id: string, question: string, history: Pick<ChatMessage, 'role' | 'text'>[]) => {
    void askHal(
      question,
      history,
      (delta) => broadcast('hal:delta', { id, delta })
    )
      .then(({ citations }) => broadcast('hal:done', { id, citations }))
      .catch((err) => broadcast('hal:error', { id, error: err instanceof Error ? err.message : String(err) }))
  })

  // ── Research mode ──────────────────────────────────────────────────────────
  handle('research:list', () => research.listNotebooks())
  handle('research:create', (name: string) => research.createNotebook(name))
  handle('research:rename', (id: string, name: string) => research.renameNotebook(id, name))
  handle('research:delete', (id: string) => research.deleteNotebook(id))
  handle('research:get', (id: string) => research.getNotebookDetail(id))

  handle('research:add-source', async (notebookId: string, kind: 'web' | 'note', uri: string, title: string) => {
    let gist = ''
    if (kind === 'note') {
      gist = (await import('./store/notes')).getNoteRow(uri)?.content.slice(0, 2000) ?? ''
    }
    const source = research.addSource({ notebookId, kind, uri, title: title || uri, gist, addedBy: 'you' })
    void embedSingle(`${source.title}\n${gist || source.uri}`).then((vec) => {
      if (vec) research.setSourceEmbedding(source.id, vec)
    })
    return source
  })
  handle('research:remove-source', (sourceId: string) => research.removeSource(sourceId))

  handle('research:chat', (id: string, notebookId: string, question: string, history: Pick<import('@shared/types').ResearchChatMessage, 'role' | 'text'>[]) => {
    void notebookChat(
      (delta) => broadcast('research-chat:delta', { id, notebookId, delta }),
      notebookId,
      question,
      history
    )
      .then(({ citations }) => broadcast('research-chat:done', { id, notebookId, citations }))
      .catch((err) =>
        broadcast('research-chat:error', { id, notebookId, error: err instanceof Error ? err.message : String(err) })
      )
  })

  handle('research:start-path', (notebookId: string, topic: string) => {
    const row = research.createPath(notebookId, topic)
    startLearningPath(notebookId, topic, row.id)
    return row
  })
  handle('research:get-path', (pathId: string) => getPathDetailOrThrow(pathId))
  handle('research:answer-card', (pathId: string, cardIndex: number, answer: string) =>
    answerCard(pathId, cardIndex, answer)
  )
  handle('research:complete-card', (pathId: string, cardIndex: number) => completeCard(pathId, cardIndex))
  handle('research:save-path-note', (pathId: string) => savePathNote(pathId))
  handle('research:due-cards', (notebookId: string) => research.dueCards(notebookId))
  handle('research:answer-review', (pathId: string, cardIndex: number, answer: string) =>
    answerReview(pathId, cardIndex, answer)
  )

  // ── Vault-wide review ──────────────────────────────────────────────────────
  handle('review:add-note', (noteId: string) => generateReviewCards(noteId))
  handle('review:note-count', (noteId: string) => noteCardCount(noteId))
  handle('review:due', () => ({
    note: dueReviewCards(),
    research: research.dueCardsAll()
  }))
  handle('review:answer', (cardId: string, answer: string) => answerNoteCard(cardId, answer))

  bus.on('vault:changed', () => broadcast('vault:changed'))
  bus.on('note:updated', (id: string, content: string) => broadcast('note:updated', { id, content }))
  bus.on('sync:status', (status) => broadcast('sync:status', status))
  bus.on('embed:progress', (p) => broadcast('embed:progress', p))
  bus.on('capture:suggestion', (s) => broadcast('capture:suggestion', s))
  bus.on('drive:status-changed', () => broadcast('drive:status-changed'))
  bus.on('research:path-updated', (pathId: string, notebookId: string) =>
    broadcast('research:path-updated', { pathId, notebookId })
  )
  bus.on('research:path-error', (pathId: string, notebookId: string, error: string) =>
    broadcast('research:path-error', { pathId, notebookId, error })
  )
}
