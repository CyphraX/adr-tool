import type { IpcRenderer } from 'electron'
import { DIAGRAMS_CHANNEL, type DiagramsApi } from '../shared/diagrams'

/** The Diagrams module's part of the bridge: each call goes to its channel, and nothing else. */
export const diagramsBridge = (ipc: Pick<IpcRenderer, 'invoke'>): DiagramsApi => ({
  diagrams: (repositoryId, analysed) =>
    ipc.invoke(DIAGRAMS_CHANNEL.diagrams, repositoryId, analysed === true),
  diagramLook: (repositoryId, path, text) =>
    ipc.invoke(DIAGRAMS_CHANNEL.diagramLook, repositoryId, path, text),
  planDiagramEdit: (request) => ipc.invoke(DIAGRAMS_CHANNEL.planDiagramEdit, request),
  planNewDiagram: (request) => ipc.invoke(DIAGRAMS_CHANNEL.planNewDiagram, request),
  planDiagramExport: (repositoryId, path) =>
    ipc.invoke(DIAGRAMS_CHANNEL.planDiagramExport, repositoryId, path),
  planDiagramRepair: (repositoryId, problem) =>
    ipc.invoke(DIAGRAMS_CHANNEL.planDiagramRepair, repositoryId, problem)
})
