import { app, dialog, ipcMain, Menu, protocol, session, shell, BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import type { FileSystem, Plan } from '@adr-tool/core'
import { planConformanceRepair } from '@adr-tool/conformance'
import { planAdopt, planRepair } from '@adr-tool/structure/model'
import {
  CHANNEL,
  type BodyEditRequest,
  type Decision,
  type ExportKind,
  type OpenRepository,
  type PlanResult,
  type Session
} from '../shared/ipc'
import { isLanguage } from '../shared/language'
import { analysisHost } from './analysis-host'
import { Annotations, planReview } from './annotations'
import { registerDiagrams } from './diagrams-ipc'
import { ASSET_SCHEME, assetHandler } from './assets'
import { conformanceView, planException, planRule } from './conformance'
import { exportPdf, writeExport } from './export'
import { gitIn } from './git'
import { nodeFileSystem } from './node-file-system'
import { Repositories, localDate } from './repositories'
import {
  conformanceRepairRequest,
  createRequest,
  diagramsRequest,
  exceptionRequest,
  metadataEditRequest,
  migrationRequest,
  renameRequest,
  repairRequest,
  ruleRequest,
  structureRepairRequest
} from './requests'
import { reviewRequest } from './review-requests'
import { readSession, writeSession } from './session-store'
import { menuTemplate } from './menu'
import { setLanguage, t } from './strings'
import { AnalysisDropped, Structures, cacheName } from './structures'

const isWebLink = (url: string): boolean => /^https?:\/\//i.test(url)

// The images of an ADR come through a protocol of their own (main/assets.ts). It has to be
// known before the app is ready; it is a standard scheme so that its URLs have a host, the
// repository, and a path.
protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true } }
])

const repositories = new Repositories((repository) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(CHANNEL.repositoryChanged, repository)
  }
  // An ADR came or went: the Traces of the Annotations are checked again.
  annotations.refresh(repository.id)
})
const analysis = analysisHost((root) =>
  join(app.getPath('userData'), 'structure-cache', cacheName(root))
)
const structures = new Structures(analysis.analyse, (repositoryId) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(CHANNEL.structureChanged, repositoryId)
  }
})
const annotations = new Annotations((repositoryId) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(CHANNEL.reviewChanged, repositoryId)
  }
})
let activeRoot: string | undefined

/** The windows, by the id of their contents, that hold text which is not on disk. */
const unsaved = new Set<number>()
/** The windows that do not answer at the moment, and so cannot be asked anything. */
const hung = new Set<number>()
/** The windows whose text the person chose to discard when asked, which now close. */
const discarded = new Set<number>()
/** The app is quitting: its windows are being closed for that reason. */
let quitting = false
/** The app was quitting when a window held it up to ask. */
let quitHeldUp = false

/** The menu of the app, in the language the window speaks (menu.ts). */
const setMenu = (): void =>
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(process.platform, app.name)))

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
    const options = { title: t.openRepository, properties: ['openDirectory' as const] }
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
    await Promise.all([repositories.close(id), structures.close(id), annotations.close(id)])
    await saveSession()
  })

  ipcMain.handle(CHANNEL.setActiveRepository, async (_, id: unknown) => {
    activeRoot = typeof id === 'string' ? repositories.rootOf(id) : undefined
    structures.bringToFront(typeof id === 'string' ? id : undefined)
    await saveSession()
  })

  ipcMain.handle(
    CHANNEL.planDecision,
    (_, repositoryId: unknown, logPath: unknown, adrId: unknown, decision: unknown) => {
      const known = decision === 'accept' || decision === 'reject' || decision === 'deprecate'
      if (![repositoryId, logPath, adrId].every((value) => typeof value === 'string') || !known) {
        return { ok: false, reason: t.notUnderstood }
      }
      return repositories.planDecision(
        repositoryId as string,
        logPath as string,
        adrId as string,
        decision as Decision
      )
    }
  )

  ipcMain.handle(CHANNEL.listTemplates, (_, repositoryId: unknown) =>
    repositories.listTemplates(typeof repositoryId === 'string' ? repositoryId : '')
  )

  ipcMain.handle(CHANNEL.planCreate, (_, request: unknown) => {
    const create = createRequest(request)
    if (!create) return { ok: false, reason: t.notUnderstood }
    return repositories.planCreate(create)
  })

  ipcMain.handle(CHANNEL.planBodyEdit, (_, request: unknown) => {
    const fields = ['repositoryId', 'logPath', 'adrId', 'base', 'body', 'note'] as const
    const given = typeof request === 'object' && request !== null ? request : {}
    if (!fields.every((field) => typeof (given as Record<string, unknown>)[field] === 'string')) {
      return { ok: false, reason: t.notUnderstood }
    }
    return repositories.planBodyEdit(given as BodyEditRequest)
  })

  ipcMain.handle(CHANNEL.planMetadataEdit, (_, request: unknown) => {
    const edit = metadataEditRequest(request)
    if (!edit) return { ok: false, reason: t.notUnderstood }
    return repositories.planMetadataEdit(edit)
  })

  ipcMain.handle(CHANNEL.planRepair, (_, request: unknown) => {
    const repair = repairRequest(request)
    if (!repair) return { ok: false, reason: t.notUnderstood }
    return repositories.planRepair(repair)
  })

  ipcMain.handle(CHANNEL.planMigration, (_, request: unknown) => {
    const migration = migrationRequest(request)
    if (!migration) return { ok: false, reason: t.notUnderstood }
    return repositories.planMigration(migration)
  })

  ipcMain.handle(CHANNEL.history, (_, ...ids: unknown[]) =>
    ids.length === 3 && ids.every((id) => typeof id === 'string')
      ? repositories.history(...(ids as [string, string, string]))
      : []
  )

  ipcMain.handle(CHANNEL.historyChange, (_, ...ids: unknown[]) =>
    ids.length === 4 && ids.every((id) => typeof id === 'string')
      ? repositories.historyChange(...(ids as [string, string, string, string]))
      : undefined
  )

  ipcMain.handle(
    CHANNEL.structureView,
    async (_, repositoryId: unknown, parent: unknown, tests: unknown, expanded: unknown) => {
      const valid =
        typeof repositoryId === 'string' &&
        (parent === undefined || typeof parent === 'string') &&
        typeof tests === 'boolean' &&
        Array.isArray(expanded) &&
        expanded.every((id) => typeof id === 'string')
      if (!valid) return { ok: false, reason: t.notUnderstood }
      const root = repositories.rootOf(repositoryId)
      if (root === undefined) return { ok: false, reason: t.repositoryClosed }
      try {
        return {
          ok: true,
          view: await structures.view(repositoryId, root, parent, tests, expanded as string[])
        }
      } catch (error) {
        return { ok: false, reason: t.analysisFailed(String(error)) }
      }
    }
  )

  ipcMain.handle(CHANNEL.readSourceFile, async (_, repositoryId: unknown, path: unknown) => {
    if (typeof repositoryId !== 'string' || typeof path !== 'string') {
      return { ok: false, reason: t.notUnderstood }
    }
    const root = repositories.rootOf(repositoryId)
    if (root === undefined) return { ok: false, reason: t.repositoryClosed }
    try {
      return await structures.sourceFile(repositoryId, root, path)
    } catch (error) {
      return { ok: false, reason: t.analysisFailed(String(error)) }
    }
  })

  ipcMain.handle(CHANNEL.structureOutline, async (_, repositoryId: unknown, fresh: unknown) => {
    if (typeof repositoryId !== 'string') return { ok: false, reason: t.notUnderstood }
    const root = repositories.rootOf(repositoryId)
    if (root === undefined) return { ok: false, reason: t.repositoryClosed }
    try {
      return { ok: true, outline: await structures.outline(repositoryId, root, fresh === true) }
    } catch (error) {
      if (error instanceof AnalysisDropped) return { ok: false, dropped: true }
      return { ok: false, reason: t.analysisFailed(String(error)) }
    }
  })

  ipcMain.handle(CHANNEL.planAdopt, async (_, repositoryId: unknown) => {
    const root = typeof repositoryId === 'string' ? repositories.rootOf(repositoryId) : undefined
    if (root === undefined) return { ok: false, reason: t.repositoryClosed }
    try {
      // Planned against the Draft the view showed, and the declaration as it is on disk now.
      const structure = await structures.structureOf(repositoryId as string, root)
      return repositories.hold(
        repositoryId as string,
        await planAdopt(nodeFileSystem(root), structure)
      )
    } catch (error) {
      return { ok: false, reason: t.analysisFailed(String(error)) }
    }
  })

  ipcMain.handle(
    CHANNEL.planStructureRepair,
    async (_, repositoryId: unknown, problem: unknown) => {
      const repair = structureRepairRequest(problem)
      if (!repair) return { ok: false, reason: t.notUnderstood }
      const root = typeof repositoryId === 'string' ? repositories.rootOf(repositoryId) : undefined
      if (root === undefined) return { ok: false, reason: t.repositoryClosed }
      return repositories.hold(
        repositoryId as string,
        await planRepair(nodeFileSystem(root), repair)
      )
    }
  )

  ipcMain.handle(CHANNEL.conformanceView, async (_, repositoryId: unknown, watch: unknown) => {
    if (typeof repositoryId !== 'string') return { ok: false, reason: t.notUnderstood }
    const root = repositories.rootOf(repositoryId)
    if (root === undefined) return { ok: false, reason: t.repositoryClosed }
    try {
      const { analysis, current, analysedAt } = await structures.rulesAnalysisOf(
        repositoryId,
        root,
        watch === true
      )
      return {
        ok: true,
        view: await conformanceView(repositoryId, nodeFileSystem(root), analysis, {
          current,
          analysedAt
        })
      }
    } catch (error) {
      if (error instanceof AnalysisDropped) return { ok: false, dropped: true }
      return { ok: false, reason: t.analysisFailed(String(error)) }
    }
  })

  /**
   * A plan of the Rules file or of what it names: refused when the request cannot be
   * understood or the repository is closed, and refused in words, not thrown, where planning
   * fails for a reason the writer has no refusal for.
   */
  const planOfRules =
    <T>(
      parse: (request: unknown) => T | undefined,
      plan: (files: FileSystem, request: T) => Promise<Plan>
    ) =>
    async (_: unknown, repositoryId: unknown, request: unknown): Promise<PlanResult> => {
      const parsed = parse(request)
      if (parsed === undefined) return { ok: false, reason: t.notUnderstood }
      const root = typeof repositoryId === 'string' ? repositories.rootOf(repositoryId) : undefined
      if (root === undefined) return { ok: false, reason: t.repositoryClosed }
      try {
        return repositories.hold(repositoryId as string, await plan(nodeFileSystem(root), parsed))
      } catch (error) {
        return {
          ok: false,
          reason: t.planFailed(error instanceof Error ? error.message : String(error))
        }
      }
    }
  ipcMain.handle(CHANNEL.planRule, planOfRules(ruleRequest, planRule))
  ipcMain.handle(CHANNEL.planException, planOfRules(exceptionRequest, planException))
  ipcMain.handle(
    CHANNEL.planConformanceRepair,
    planOfRules(conformanceRepairRequest, planConformanceRepair)
  )

  ipcMain.handle(
    CHANNEL.planRename,
    (_, repositoryId: unknown, component: unknown, segment: unknown) => {
      const rename = renameRequest(repositoryId, component, segment)
      if (!rename) return { ok: false, reason: t.notUnderstood }
      return repositories.planRename(rename)
    }
  )

  ipcMain.handle(CHANNEL.planCommit, (_, ...ids: unknown[]) =>
    ids.length === 3 && ids.every((id) => typeof id === 'string')
      ? repositories.planCommit(...(ids as [string, string, string]))
      : { ok: false, reason: t.notUnderstood }
  )

  ipcMain.handle(CHANNEL.commit, (_, planId: unknown, include: unknown, message: unknown) =>
    typeof planId === 'string' &&
    typeof message === 'string' &&
    Array.isArray(include) &&
    include.every((path) => typeof path === 'string')
      ? repositories.commit(planId, include as string[], message)
      : { committed: false, reason: t.notUnderstood }
  )

  ipcMain.handle(CHANNEL.discardCommit, (_, planId: unknown) => {
    if (typeof planId === 'string') repositories.discardCommit(planId)
  })

  ipcMain.handle(CHANNEL.branches, (_, repositoryId: unknown) =>
    typeof repositoryId === 'string' ? repositories.branches(repositoryId) : undefined
  )

  ipcMain.handle(CHANNEL.branchAdr, (_, ...ids: unknown[]) =>
    ids.length === 3 && ids.every((id) => typeof id === 'string')
      ? repositories.branchAdr(...(ids as [string, string, string]))
      : undefined
  )

  ipcMain.handle(CHANNEL.applyChange, async (_, changeId: unknown) => {
    if (typeof changeId !== 'string') return { applied: false, reason: t.notUnderstood }
    const result = await repositories.applyChange(changeId)
    // The declaration may have changed: what the Structure view shows is analysed again.
    if (result.applied) structures.refresh(result.repository.id)
    // An Annotation may have been written: the Anchors are looked for again.
    if (result.applied) annotations.refresh(result.repository.id)
    return result
  })

  ipcMain.handle(CHANNEL.discardChange, (_, changeId: unknown) => {
    if (typeof changeId === 'string') repositories.discardChange(changeId)
  })

  // An export goes where the person points in a dialog of the system, never where the
  // renderer says: the place stays here, and the renderer holds a ticket for it while it draws
  // the Mermaid blocks. What an export wrote is all the renderer may have opened.
  const destinations = new Map<string, { kind: ExportKind; repositoryId: string; to: string }>()
  const exported = new Set<string>()
  ipcMain.handle(CHANNEL.pickExport, async (event, repositoryId: unknown, kind: unknown) => {
    const root = typeof repositoryId === 'string' ? repositories.rootOf(repositoryId) : undefined
    if (root === undefined) return { ok: false, reason: t.repositoryClosed }
    if (kind !== 'site' && kind !== 'pdf') return { ok: false, reason: t.notUnderstood }
    const window = BrowserWindow.fromWebContents(event.sender)
    let to: string | undefined
    if (kind === 'site') {
      const options = {
        title: t.export.siteTitle,
        buttonLabel: t.export.siteButton,
        properties: ['openDirectory' as const, 'createDirectory' as const]
      }
      const picked = await (window
        ? dialog.showOpenDialog(window, options)
        : dialog.showOpenDialog(options))
      if (!picked.canceled) to = picked.filePaths[0]
    } else {
      const options = {
        title: t.export.pdfTitle,
        defaultPath: `${basename(root)} decisions.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      }
      const picked = await (window
        ? dialog.showSaveDialog(window, options)
        : dialog.showSaveDialog(options))
      if (!picked.canceled && picked.filePath) to = picked.filePath
    }
    if (to === undefined) return undefined
    const ticket = randomUUID()
    destinations.set(ticket, { kind, repositoryId: repositoryId as string, to })
    return { ok: true, ticket }
  })
  ipcMain.handle(CHANNEL.exportTo, async (_, ticket: unknown, diagrams: unknown) => {
    const destination = typeof ticket === 'string' ? destinations.get(ticket) : undefined
    if (destination === undefined) return { ok: false, reason: t.notUnderstood }
    destinations.delete(ticket as string)
    const root = repositories.rootOf(destination.repositoryId)
    if (root === undefined) return { ok: false, reason: t.repositoryClosed }
    const drawn = diagramsRequest(diagrams)
    const result =
      destination.kind === 'site'
        ? await writeExport(root, destination.to, localDate(), drawn)
        : await exportPdf(root, destination.to, localDate(), printToPdf, drawn)
    if (!result.ok) return result
    exported.add(result.index)
    return { ok: true, path: result.index, adrs: result.adrs }
  })
  ipcMain.handle(CHANNEL.openExported, async (_, path: unknown) => {
    if (typeof path === 'string' && exported.has(path)) await shell.openPath(path)
  })

  ipcMain.handle(CHANNEL.openExternal, async (_, url: unknown) => {
    if (typeof url === 'string' && isWebLink(url)) await shell.openExternal(url)
  })

  ipcMain.handle(CHANNEL.setLanguage, (_, language: unknown) => {
    if (!isLanguage(language)) return
    setLanguage(language)
    setMenu()
  })

  // A reload from the page is a navigation, which the window refuses (`will-navigate` below).
  ipcMain.handle(CHANNEL.reloadWindow, (event) => event.sender.reload())

  ipcMain.handle(CHANNEL.setUnsaved, (event, holdsText: unknown) => {
    if (holdsText === true) unsaved.add(event.sender.id)
    else unsaved.delete(event.sender.id)
  })

  // Review (docs/plan-vision.md, part 9): the Annotations, looked at in the background.
  ipcMain.handle(CHANNEL.reviewOverview, async (_, repositoryId: unknown) => {
    if (typeof repositoryId !== 'string') return { ok: false, reason: t.notUnderstood }
    const root = repositories.rootOf(repositoryId)
    if (root === undefined) return { ok: false, reason: t.repositoryClosed }
    try {
      return { ok: true, overview: await annotations.overview(repositoryId, root) }
    } catch (error) {
      return { ok: false, reason: t.annotationsFailed(String(error)) }
    }
  })

  ipcMain.handle(CHANNEL.planReview, async (_, repositoryId: unknown, request: unknown) => {
    const asked = reviewRequest(request)
    if (!asked) return { ok: false, reason: t.notUnderstood }
    const root = typeof repositoryId === 'string' ? repositories.rootOf(repositoryId) : undefined
    if (root === undefined) return { ok: false, reason: t.repositoryClosed }
    // What fails on the way — a file that cannot be read, git that cannot be run — is said in
    // the window's language, as a refusal, and nothing is held.
    try {
      return repositories.hold(repositoryId as string, await planReview(root, asked))
    } catch (error) {
      return {
        ok: false,
        reason: t.planFailed(error instanceof Error ? error.message : String(error))
      }
    }
  })

  ipcMain.handle(CHANNEL.gitUserName, async (_, repositoryId: unknown) => {
    const root = typeof repositoryId === 'string' ? repositories.rootOf(repositoryId) : undefined
    return root === undefined ? undefined : gitIn(root).userName()
  })

  // The person was asked. "Discard": the window closes, and a quit it held up goes on —
  // on a Mac the app would otherwise stay in the dock. "Keep editing": nothing is to quit.
  ipcMain.handle(CHANNEL.answerCloseRequest, (event, close: unknown) => {
    const resumeQuit = quitHeldUp && close === true
    quitHeldUp = false
    if (close !== true) return
    unsaved.delete(event.sender.id)
    discarded.add(event.sender.id)
    BrowserWindow.fromWebContents(event.sender)?.close()
    if (resumeQuit) app.quit()
  })
}

/**
 * The session the PDF of an export is printed in, in memory and of its own: it loads a file of
 * an export being printed and nothing else — no frame, nothing from the web. A path is compared
 * as a path, so that `C:` and `c:` are one drive.
 */
let print: { session: Electron.Session; sites: Set<string> } | undefined
function printSession(): { session: Electron.Session; sites: Set<string> } {
  if (print) return print
  const sites = new Set<string>()
  const allowed = (url: string): boolean => {
    let path: string
    try {
      path = fileURLToPath(url)
    } catch {
      return false
    }
    return [...sites].some((site) => {
      const rest = relative(site, path)
      return rest !== '' && !rest.startsWith('..') && !isAbsolute(rest)
    })
  }
  const printing = session.fromPartition('export-print')
  printing.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: details.resourceType === 'subFrame' || !allowed(details.url) })
  )
  print = { session: printing, sites }
  return print
}

/**
 * A page of an export as a PDF, A4, one ADR per page: loaded in a window nobody sees, which
 * runs no script, navigates nowhere, has no frames, and loads nothing but the files of the
 * export in `site` — whatever the page asked for, nothing else of the disk ends up printed.
 */
async function printToPdf(url: string, site: string): Promise<Buffer> {
  const printing = printSession()
  printing.sites.add(site)
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      session: printing.session,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false
    }
  })
  try {
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    await window.loadURL(url)
    return await window.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true
    })
  } finally {
    window.destroy()
    printing.sites.delete(site)
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    show: false,
    title: 'Softarch Suite',
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

  // Closing a window that holds unsaved text asks first, and the window asks: it has the
  // dialog for it. Quitting the app closes its windows, so it goes the same way. A window
  // that cannot answer — crashed, or hung for now — is not asked; one that loads afresh
  // holds no text any more.
  const contents = mainWindow.webContents
  const id = contents.id
  mainWindow.on('close', (event) => {
    if (!unsaved.has(id) || hung.has(id) || contents.isCrashed()) return
    event.preventDefault()
    quitHeldUp = quitting
    quitting = false
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    contents.send(CHANNEL.closeRequested)
  })
  mainWindow.on('unresponsive', () => hung.add(id))
  mainWindow.on('responsive', () => hung.delete(id))
  mainWindow.on('closed', () => {
    unsaved.delete(id)
    hung.delete(id)
    discarded.delete(id)
  })
  contents.on('did-start-loading', () => unsaved.delete(id))

  // A reload throws the page away, and with it the text that is not saved. While the window
  // holds some, it refuses to unload (`beforeunload`, App.svelte), and the person is asked
  // here, before anything is lost. A close they were asked about already goes ahead.
  contents.on('will-prevent-unload', (event) => {
    if (!discarded.has(id)) {
      const answer = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        message: t.unload.message,
        detail: t.unload.detail,
        buttons: [t.unload.discard, t.unload.keep],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      })
      if (answer !== 0) return
    }
    event.preventDefault()
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
  // The appId of electron-builder.yml: Windows groups the window under the shortcut the
  // installer made only when both name the same.
  electronApp.setAppUserModelId('io.github.cyphrax.softarch-suite')

  // F12 toggles DevTools in development; Ctrl/Cmd+R is ignored in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  setMenu()

  protocol.handle(
    ASSET_SCHEME,
    assetHandler((id) => repositories.rootOf(id))
  )
  registerIpc()
  registerDiagrams(ipcMain, repositories, structures)
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

// A window that asks about unsaved text cancels the quit; it has to know there was one.
app.on('before-quit', () => {
  quitting = true
})

app.on('will-quit', () => {
  void repositories.closeAll()
  void structures.closeAll()
  void annotations.closeAll()
  void analysis.stop()
})
