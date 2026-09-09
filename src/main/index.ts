import { BrowserWindow, Menu, app, shell } from 'electron'
import { join } from 'path'
import { initCaptureWatcher } from './ai/capture'
import { initEmbeddingWatcher } from './ai/embed'
import { driveAuth } from './drive/auth'
import { syncEngine } from './drive/sync'
import { initDb } from './store/db'
import { registerIpc } from './ipc'
import { registerWindow } from './windows'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    initDb()
    registerIpc()
    initEmbeddingWatcher()
    initCaptureWatcher()
    void driveAuth.restore().then(() => syncEngine.start())

    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 980,
      minHeight: 640,
      backgroundColor: '#0f1116',
      title: 'HAL Notes',
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    win.once('ready-to-show', () => win.show())
    win.on('focus', () => syncEngine.onWindowFocus())

    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      void win.loadURL(process.env.ELECTRON_RENDERER_URL)
      if (process.env.HAL_DEVTOOLS) win.webContents.openDevTools()
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    registerWindow(win)
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
