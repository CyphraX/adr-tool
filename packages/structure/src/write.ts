/**
 * What the suite writes into `.arch/components.yml`. As everywhere (ADR-0002) it splices: the
 * YAML is parsed to find where things stand, and the text is edited at those offsets, so that
 * comments, quoting, foreign keys and line endings stay what a person made them.
 *
 * YAML can be written in more ways than a splice can serve. So every edit is checked before
 * it is handed out: the text it leads to must read back as what was meant. Where it does not,
 * the suite refuses and leaves the file to a person and an editor.
 */
import {
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  type Pair,
  type Scalar,
  type YAMLMap,
  type YAMLSeq
} from 'yaml'
import { applyEdits, type Refusal, type TextEdit } from '@adr-tool/kernel'
import { readDeclaration, type DeclaredComponent } from './declaration'
import { DECLARATION_PATH, type PatternKey } from './problems'
import { refusal, refuse } from './sentences'

const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n')
const lineStart = (text: string, offset: number): number => text.lastIndexOf('\n', offset - 1) + 1

/** The offset behind the line break of the line an offset stands in; the end of the text without one. */
function lineEnd(text: string, offset: number): number {
  const next = text.indexOf('\n', offset)
  return next === -1 ? text.length : next + 1
}

/** The lines that declare these Components, the key `components` included. */
export function renderComponents(components: readonly DeclaredComponent[], eol = '\n'): string {
  return `components:${eol}${renderChildren(components, eol)}`
}

function renderChildren(components: readonly DeclaredComponent[], eol: string): string {
  const lines: string[] = []
  const render = (list: readonly DeclaredComponent[], indent: string): void => {
    for (const component of list) {
      const segment = component.id.slice(component.id.lastIndexOf('/') + 1)
      lines.push(`${indent}${scalar(segment)}:`)
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
 * Put the Components into a declaration that is there but declares none: under a `components`
 * key that is empty, or at the end of the file. Nothing else in the file moves — not the
 * comment behind an empty key either.
 */
export function insertComponents(
  text: string,
  components: readonly DeclaredComponent[]
): TextEdit[] {
  // The file may have moved on since the Draft was shown. What a person declared stays.
  const current = readDeclaration(text)
  if (current.kind === 'declared') {
    refuse({ code: 'declared-by-now', values: { path: DECLARATION_PATH } })
  }
  if (current.kind === 'unreadable') {
    refuse({
      code: 'unreadable-declaration',
      values: { path: DECLARATION_PATH, detail: current.said }
    })
  }

  const eol = eolOf(text)
  const doc = parseDocument(text, { uniqueKeys: false })
  const existing = isMap(doc.contents) ? findPair(doc.contents, 'components') : undefined
  const edits: TextEdit[] = []
  if (existing) {
    // The key stays where it is, with whatever stands behind it on its line. An empty map
    // `{}` goes; the Components follow on the lines below.
    const value = existing.value
    if (isMap(value)) {
      // With the blanks in front of it, so that no blank is left dangling behind the colon.
      let start = rangeOf(value)[0]
      while (text[start - 1] === ' ' || text[start - 1] === '\t') start--
      edits.push({ start, end: rangeOf(value)[1], insert: '' })
    }
    const keyEnd = rangeOf(existing.key)[1]
    const below = lineEnd(text, keyEnd)
    const lead = below === text.length && !text.endsWith('\n') ? eol : ''
    edits.push({ start: below, end: below, insert: lead + renderChildren(components, eol) })
  } else {
    const lead = text === '' || text.endsWith('\n') ? '' : eol
    edits.push({
      start: text.length,
      end: text.length,
      insert: lead + renderComponents(components, eol)
    })
  }

  const result = readDeclaration(applyEdits(text, edits))
  const same =
    result.kind === 'declared' &&
    result.problems.length === 0 &&
    JSON.stringify(result.components) === JSON.stringify(components)
  if (!same) {
    refuse({ code: 'cannot-add-components', values: { path: DECLARATION_PATH } })
  }
  return edits
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
    refuse({ code: 'no-pattern-list', values: { component, key } })
  }

  const items = list.items
  const leaves = (item: unknown): boolean => isScalar(item) && textOf(item) === pattern
  if (!items.some(leaves)) {
    refuse({ code: 'pattern-gone', values: { pattern, key, component } })
  }
  const edits = items.every(leaves)
    ? wholeKey(text, pair, list)
    : list.flow
      ? fromFlowList(text, list, leaves)
      : fromBlockList(text, list, leaves)

  // What is left must still be a declaration a person would recognise as theirs.
  if (readDeclaration(applyEdits(text, edits)).kind === 'unreadable') throw byHand()
  return edits
}

/**
 * Give the Component `id` the segment `segment`: its key is rewritten where it stands, with
 * its quoting. The Components below it follow by themselves; nothing else in the file changes.
 */
export function renameSegment(text: string, id: string, segment: string): TextEdit[] {
  const doc = parseDocument(text, { uniqueKeys: false })
  let map: YAMLMap | undefined = isMap(doc.contents) ? doc.contents : undefined
  let pair: Pair | undefined
  for (const part of id.split('/')) {
    const components = map && findPair(map, 'components')?.value
    pair = isMap(components) ? findPair(components, part) : undefined
    map = isMap(pair?.value) ? (pair.value as YAMLMap) : undefined
  }
  const key = pair?.key
  const cannot = refusal({ code: 'cannot-rename-in', values: { path: DECLARATION_PATH, id } })
  if (!isScalar(key) || !key.range) throw cannot
  const quoted =
    key.type === 'QUOTE_DOUBLE'
      ? JSON.stringify(segment)
      : key.type === 'QUOTE_SINGLE'
        ? `'${segment}'`
        : scalar(segment)
  const edits = [{ start: key.range[0], end: key.range[1], insert: quoted }]

  // What is handed out reads back as the same Components, under the new IDs.
  const parent = id.includes('/') ? id.slice(0, id.lastIndexOf('/') + 1) : ''
  const to = parent + segment
  const before = readDeclaration(text)
  const after = readDeclaration(applyEdits(text, edits))
  const same =
    before.kind === 'declared' &&
    after.kind === 'declared' &&
    JSON.stringify(comparable(before.components, id, to)) ===
      JSON.stringify(comparable(after.components, to, to))
  if (!same) throw cannot
  return edits
}

/**
 * The Components as a Rename must leave them: every ID that is `from` or below it under `to`.
 * The renamed Component's name is left out — without a `name` it is its segment.
 */
function comparable(components: readonly DeclaredComponent[], from: string, to: string): unknown {
  return components.map((component) => {
    const id =
      component.id === from || component.id.startsWith(`${from}/`)
        ? to + component.id.slice(from.length)
        : component.id
    return {
      ...component,
      id,
      name: id === to ? undefined : component.name,
      children: comparable(component.children, from, to)
    }
  })
}

const byHand = (): Refusal => refusal({ code: 'pattern-by-hand', values: {} })

/** The key leaves with its list — when it has its lines to itself, as in a block map. */
function wholeKey(text: string, pair: Pair, list: YAMLSeq): TextEdit[] {
  const keyStart = rangeOf(pair.key)[0]
  const start = lineStart(text, keyStart)
  const valueEnd = rangeOf(list)[1]
  // Through the end of the line the list ends on; what stands there may only be a comment.
  // A block list ends behind the line break of its last item already.
  const end = text[valueEnd - 1] === '\n' ? valueEnd : lineEnd(text, valueEnd)
  const behind = text.slice(valueEnd, end)
  const alone =
    text.slice(start, keyStart).trim() === '' && /^[ \t]*(?:#[^\n]*)?\r?\n?$/.test(behind)
  if (!alone) throw byHand()
  return [{ start, end, insert: '' }]
}

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
 * the list, the one in front. Anything else between two items — a comment, a tag, an anchor —
 * is nothing the suite could assign to either of them.
 */
function fromFlowList(text: string, list: YAMLSeq, leaves: (item: unknown) => boolean): TextEdit[] {
  const items = list.items
  const separator = (left: number, right: number): void => {
    const between = text.slice(rangeOf(items[left])[1], rangeOf(items[right])[0])
    if (!/^\s*,\s*$/.test(between)) throw byHand()
  }
  // Nothing but blanks may stand between the bracket and the first item either.
  const opening = text.slice(rangeOf(list)[0] + 1, rangeOf(items[0])[0])
  if (opening.trim() !== '') throw byHand()
  for (let left = 0; left < items.length - 1; left++) separator(left, left + 1)

  const lastStaying = items.findLastIndex((item) => !leaves(item))
  const edits: TextEdit[] = []
  items.forEach((item, position) => {
    if (!leaves(item) || position > lastStaying) return
    edits.push({ start: rangeOf(item)[0], end: rangeOf(items[position + 1])[0], insert: '' })
  })
  if (lastStaying < items.length - 1) {
    edits.push({ start: rangeOf(items[lastStaying])[1], end: rangeOf(items.at(-1))[1], insert: '' })
  }
  return edits
}

const findPair = (map: YAMLMap, key: string): Pair | undefined =>
  map.items.find((pair) => isScalar(pair.key) && textOf(pair.key) === key)

/** A scalar as the text it was written as: `007` is not 7. */
const textOf = (node: Scalar): string =>
  typeof node.value === 'string' ? node.value : (node.source ?? String(node.value))

function rangeOf(node: unknown): [number, number, number] {
  const range = (node as { range?: [number, number, number] | null } | null)?.range
  if (!range) throw byHand()
  return range
}
