import { contextBridge, ipcRenderer } from 'electron'
import type { HalApi, HalEventChannel, HalEventPayloads } from '@shared/api'

const api: HalApi = {
  appVersion: () => ipcRenderer.invoke('app:version'),
  vaultList: () => ipcRenderer.invoke('vault:list'),
  attachmentCreate: (name, bytes) => ipcRenderer.invoke('attachment:create', name, bytes),
  attachmentOpenExternal: (name) => ipcRenderer.invoke('attachment:open-external', name),
  noteOpen: (id) => ipcRenderer.invoke('notes:open', id),
  noteCreate: (parentId, name) => ipcRenderer.invoke('notes:create', parentId, name),
  noteSave: (id, content) => ipcRenderer.invoke('notes:save', id, content),
  noteRename: (id, name) => ipcRenderer.invoke('notes:rename', id, name),
  noteTrash: (id) => ipcRenderer.invoke('notes:trash', id),
  folderCreate: (parentId, name) => ipcRenderer.invoke('folders:create', parentId, name),
  folderRename: (id, name) => ipcRenderer.invoke('folders:rename', id, name),
  folderTrash: (id) => ipcRenderer.invoke('folders:trash', id),
  resolveName: (name) => ipcRenderer.invoke('notes:resolve', name),
  searchText: (q, limit) => ipcRenderer.invoke('search:text', q, limit),
  searchSemantic: (q) => ipcRenderer.invoke('search:semantic', q),
  backlinks: (id) => ipcRenderer.invoke('notes:backlinks', id),
  tagsList: () => ipcRenderer.invoke('tags:list'),
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch) => ipcRenderer.invoke('settings:set', patch),
  driveStatus: () => ipcRenderer.invoke('drive:status'),
  driveConfigure: (secretJson) => ipcRenderer.invoke('drive:configure', secretJson),
  driveConnect: () => ipcRenderer.invoke('drive:connect'),
  driveDisconnect: () => ipcRenderer.invoke('drive:disconnect'),
  driveSyncNow: () => ipcRenderer.invoke('drive:sync-now'),
  aiSetKey: (key) => ipcRenderer.invoke('ai:set-key', key),
  aiClearKey: () => ipcRenderer.invoke('ai:clear-key'),
  aiTest: () => ipcRenderer.invoke('ai:test'),
  aiModels: () => ipcRenderer.invoke('ai:models'),
  embeddingsBackfill: () => ipcRenderer.invoke('embed:backfill'),
  embeddingsReady: () => ipcRenderer.invoke('embed:ready'),
  halAsk: (id, question, history) => ipcRenderer.invoke('hal:ask', id, question, history),
  researchList: () => ipcRenderer.invoke('research:list'),
  researchCreate: (name) => ipcRenderer.invoke('research:create', name),
  researchRename: (id, name) => ipcRenderer.invoke('research:rename', id, name),
  researchDelete: (id) => ipcRenderer.invoke('research:delete', id),
  researchGet: (id) => ipcRenderer.invoke('research:get', id),
  researchAddSource: (notebookId, kind, uri, title) => ipcRenderer.invoke('research:add-source', notebookId, kind, uri, title),
  researchRemoveSource: (sourceId) => ipcRenderer.invoke('research:remove-source', sourceId),
  researchChat: (id, notebookId, question, history) => ipcRenderer.invoke('research:chat', id, notebookId, question, history),
  researchStartPath: (notebookId, topic) => ipcRenderer.invoke('research:start-path', notebookId, topic),
  researchGetPath: (pathId) => ipcRenderer.invoke('research:get-path', pathId),
  researchAnswerCard: (pathId, cardIndex, answer) => ipcRenderer.invoke('research:answer-card', pathId, cardIndex, answer),
  researchCompleteCard: (pathId, cardIndex) => ipcRenderer.invoke('research:complete-card', pathId, cardIndex),
  researchSavePathNote: (pathId) => ipcRenderer.invoke('research:save-path-note', pathId),
  researchDueCards: (notebookId) => ipcRenderer.invoke('research:due-cards', notebookId),
  researchAnswerReview: (progress, answer) =>
    ipcRenderer.invoke('research:answer-review', progress.pathId, progress.cardIndex, answer),
  reviewAddNote: (noteId) => ipcRenderer.invoke('review:add-note', noteId),
  reviewNoteCardCount: (noteId) => ipcRenderer.invoke('review:note-count', noteId),
  reviewDue: () => ipcRenderer.invoke('review:due'),
  reviewAnswer: (cardId, answer) => ipcRenderer.invoke('review:answer', cardId, answer),
  on: (channel, cb) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown): void => {
      cb(payload as HalEventPayloads[typeof channel])
    }
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('hal', api)
