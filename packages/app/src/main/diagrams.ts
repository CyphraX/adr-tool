/**
 * The Diagrams module's side of the open repositories (docs/diagrams-format.md): the Diagrams as
 * their files are on disk, with their Problems and their Drift, and the plans of what the window
 * changes in them. Nothing here writes: every change is a change set the window previews.
 */
import { openConfig, type FileSystem } from '@adr-tool/kernel'
import {
  checkPicture,
  driftOf,
  openDiagrams,
  problemsOf,
  readDiagram,
  suggestConnections,
  svgPathOf,
  type ExportModel
} from '@adr-tool/diagrams'
import {
  DECLARATION_PATH,
  readDeclaration,
  type Structure,
  type StructureProblem
} from '@adr-tool/structure/model'
import type {
  DiagramEntry,
  DiagramLook,
  DiagramsDeclaration,
  DiagramsOverview
} from '../shared/diagrams'
import type { Analysis } from './analysis'

/** What the Diagrams are read against: the declaration, and whether it can be read. */
type Declared = ExportModel & Pick<Structure, 'origin' | 'components'>

/**
 * The declaration of Components as it is on disk now, for the Problems of the Diagrams: what
 * every module's count of Problems needs, without analysing the code.
 */
export async function declaredOnDisk(fs: FileSystem): Promise<Declared> {
  return declaredIn(await fs.readText(DECLARATION_PATH))
}

/** The declaration of Components as a text of `.arch/components.yml` says it. */
export function declaredIn(text: string | undefined): Declared {
  const declaration = readDeclaration(text)
  if (declaration.kind === 'declared') {
    return { origin: 'declared', components: declaration.components, problems: [] }
  }
  const problems: StructureProblem[] =
    declaration.kind === 'unreadable'
      ? [{ kind: 'unreadable-declaration', detail: declaration.detail, said: declaration.said }]
      : []
  return { origin: 'draft', components: [], problems }
}

/** The declaration as the window is told it. */
const declarationOf = (declared: Declared): DiagramsDeclaration => ({
  origin: declared.origin,
  unreadable: declared.problems.some((problem) => problem.kind === 'unreadable-declaration'),
  components: declared.origin === 'declared' ? declared.components : []
})

/**
 * The Diagrams of a repository, each with its Problems — of its file, against the declaration,
 * and of its picture —, and, with `analysis`, its Drift. Without, the declaration is read from
 * the disk; with, the analysis's is taken, which the Drift is derived from.
 */
export async function overviewOf(
  repositoryId: string,
  fs: FileSystem,
  analysis?: Analysis
): Promise<DiagramsOverview> {
  const config = await openConfig(fs)
  const declared: Declared = analysis ? analysis.structure : await declaredOnDisk(fs)
  const { directory, problems, diagrams } = await openDiagrams(fs, config)
  const entries: DiagramEntry[] = []
  for (const diagram of diagrams) {
    const text = (await fs.readText(diagram.path)) ?? ''
    const picture = svgPathOf(diagram)
    if (!diagram.readable) {
      entries.push({
        id: diagram.id,
        path: diagram.path,
        picture,
        text,
        readable: false,
        problems: diagram.problems
      })
      continue
    }
    const stale = await checkPicture(fs, diagram, declared)
    entries.push({
      id: diagram.id,
      path: diagram.path,
      picture,
      text,
      readable: true,
      ...(diagram.title !== undefined && { title: diagram.title }),
      problems: [...problemsOf(diagram, declared), ...(stale ? [stale] : [])],
      ...(analysis && {
        drift: driftOf(diagram, analysis.structure, analysis.dependencies)
      })
    })
  }
  return {
    repositoryId,
    directory,
    ...(!config.readable && { config: config.problem }),
    problems,
    declared: declarationOf(declared),
    diagrams: entries,
    analysed: analysis !== undefined
  }
}

/**
 * What the code says of a Diagram as the window holds it — its text, saved or not —: its
 * Problems, its Drift and the connections the code suggests. Nothing is read from the disk.
 */
export function lookOf(path: string, text: string, analysis: Analysis): DiagramLook {
  const diagram = readDiagram(path, text)
  if (!diagram.readable) {
    return { problems: diagram.problems, drift: [], suggestions: [], analysed: true }
  }
  const { structure, dependencies } = analysis
  return {
    problems: problemsOf(diagram, structure),
    drift: driftOf(diagram, structure, dependencies),
    suggestions: suggestConnections(diagram, structure, dependencies),
    analysed: true
  }
}

/** Whether `path` is one of the Diagrams of the repository: the window names no other file. */
export async function isDiagram(fs: FileSystem, path: string): Promise<boolean> {
  const { diagrams } = await openDiagrams(fs)
  return diagrams.some((diagram) => diagram.path === path)
}
