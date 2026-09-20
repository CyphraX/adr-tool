/**
 * What the suite writes into `.arch/components.yml`. As everywhere (ADR-0002) it splices: the
 * YAML is parsed to find where things stand, and the text is edited at those offsets, so that
 * comments, quoting, foreign keys and line endings stay what a person made them.
 */
import { isMap, isScalar, isSeq, parseDocument, type Pair, type YAMLMap, type YAMLSeq } from 'yaml'
import { Refusal, type TextEdit } from '@adr-tool/kernel'
import type { DeclaredComponent } from './declaration'
import type { PatternKey } from './problems'

const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n')
const lineStart = (text: string, offset: number): number => text.lastIndexOf('\n', offset - 1) + 1

/** The end of a node is the end of its line: a key without a value ends before its line break. */
function throughLineBreak(text: string, offset: number): number {
  if (offset === 0 || text[offset - 1] === '\n') return offset
  const next = text.indexOf('\n', offset)
  return next === -1 ? text.length : next + 1
}

/** The lines that declare these Components, the key `components` included. */
export function renderComponents(components: readonly DeclaredComponent[], eol = '\n'): string {
  const lines: string[] = ['components:']
  const render = (list: readonly DeclaredComponent[], indent: string): void => {
    for (const component of list) {
      const segment = component.id.slice(component.id.lastIndexOf('/') + 1)
      lines.push(`${indent}${segment}:`)
      if (component.name !== segment) lines.push(`${indent}  name: ${scalar(component.name)}`)
      if (component.description !== undefined) {
        lines.push(`${indent}  description: ${scalar(component.description)}`)
      }
      if (component.paths.length > 0) lines.push(`${indent}  paths: ${flow(component.paths)}`)
      if (component.tests.length > 0) lines.push(`${indent}  tests: ${flow(component.tests)}`)
      if (component.children.length > 0) {
        lines.push(`${indent}  components:`)
        render(component.children, `${indent}    `)
      }
    }
  }
  render(components, '  ')
  return lines.map((line) => line + eol).join('')
}

/** In a flow list a pattern with a blank or a comma is quoted: legal without, but hard to read. */
const flow = (items: readonly string[]): string =>
  `[${items.map((item) => (/[\s,]/.test(item) ? JSON.stringify(item) : scalar(item))).join(', ')}]`

/** Plain where that reads back as the same text, double-quoted otherwise. */
function scalar(value: string): string {
  const plain = /^[A-Za-z0-9_./][A-Za-z0-9_./* -]*$/.test(value) && value === value.trim()
  const word =
    /^(?:y|n|yes|no|on|off|true|false|null|~)$/i.test(value) || !Number.isNaN(Number(value))
  return plain && !word && !value.includes(' #') ? value : JSON.stringify(value)
}

/**
 * Put the Components into a declaration that is there but declares none: in the place of an
 * empty `components` key, or at the end of the file. Nothing else in the file moves.
 */
export function insertComponents(
  text: string,
  components: readonly DeclaredComponent[]
): TextEdit[] {
  const eol = eolOf(text)
  const rendered = renderComponents(components, eol)
  const doc = parseDocument(text, { uniqueKeys: false })
  const existing = isMap(doc.contents) ? findPair(doc.contents, 'components') : undefined
  if (existing) {
    const start = lineStart(text, rangeOf(existing.key)[0])
    const end = throughLineBreak(text, rangeOf(existing.value ?? existing.key)[2])
    return [{ start, end, insert: rendered }]
  }
  const lead = text === '' || text.endsWith('\n') ? '' : eol
  return [{ start: text.length, end: text.length, insert: lead + rendered }]
}

/**
 * Take a pattern out of `paths` or `tests` of a Component, where it stands. The last pattern
 * takes the key with it: the suite never leaves an empty list behind.
 */
export function removePattern(
  text: string,
  component: string,
  key: PatternKey,
  pattern: string
): TextEdit[] {
  const doc = parseDocument(text, { uniqueKeys: false })
  let map: YAMLMap | undefined = isMap(doc.contents) ? doc.contents : undefined
  for (const segment of component.split('/')) {
    const components = map && findPair(map, 'components')?.value
    const next = isMap(components) ? findPair(components, segment)?.value : undefined
    map = isMap(next) ? next : undefined
  }
  const pair = map && findPair(map, key)
  const list = pair?.value
  if (!pair || !isSeq(list)) {
    throw new Refusal(`${component} has no list "${key}" any more. Look at the file again.`)
  }

  const items = list.items
  const leaves = (item: unknown): boolean => isScalar(item) && textOf(item) === pattern
  if (!items.some(leaves)) {
    throw new Refusal(`"${pattern}" is no longer in ${key} of ${component}.`)
  }
  if (items.every(leaves)) {
    return [{ start: lineStart(text, rangeOf(pair.key)[0]), end: rangeOf(list)[2], insert: '' }]
  }
  return list.flow ? fromFlowList(text, list, leaves) : fromBlockList(text, list, leaves)
}

const byHand = (): Refusal =>
  new Refusal(
    'The list is written in a way the suite cannot take an item out of. Remove the pattern in an editor.'
  )

/** One line per item: the line goes, from its indentation to its line break. */
function fromBlockList(
  text: string,
  list: YAMLSeq,
  leaves: (item: unknown) => boolean
): TextEdit[] {
  return list.items.filter(leaves).map((item) => {
    const [valueStart, , next] = rangeOf(item)
    const dash = text.lastIndexOf('-', valueStart)
    const start = lineStart(text, dash)
    const lead = text.slice(start, dash) + text.slice(dash + 1, valueStart)
    const endsLine = text[next - 1] === '\n' || next === text.length
    if (dash < start || lead.trim() !== '' || !endsLine) throw byHand()
    return { start, end: next, insert: '' }
  })
}

/**
 * In a flow list an item leaves together with one comma: the one behind it, or, at the end of
 * the list, the one in front. Anything else between two items, a comment say, is nothing the
 * suite could assign to either of them.
 */
function fromFlowList(text: string, list: YAMLSeq, leaves: (item: unknown) => boolean): TextEdit[] {
  const items = list.items
  const separator = (left: number, right: number): void => {
    const between = text.slice(rangeOf(items[left])[1], rangeOf(items[right])[0])
    if (!/^\s*,\s*$/.test(between)) throw byHand()
  }
  const lastStaying = items.findLastIndex((item) => !leaves(item))
  const edits: TextEdit[] = []
  items.forEach((item, position) => {
    if (!leaves(item) || position > lastStaying) return
    separator(position, position + 1)
    edits.push({ start: rangeOf(item)[0], end: rangeOf(items[position + 1])[0], insert: '' })
  })
  if (lastStaying < items.length - 1) {
    for (let left = lastStaying; left < items.length - 1; left++) separator(left, left + 1)
    edits.push({ start: rangeOf(items[lastStaying])[1], end: rangeOf(items.at(-1))[1], insert: '' })
  }
  return edits
}

const findPair = (map: YAMLMap, key: string): Pair | undefined =>
  map.items.find((pair) => isScalar(pair.key) && String(pair.key.value) === key)

const textOf = (node: { value: unknown; source?: string }): string =>
  typeof node.value === 'string' ? node.value : (node.source ?? String(node.value))

function rangeOf(node: unknown): [number, number, number] {
  const range = (node as { range?: [number, number, number] | null } | null)?.range
  if (!range) throw byHand()
  return range
}
