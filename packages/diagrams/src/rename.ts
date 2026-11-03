/**
 * A Rename of a Component in the Diagrams that show it (docs/diagrams-format.md, section 2,
 * "IDs"): its ID, and those below it, where they name a Component — in `component` and
 * `scope`, and in `from` and `to` where they name a Component element, not an External System
 * that has the same ID. Each ID is replaced where it stands, quoting kept (ADR-0002); the app
 * joins the change set to the Rename of the declaration, the ADRs and the Rules. A picture that
 * was the Diagram as it was is drawn again, so that the Rename leaves it current.
 */
import { isScalar, parseDocument } from 'yaml'
import {
  applyEdits,
  plan,
  type Config,
  type FileSystem,
  type PendingFiles,
  type Plan,
  type Said,
  type TextEdit
} from '@adr-tool/kernel'
import { elementsOf, readDiagram, type Diagram } from './diagram'
import type { ExportModel } from './export'
import { comparable, listOf, mapsOf, pairOf, rangeOf } from './lines'
import { openDiagrams, svgPathOf } from './location'
import { englishOf, refusal, type DiagramsSaid } from './sentences'
import { drawDiagram } from './svg'

const asText = (text: string): string => text

/**
 * The declaration before the Rename and after it, which the pictures are drawn from. Without
 * them, a picture is not looked at.
 */
export interface RenamedDeclaration {
  readonly before: ExportModel
  readonly after: ExportModel
}

/**
 * Plan the Rename of the Component `from` to `to` in every Diagram of the repository. A Diagram
 * that cannot be read is not rewritten; where its text names the Component, the plan warns of it.
 * With the declaration before and after, each picture that is current is drawn again from the
 * renamed Diagram and the renamed declaration; one that is not current is left as it is, and its
 * Problem `stale-picture` stays.
 */
export async function planRenameInDiagrams(
  fs: FileSystem,
  from: string,
  to: string,
  config?: Config,
  declaration?: RenamedDeclaration
): Promise<Plan> {
  const warned: DiagramsSaid[] = []
  const planned = await plan(fs, asText, async (pending) => {
    const { diagrams } = await openDiagrams(fs, config)
    for (const diagram of diagrams) {
      if (diagram.readable) {
        const text = await pending.read(diagram.path)
        await pending.write(diagram.path, (text) => renameEdits(diagram.path, text, from, to))
        if (declaration) await redraw(fs, pending, diagram, text, from, to, declaration)
      } else if (mentions((await fs.readText(diagram.path)) ?? '', from)) {
        warned.push({
          code: 'diagram-not-renamed',
          values: { path: diagram.path, component: from }
        })
      }
    }
  })
  if (!planned.ok || warned.length === 0) return planned
  return { ...planned, warnings: warned.map(englishOf), warned: warned as Said[] }
}

/** Draw the picture of a Diagram again after the Rename, where it was current before it. */
async function redraw(
  fs: FileSystem,
  pending: PendingFiles,
  diagram: Diagram,
  text: string,
  from: string,
  to: string,
  declaration: RenamedDeclaration
): Promise<void> {
  const unreadable = (model: ExportModel): boolean =>
    model.problems.some((problem) => problem.kind === 'unreadable-declaration')
  if (unreadable(declaration.before) || unreadable(declaration.after)) return
  const svg = svgPathOf(diagram)
  const picture = await fs.readText(svg)
  if (picture === undefined || picture !== drawDiagram(diagram, declaration.before)) return
  const renamed = readDiagram(diagram.path, renameInDiagram(diagram.path, text, from, to))
  if (!renamed.readable) return
  const after = drawDiagram(renamed, declaration.after)
  // The picture belongs to the suite: it is replaced as a whole (as `planExport` does).
  if (after !== picture)
    await pending.write(svg, (old) => [{ start: 0, end: old.length, insert: after }])
}

/** Whether a text names a Component ID, or one below it, as a word. */
function mentions(text: string, id: string): boolean {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z0-9/-])${escaped}(?:/|$|[^a-z0-9-])`, 'm').test(text)
}

/** The text of a Diagram after the Rename of the Component `from` to `to`. */
export function renameInDiagram(path: string, text: string, from: string, to: string): string {
  return applyEdits(text, renameEdits(path, text, from, to))
}

function renameEdits(path: string, text: string, from: string, to: string): TextEdit[] {
  const before = readDiagram(path, text)
  // A Diagram that cannot be read is not rewritten; `planRenameInDiagrams` warns of it.
  if (!before.readable) return []
  const cannot = refusal({ code: 'cannot-rename-in-diagram', values: { path, component: from } })
  const moved = (id: string): string | undefined =>
    id === from || id.startsWith(`${from}/`) ? to + id.slice(from.length) : undefined
  // A connection names a Component where the element of its ID that is read is one.
  const kinds = new Map(elementsOf(before).map((element) => [element.id, element.kind]))
  const doc = parseDocument(text, { uniqueKeys: false })

  const edits: TextEdit[] = []
  // An alias is no text the reader takes: a Diagram that has one where an ID stands cannot be
  // read, and is not rewritten.
  const rename = (node: unknown, names: (id: string) => boolean): void => {
    if (!isScalar(node) || typeof node.value !== 'string') return
    const renamed = moved(node.value)
    if (renamed === undefined || !names(node.value)) return
    const range = rangeOf(node)
    if (!range || node.type === 'BLOCK_LITERAL' || node.type === 'BLOCK_FOLDED') throw cannot
    const quote = node.type === 'QUOTE_SINGLE' ? "'" : node.type === 'QUOTE_DOUBLE' ? '"' : ''
    edits.push({ start: range[0], end: range[1], insert: `${quote}${renamed}${quote}` })
  }
  const always = (): boolean => true
  rename(pairOf(doc.contents, 'scope')?.value, always)
  for (const item of mapsOf(listOf(doc, 'elements')))
    rename(pairOf(item, 'component')?.value, always)
  const component = (id: string): boolean => kinds.get(id) === 'component'
  for (const item of mapsOf(listOf(doc, 'connections'))) {
    rename(pairOf(item, 'from')?.value, component)
    rename(pairOf(item, 'to')?.value, component)
  }
  if (edits.length === 0) return []

  // What is handed out reads back as the same Diagram with the new IDs.
  const after = readDiagram(path, applyEdits(text, edits))
  const named = (id: string, kind: 'component' | 'end'): string =>
    (kind === 'component' || kinds.get(id) === 'component' ? moved(id) : undefined) ?? id
  const expected: Diagram = {
    ...before,
    ...(before.scope !== undefined && { scope: moved(before.scope) ?? before.scope }),
    elements: before.elements.map((element) =>
      element.kind === 'component' ? { ...element, id: named(element.id, 'component') } : element
    ),
    connections: before.connections.map((connection) => ({
      ...connection,
      from: named(connection.from, 'end'),
      to: named(connection.to, 'end')
    }))
  }
  if (!after.readable || comparable(after) !== comparable(expected)) throw cannot
  return edits
}
