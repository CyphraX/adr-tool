/**
 * The export of a Diagram (docs/diagrams-format.md, section 6): its picture as SVG, beside its
 * file, as a change set that the caller previews. The SVG is derived, and committed on purpose
 * (ADR-0018).
 */
import { plan, type FileSystem, type Plan } from '@adr-tool/kernel'
import type { DeclaredComponent } from '@adr-tool/structure/model'
import { readDiagram } from './diagram'
import { svgPathOf } from './location'
import { refuse } from './sentences'
import { drawDiagram } from './svg'

/** What an export tells its caller beyond its change set: where the picture goes. */
export type ExportPlan = Plan<{ readonly svg: string }>

const asText = (text: string): string => text

/**
 * Plan writing the picture of the Diagram at `path` beside it, as the file is on disk now.
 * `components` is the declaration the Components' names and descriptions come from. When the
 * picture there is the same already, the change set is empty.
 */
export async function planExport(
  fs: FileSystem,
  path: string,
  components: readonly DeclaredComponent[]
): Promise<ExportPlan> {
  const svg = svgPathOf({ path })
  const planned = await plan(fs, asText, async (pending) => {
    const text = await fs.readText(path)
    if (text === undefined) refuse({ code: 'no-longer-exists', values: { path } })
    const diagram = readDiagram(path, text)
    if (!diagram.readable) {
      refuse({ code: 'unreadable-diagram', values: { path, detail: diagram.problems[0].detail } })
    }
    const picture = drawDiagram(diagram, components)
    const current = await fs.readText(svg)
    if (current === undefined) await pending.create(svg, picture)
    else if (current !== picture) {
      // The picture belongs to the suite: it is replaced as a whole.
      await pending.write(svg, (old) => [{ start: 0, end: old.length, insert: picture }])
    }
  })
  return planned.ok ? { ...planned, svg } : planned
}
