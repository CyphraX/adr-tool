import { contextBridge, ipcRenderer } from 'electron'
import { CHANNEL, type Api, type OpenRepository } from '../shared/ipc'

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
  applyChange: (changeId) => ipcRenderer.invoke(CHANNEL.applyChange, changeId),
  discardChange: (changeId) => ipcRenderer.invoke(CHANNEL.discardChange, changeId),
  openExternal: (url) => ipcRenderer.invoke(CHANNEL.openExternal, url),
  onRepositoryChanged: (listener) => {
    const handler = (_: unknown, repository: OpenRepository): void => listener(repository)
    ipcRenderer.on(CHANNEL.repositoryChanged, handler)
    return () => ipcRenderer.removeListener(CHANNEL.repositoryChanged, handler)
  },
  setUnsaved: (unsaved) => ipcRenderer.invoke(CHANNEL.setUnsaved, unsaved),
  onCloseRequested: (listener) => {
    const handler = (): void => listener()
    ipcRenderer.on(CHANNEL.closeRequested, handler)
    return () => ipcRenderer.removeListener(CHANNEL.closeRequested, handler)
  },
  answerCloseRequest: (close) => ipcRenderer.invoke(CHANNEL.answerCloseRequest, close)
}

contextBridge.exposeInMainWorld('api', api)
