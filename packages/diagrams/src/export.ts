/**
 * The export of a Diagram (docs/diagrams-format.md, section 6): its picture as SVG, beside its
 * file, as a change set that the caller previews. The SVG is derived, and committed on purpose
 * (ADR-0018).
 */
import { plan, type FileSystem, type Plan } from '@adr-tool/kernel'
import { DECLARATION_PATH, type Structure } from '@adr-tool/structure/model'
import { readDiagram, type Diagram } from './diagram'
import type { DiagramProblem } from './problems'
import { svgPathOf } from './location'
import { refuse } from './sentences'
import { drawDiagram } from './svg'

/** What an export tells its caller beyond its change set: where the picture goes. */
export type ExportPlan = Plan<{ readonly svg: string }>

const asText = (text: string): string => text

/** What the export needs of Structure: the declaration, and whether it can be read. */
export type ExportModel = Pick<Structure, 'origin' | 'components' | 'problems'>

/**
 * Plan writing the picture of the Diagram at `path` beside it, as the file is on disk now.
 * The Components' names and descriptions come from their declaration; on a Draft, their IDs
 * stand in the boxes. While the declaration cannot be read, the export is refused: the picture
 * would lose the names until it is fixed. When the picture there is the same already, the
 * change set is empty.
 */
export async function planExport(
  fs: FileSystem,
  path: string,
  structure: ExportModel
): Promise<ExportPlan> {
  const svg = svgPathOf({ path })
  const planned = await plan(fs, asText, async (pending) => {
    if (structure.problems.some((problem) => problem.kind === 'unreadable-declaration')) {
      refuse({ code: 'no-export-without-declaration', values: { path: DECLARATION_PATH } })
    }
    const text = await fs.readText(path)
    if (text === undefined) refuse({ code: 'no-longer-exists', values: { path } })
    const diagram = readDiagram(path, text)
    if (!diagram.readable) {
      refuse({ code: 'unreadable-diagram', values: { path, detail: diagram.problems[0].detail } })
    }
    const picture = drawDiagram(diagram, structure)
    const current = await fs.readText(svg)
    if (current === undefined) await pending.create(svg, picture)
    else if (current !== picture) {
      // The picture belongs to the suite: it is replaced as a whole.
      await pending.write(svg, (old) => [{ start: 0, end: old.length, insert: picture }])
    }
  })
  return planned.ok ? { ...planned, svg } : planned
}

/**
 * Whether the picture beside a Diagram is the Diagram as it is now: the Problem `stale-picture`
 * where it is not, whose Repair is to export it again. Nothing is said where there is no
 * picture — a Diagram need not be exported —, nor while the declaration cannot be read: then
 * the picture cannot be drawn as the export would draw it.
 */
export async function checkPicture(
  fs: FileSystem,
  diagram: Diagram,
  structure: ExportModel
): Promise<DiagramProblem | undefined> {
  if (structure.problems.some((problem) => problem.kind === 'unreadable-declaration')) {
    return undefined
  }
  const picture = svgPathOf(diagram)
  const current = await fs.readText(picture)
  if (current === undefined || current === drawDiagram(diagram, structure)) return undefined
  return { kind: 'stale-picture', path: diagram.path, line: 1, picture }
}
