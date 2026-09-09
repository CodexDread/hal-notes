import { ipcMain } from 'electron'
import type { ChatMessage } from '@shared/types'
import { askHal } from './ai/chat'
import { backfillEmbeddings, embeddingsReady, semanticSearch } from './ai/embed'
import { listChatModels, testKey } from './ai/gemini'
import { driveAuth } from './drive/auth'
import { syncEngine } from './drive/sync'
import { bus } from './events'
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
  handle('search:text', (q: string) => searchText(q))
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
    await driveAuth.connect()
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

  bus.on('vault:changed', () => broadcast('vault:changed'))
  bus.on('note:updated', (id: string, content: string) => broadcast('note:updated', { id, content }))
  bus.on('sync:status', (status) => broadcast('sync:status', status))
  bus.on('embed:progress', (p) => broadcast('embed:progress', p))
  bus.on('capture:suggestion', (s) => broadcast('capture:suggestion', s))
  bus.on('drive:status-changed', () => broadcast('drive:status-changed'))
}
