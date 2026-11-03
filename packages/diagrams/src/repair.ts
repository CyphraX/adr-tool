/**
 * The Repair of an element whose Component is gone (docs/diagrams-format.md, section 5): its
 * item and the items of its connections leave the file, line by line. As everywhere (ADR-0002)
 * the text is spliced: the YAML is parsed to find where the items stand, and only their lines
 * are taken out, so that comments, quoting and everything else stay what a person made them.
 */
import { parseDocument } from 'yaml'
import { applyEdits, plan, type FileSystem, type Plan, type TextEdit } from '@adr-tool/kernel'
import { readDiagram } from './diagram'
import { comparable, itemLines, listOf, mapsOf, textAt } from './lines'
import type { DiagramProblem } from './problems'
import { refusal, refuse } from './sentences'

const asText = (text: string): string => text

/** The Repair of a Problem, as a change set. A Repair exists only where exactly one change is right. */
export function planRepair(fs: FileSystem, problem: DiagramProblem): Promise<Plan> {
  return plan(fs, asText, async (pending) => {
    if (problem.kind !== 'component-gone') refuse({ code: 'no-diagram-repair', values: {} })
    await pending.write(problem.path, (text) =>
      removeComponent(problem.path, text, problem.component)
    )
  })
}

/**
 * Take the elements that show `component` out of a Diagram, with every connection from or to
 * it — unless another element keeps its ID. Only the lines of those items change.
 */
export function removeComponent(path: string, text: string, component: string): TextEdit[] {
  const before = readDiagram(path, text)
  if (!before.readable) {
    refuse({ code: 'unreadable-diagram', values: { path, detail: before.problems[0].detail } })
  }
  const leaving = before.elements.filter(
    (element) => element.kind === 'component' && element.id === component
  )
  if (leaving.length === 0) refuse({ code: 'no-longer-shows', values: { path, component } })
  const kept = before.elements.some(
    (element) => element.id === component && element.kind !== 'component'
  )
  const cannot = refusal({ code: 'cannot-remove-element', values: { path, component } })

  const doc = parseDocument(text, { uniqueKeys: false })
  const lines = (item: unknown): TextEdit => {
    const found = itemLines(text, item)
    if (!found) throw cannot
    return { ...found, insert: '' }
  }

  const edits: TextEdit[] = []
  const elements = listOf(doc, 'elements')
  if (!elements || elements.flow) throw cannot
  for (const item of elements.items) {
    if (textAt(item, 'component') === component) edits.push(lines(item))
  }
  const connections = listOf(doc, 'connections')
  if (!kept && connections) {
    const goes = mapsOf(connections).filter(
      (item) => textAt(item, 'from') === component || textAt(item, 'to') === component
    )
    if (goes.length > 0 && connections.flow) throw cannot
    for (const item of goes) edits.push(lines(item))
  }

  // What is handed out reads back as the same Diagram without those items.
  const after = readDiagram(path, applyEdits(text, edits))
  const expected = {
    ...before,
    elements: before.elements.filter(
      (element) => !(element.kind === 'component' && element.id === component)
    ),
    connections: before.connections.filter(
      (connection) => kept || (connection.from !== component && connection.to !== component)
    )
  }
  if (!after.readable || comparable(after) !== comparable(expected)) throw cannot
  return edits
}
