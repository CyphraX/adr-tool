import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron'
import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  CHANNEL,
  type BodyEditRequest,
  type Decision,
  type OpenRepository,
  type Session
} from '../shared/ipc'
import { Repositories } from './repositories'
import { readSession, writeSession } from './session-store'

const isWebLink = (url: string): boolean => /^https?:\/\//i.test(url)

const repositories = new Repositories((repository) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(CHANNEL.repositoryChanged, repository)
  }
})
let activeRoot: string | undefined

const sessionFile = (): string => join(app.getPath('userData'), 'session.json')
const saveSession = (): Promise<void> =>
  writeSession(sessionFile(), {
    roots: repositories.roots,
    ...(activeRoot !== undefined && { activeRoot })
  }).catch((error) => console.error(error))

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isDirectory(),
    () => false
  )
}

/** Reopen the repositories of the last run. `ADR_TOOL_REPO` adds one from the command line, for development. */
async function restoreSession(): Promise<Session> {
  const stored = await readSession(sessionFile())
  const fromEnvironment = process.env['ADR_TOOL_REPO']
  const roots = [...stored.roots, ...(fromEnvironment ? [resolve(fromEnvironment)] : [])]

  const opened: OpenRepository[] = []
  for (const root of new Set(roots)) {
    if (await isDirectory(root)) opened.push(await repositories.open(root))
  }
  const wanted = fromEnvironment ? resolve(fromEnvironment) : stored.activeRoot
  const active = opened.find((repository) => repository.root === wanted) ?? opened[0]
  activeRoot = active?.root
  return { repositories: opened, ...(active && { activeId: active.id }) }
}

function registerIpc(): void {
  ipcMain.handle(CHANNEL.restoreSession, () => restoreSession())

  ipcMain.handle(CHANNEL.openRepository, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = { title: 'Open repository', properties: ['openDirectory' as const] }
    const picked = await (window
      ? dialog.showOpenDialog(window, options)
      : dialog.showOpenDialog(options))
    const root = picked.filePaths[0]
    if (picked.canceled || root === undefined) return undefined
    const opened = await repositories.open(root)
    activeRoot = opened.root
    await saveSession()
    return opened
  })

  ipcMain.handle(CHANNEL.closeRepository, async (_, id: unknown) => {
    if (typeof id !== 'string') return
    await repositories.close(id)
    await saveSession()
  })

  ipcMain.handle(CHANNEL.setActiveRepository, async (_, id: unknown) => {
    activeRoot = typeof id === 'string' ? repositories.rootOf(id) : undefined
    await saveSession()
  })

  ipcMain.handle(
    CHANNEL.planDecision,
    (_, repositoryId: unknown, logPath: unknown, adrId: unknown, decision: unknown) => {
      const known = decision === 'accept' || decision === 'reject' || decision === 'deprecate'
      if (![repositoryId, logPath, adrId].every((value) => typeof value === 'string') || !known) {
        return { ok: false, reason: 'This request cannot be understood.' }
      }
      return repositories.planDecision(
        repositoryId as string,
        logPath as string,
        adrId as string,
        decision as Decision
      )
    }
  )

  ipcMain.handle(CHANNEL.planBodyEdit, (_, request: unknown) => {
    const fields = ['repositoryId', 'logPath', 'adrId', 'base', 'body', 'note'] as const
    const given = typeof request === 'object' && request !== null ? request : {}
    if (!fields.every((field) => typeof (given as Record<string, unknown>)[field] === 'string')) {
      return { ok: false, reason: 'This request cannot be understood.' }
    }
    return repositories.planBodyEdit(given as BodyEditRequest)
  })

  ipcMain.handle(CHANNEL.applyChange, (_, changeId: unknown) =>
    typeof changeId === 'string'
      ? repositories.applyChange(changeId)
      : { applied: false, reason: 'This request cannot be understood.' }
  )

  ipcMain.handle(CHANNEL.discardChange, (_, changeId: unknown) => {
    if (typeof changeId === 'string') repositories.discardChange(changeId)
  })

  ipcMain.handle(CHANNEL.openExternal, async (_, url: unknown) => {
    if (typeof url === 'string' && isWebLink(url)) await shell.openExternal(url)
  })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    show: false,
    title: 'ADR Tool',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // ADRs from foreign repositories are untrusted input. The renderer gets
      // no Node and no disk access; everything goes through the preload bridge.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Nothing ever opens or navigates inside the app: web links go to the system
  // browser, everything else is dropped.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebLink(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  // HMR for the renderer is driven by the electron-vite CLI: load its dev
  // server in development and the built html file otherwise.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.adr-tool.app')

  // F12 toggles DevTools in development; Ctrl/Cmd+R is ignored in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpc()
  createWindow()

  app.on('activate', () => {
    // macOS: re-create a window when the dock icon is clicked and none is open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  void repositories.closeAll()
})
