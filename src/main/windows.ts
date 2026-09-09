import { BrowserWindow } from 'electron'

const windows = new Set<BrowserWindow>()

export function registerWindow(win: BrowserWindow): void {
  windows.add(win)
  win.on('closed', () => windows.delete(win))
}

export function broadcast(channel: string, payload?: unknown): void {
  for (const win of windows) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
