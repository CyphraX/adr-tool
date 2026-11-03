/**
 * The Repair of an element whose Component is gone (docs/diagrams-format.md, section 5): its
 * item and the items of its connections leave the file, line by line. As everywhere (ADR-0002)
 * the text is spliced: the YAML is parsed to find where the items stand, and only their lines
 * are taken out, so that comments, quoting and everything else stay what a person made them.
 */
import { isMap, isScalar, isSeq, parseDocument, type Pair, type YAMLSeq } from 'yaml'
import { applyEdits, plan, type FileSystem, type Plan, type TextEdit } from '@adr-tool/kernel'
import { readDiagram, type Diagram } from './diagram'
import type { DiagramProblem } from './problems'
import { refusal, refuse } from './sentences'

const asText = (text: string): string => text

const lineStart = (text: string, offset: number): number => text.lastIndexOf('\n', offset - 1) + 1

/** The offset behind the line break of the line an offset stands in; the end of the text without one. */
function lineEnd(text: string, offset: number): number {
  const next = text.indexOf('\n', offset)
  return next === -1 ? text.length : next + 1
}

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
  const listOf = (key: string): YAMLSeq | undefined => {
    if (!isMap(doc.contents)) return undefined
    const pair = doc.contents.items.find(
      (item: Pair) => isScalar(item.key) && item.key.value === key
    )
    return isSeq(pair?.value) ? pair.value : undefined
  }
  const valueOf = (item: unknown, key: string): unknown => {
    if (!isMap(item)) return undefined
    const pair = item.items.find(
      (candidate) => isScalar(candidate.key) && candidate.key.value === key
    )
    return isScalar(pair?.value) ? pair.value.value : undefined
  }

  const edits: TextEdit[] = []
  const elements = listOf('elements')
  if (!elements || elements.flow) throw cannot
  for (const item of elements.items) {
    if (valueOf(item, 'component') === component) edits.push(itemLines(text, item, cannot))
  }
  const connections = listOf('connections')
  if (!kept && connections) {
    const goes = connections.items.filter(
      (item) => valueOf(item, 'from') === component || valueOf(item, 'to') === component
    )
    if (goes.length > 0 && connections.flow) throw cannot
    for (const item of goes) edits.push(itemLines(text, item, cannot))
  }

  // What is handed out reads back as the same Diagram without those items.
  const after = readDiagram(path, applyEdits(text, edits))
  const expected = {
    ...comparable(before),
    elements: comparable(before).elements.filter(
      (element) => !(element.kind === 'component' && element.id === component)
    ),
    connections: comparable(before).connections.filter(
      (connection) => kept || (connection.from !== component && connection.to !== component)
    )
  }
  if (!after.readable || JSON.stringify(comparable(after)) !== JSON.stringify(expected))
    throw cannot
  return edits
}

/**
 * The lines of one item of a block list: from the start of the line of its `-` to the end of
 * the line of its last key. Refused where they hold anything else.
 */
function itemLines(text: string, item: unknown, cannot: Error): TextEdit {
  const range = (item as { range?: readonly [number, number, number] | null }).range
  if (!range) throw cannot
  const [valueStart, valueEnd] = range
  const dash = text.lastIndexOf('-', valueStart)
  const start = lineStart(text, dash)
  const lead = text.slice(start, dash) + text.slice(dash + 1, valueStart)
  if (dash < 0 || lead.trim() !== '') throw cannot
  // A block map ends behind the line break of its last key already, with a comment behind that
  // key; a flow map ends at its brace, and only a comment may follow it on its line.
  const end = text[valueEnd - 1] === '\n' ? valueEnd : lineEnd(text, valueEnd)
  if (!/^[ \t]*(?:#[^\n]*)?\r?\n?$/.test(text.slice(valueEnd, end))) throw cannot
  return { start, end, insert: '' }
}

/** A Diagram as a comparison needs it: without its lines and its Problems, which move. */
function comparable(diagram: Diagram): {
  elements: Diagram['elements']
  connections: Diagram['connections']
  rest: unknown
} {
  const { elements, connections, title, description, level, scope } = diagram
  return {
    elements: elements.map((element) => ({ ...element, line: 0 })),
    connections: connections.map((connection) => ({ ...connection, line: 0 })),
    rest: { title, description, level, scope }
  }
}
