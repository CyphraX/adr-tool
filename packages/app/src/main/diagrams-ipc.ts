/**
 * The Diagrams module's channels (shared/diagrams.ts): what the window asks of the Diagrams of
 * an open repository, looked at first (main/diagram-requests.ts), and the changes it plans,
 * held like every other until the window applies them by their id.
 */
import type { IpcMain } from 'electron'
import {
  planDiagramEdit,
  planExport,
  planNewDiagram,
  planRepair,
  type DiagramProblem
} from '@adr-tool/diagrams'
import type { FileSystem, Plan } from '@adr-tool/kernel'
import { DIAGRAMS_CHANNEL } from '../shared/diagrams'
import type { PlanResult } from '../shared/ipc'
import {
  diagramEditsRequest,
  diagramProblemRequest,
  diagramTextRequest,
  newDiagramRequest
} from './diagram-requests'
import { declaredOnDisk, isDiagram, lookOf, overviewOf } from './diagrams'
import { nodeFileSystem } from './node-file-system'
import type { Repositories } from './repositories'
import { t } from './strings'
import { AnalysisDropped, type Structures } from './structures'

/** What a Diagram that is being started is called while it is looked at: it has no file yet. */
const NEW_DIAGRAM = 'new.yml'

export function registerDiagrams(
  ipc: Pick<IpcMain, 'handle'>,
  repositories: Repositories,
  structures: Structures
): void {
  const rootOf = (repositoryId: unknown): string | undefined =>
    typeof repositoryId === 'string' ? repositories.rootOf(repositoryId) : undefined
  /** The plan of `planned` for a Diagram of the repository, held for the window. */
  const planFor = async (
    repositoryId: unknown,
    path: unknown,
    planned: (fs: FileSystem, path: string) => Promise<Plan>
  ): Promise<PlanResult> => {
    const root = rootOf(repositoryId)
    if (root === undefined) return { ok: false, reason: t.repositoryClosed }
    if (typeof path !== 'string') return { ok: false, reason: t.notUnderstood }
    const fs = nodeFileSystem(root)
    if (!(await isDiagram(fs, path))) return { ok: false, reason: t.notADiagram(path) }
    return repositories.hold(repositoryId as string, await planned(fs, path))
  }

  ipc.handle(DIAGRAMS_CHANNEL.diagrams, async (_, repositoryId: unknown, analysed: unknown) => {
    const root = rootOf(repositoryId)
    if (root === undefined) return { ok: false, reason: t.repositoryClosed }
    try {
      const analysis =
        analysed === true ? await structures.analysisOf(repositoryId as string, root) : undefined
      return {
        ok: true,
        overview: await overviewOf(repositoryId as string, nodeFileSystem(root), analysis)
      }
    } catch (error) {
      if (error instanceof AnalysisDropped) return { ok: false, reason: t.repositoryClosed }
      return { ok: false, reason: t.analysisFailed(String(error)) }
    }
  })

  ipc.handle(
    DIAGRAMS_CHANNEL.diagramLook,
    async (_, repositoryId: unknown, path: unknown, text: unknown) => {
      const root = rootOf(repositoryId)
      if (root === undefined) return { ok: false, reason: t.repositoryClosed }
      const held = diagramTextRequest(text)
      if ((path !== undefined && typeof path !== 'string') || held === undefined) {
        return { ok: false, reason: t.notUnderstood }
      }
      // Without a path, a Diagram that is being started: nothing of the disk is named.
      if (path !== undefined && !(await isDiagram(nodeFileSystem(root), path))) {
        return { ok: false, reason: t.notADiagram(path) }
      }
      try {
        const analysis = await structures.analysisOf(repositoryId as string, root)
        return { ok: true, look: lookOf(path ?? NEW_DIAGRAM, held, analysis) }
      } catch (error) {
        return { ok: false, reason: t.analysisFailed(String(error)) }
      }
    }
  )

  ipc.handle(DIAGRAMS_CHANNEL.planDiagramEdit, (_, request: unknown) => {
    const { repositoryId, path, edits } = record(request)
    const asked = diagramEditsRequest(edits)
    if (!asked) return { ok: false, reason: t.notUnderstood }
    return planFor(repositoryId, path, (fs, diagram) => planDiagramEdit(fs, diagram, asked))
  })

  ipc.handle(DIAGRAMS_CHANNEL.planNewDiagram, async (_, request: unknown) => {
    const { repositoryId, diagram } = record(request)
    const root = rootOf(repositoryId)
    if (root === undefined) return { ok: false, reason: t.repositoryClosed }
    const spec = newDiagramRequest(diagram)
    if (!spec) return { ok: false, reason: t.notUnderstood }
    return repositories.hold(
      repositoryId as string,
      await planNewDiagram(nodeFileSystem(root), spec)
    )
  })

  // The picture is drawn from the declaration as it is on disk now, as `adr check` reads it.
  ipc.handle(DIAGRAMS_CHANNEL.planDiagramExport, (_, repositoryId: unknown, path: unknown) =>
    planFor(repositoryId, path, async (fs, diagram) =>
      planExport(fs, diagram, await declaredOnDisk(fs))
    )
  )

  ipc.handle(DIAGRAMS_CHANNEL.planDiagramRepair, (_, repositoryId: unknown, problem: unknown) => {
    const repair = diagramProblemRequest(problem)
    if (!repair) return { ok: false, reason: t.notUnderstood }
    return planFor(repositoryId, repair.path, (fs, diagram) => repairOf(fs, diagram, repair))
  })
}

/** The Repair of a Problem: an element whose Component is gone leaves, a picture is exported again. */
async function repairOf(fs: FileSystem, path: string, problem: DiagramProblem): Promise<Plan> {
  if (problem.kind === 'stale-picture') return planExport(fs, path, await declaredOnDisk(fs))
  return planRepair(fs, problem)
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}
