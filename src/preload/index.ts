import { contextBridge, ipcRenderer } from 'electron'
import type { HalApi, HalEventChannel, HalEventPayloads } from '@shared/api'

const api: HalApi = {
  vaultList: () => ipcRenderer.invoke('vault:list'),
  noteOpen: (id) => ipcRenderer.invoke('notes:open', id),
  noteCreate: (parentId, name) => ipcRenderer.invoke('notes:create', parentId, name),
  noteSave: (id, content) => ipcRenderer.invoke('notes:save', id, content),
  noteRename: (id, name) => ipcRenderer.invoke('notes:rename', id, name),
  noteTrash: (id) => ipcRenderer.invoke('notes:trash', id),
  folderCreate: (parentId, name) => ipcRenderer.invoke('folders:create', parentId, name),
  folderRename: (id, name) => ipcRenderer.invoke('folders:rename', id, name),
  folderTrash: (id) => ipcRenderer.invoke('folders:trash', id),
  resolveName: (name) => ipcRenderer.invoke('notes:resolve', name),
  searchText: (q) => ipcRenderer.invoke('search:text', q),
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
  on: (channel, cb) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown): void => {
      cb(payload as HalEventPayloads[typeof channel])
    }
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('hal', api)
