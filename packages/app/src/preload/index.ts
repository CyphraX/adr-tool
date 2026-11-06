import { contextBridge, ipcRenderer } from 'electron'
import { CHANNEL, type Api, type OpenRepository } from '../shared/ipc'
import { diagramsBridge } from './diagrams'

// The typed bridge between the main process and the sandboxed renderer.
// The renderer never gets more than what is listed here.
const api: Api = {
  platform: process.platform,
  restoreSession: () => ipcRenderer.invoke(CHANNEL.restoreSession),
  openRepository: () => ipcRenderer.invoke(CHANNEL.openRepository),
  closeRepository: (id) => ipcRenderer.invoke(CHANNEL.closeRepository, id),
  setActiveRepository: (id) => ipcRenderer.invoke(CHANNEL.setActiveRepository, id),
  planDecision: (repositoryId, logPath, adrId, decision) =>
    ipcRenderer.invoke(CHANNEL.planDecision, repositoryId, logPath, adrId, decision),
  listTemplates: (repositoryId) => ipcRenderer.invoke(CHANNEL.listTemplates, repositoryId),
  planCreate: (request) => ipcRenderer.invoke(CHANNEL.planCreate, request),
  planBodyEdit: (request) => ipcRenderer.invoke(CHANNEL.planBodyEdit, request),
  planMetadataEdit: (request) => ipcRenderer.invoke(CHANNEL.planMetadataEdit, request),
  planRepair: (request) => ipcRenderer.invoke(CHANNEL.planRepair, request),
  planMigration: (request) => ipcRenderer.invoke(CHANNEL.planMigration, request),
  history: (repositoryId, logPath, adrId) =>
    ipcRenderer.invoke(CHANNEL.history, repositoryId, logPath, adrId),
  historyChange: (repositoryId, logPath, adrId, entryId) =>
    ipcRenderer.invoke(CHANNEL.historyChange, repositoryId, logPath, adrId, entryId),
  planCommit: (repositoryId, logPath, adrId) =>
    ipcRenderer.invoke(CHANNEL.planCommit, repositoryId, logPath, adrId),
  commit: (planId, include, message) =>
    ipcRenderer.invoke(CHANNEL.commit, planId, include, message),
  discardCommit: (planId) => ipcRenderer.invoke(CHANNEL.discardCommit, planId),
  branches: (repositoryId) => ipcRenderer.invoke(CHANNEL.branches, repositoryId),
  branchAdr: (repositoryId, sha, path) =>
    ipcRenderer.invoke(CHANNEL.branchAdr, repositoryId, sha, path),
  pickExport: (repositoryId, kind) => ipcRenderer.invoke(CHANNEL.pickExport, repositoryId, kind),
  exportTo: (ticket, diagrams) => ipcRenderer.invoke(CHANNEL.exportTo, ticket, diagrams),
  openExported: (path) => ipcRenderer.invoke(CHANNEL.openExported, path),
  applyChange: (changeId) => ipcRenderer.invoke(CHANNEL.applyChange, changeId),
  discardChange: (changeId) => ipcRenderer.invoke(CHANNEL.discardChange, changeId),
  openExternal: (url) => ipcRenderer.invoke(CHANNEL.openExternal, url),
  onRepositoryChanged: (listener) => {
    const handler = (_: unknown, repository: OpenRepository): void => listener(repository)
    ipcRenderer.on(CHANNEL.repositoryChanged, handler)
    return () => ipcRenderer.removeListener(CHANNEL.repositoryChanged, handler)
  },
  structureView: (repositoryId, parent, tests, expanded) =>
    ipcRenderer.invoke(CHANNEL.structureView, repositoryId, parent, tests, expanded),
  readSourceFile: (repositoryId, path) =>
    ipcRenderer.invoke(CHANNEL.readSourceFile, repositoryId, path),
  structureOutline: (repositoryId, fresh) =>
    ipcRenderer.invoke(CHANNEL.structureOutline, repositoryId, fresh === true),
  onStructureChanged: (listener) => {
    const handler = (_: unknown, repositoryId: string): void => listener(repositoryId)
    ipcRenderer.on(CHANNEL.structureChanged, handler)
    return () => ipcRenderer.removeListener(CHANNEL.structureChanged, handler)
  },
  planAdopt: (repositoryId) => ipcRenderer.invoke(CHANNEL.planAdopt, repositoryId),
  planStructureRepair: (repositoryId, problem) =>
    ipcRenderer.invoke(CHANNEL.planStructureRepair, repositoryId, problem),
  planRename: (repositoryId, component, segment) =>
    ipcRenderer.invoke(CHANNEL.planRename, repositoryId, component, segment),
  conformanceView: (repositoryId, watch) =>
    ipcRenderer.invoke(CHANNEL.conformanceView, repositoryId, watch === true),
  planRule: (repositoryId, request) => ipcRenderer.invoke(CHANNEL.planRule, repositoryId, request),
  planException: (repositoryId, draft) =>
    ipcRenderer.invoke(CHANNEL.planException, repositoryId, draft),
  planConformanceRepair: (repositoryId, repair) =>
    ipcRenderer.invoke(CHANNEL.planConformanceRepair, repositoryId, repair),
  setUnsaved: (unsaved) => ipcRenderer.invoke(CHANNEL.setUnsaved, unsaved),
  setLanguage: (language) => ipcRenderer.invoke(CHANNEL.setLanguage, language),
  reloadWindow: () => ipcRenderer.invoke(CHANNEL.reloadWindow),
  onCloseRequested: (listener) => {
    const handler = (): void => listener()
    ipcRenderer.on(CHANNEL.closeRequested, handler)
    return () => ipcRenderer.removeListener(CHANNEL.closeRequested, handler)
  },
  answerCloseRequest: (close) => ipcRenderer.invoke(CHANNEL.answerCloseRequest, close),
  ...diagramsBridge(ipcRenderer)
}

contextBridge.exposeInMainWorld('api', api)
