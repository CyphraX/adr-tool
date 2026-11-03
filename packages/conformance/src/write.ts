/**
 * What the suite writes into `.arch/rules.yml` (docs/conformance-format.md, sections 1, 4, 5
 * and 7): a Rule added, changed or removed, an Exception added, taken out or narrowed. As
 * everywhere (ADR-0002) it splices: the YAML is parsed to find where an item stands, and the
 * text is edited there, so that comments, quoting, foreign keys, blank lines and line endings
 * stay what a person made them.
 *
 * YAML can be written in more ways than a splice can serve. So every edit is checked before it
 * is handed out: the text it leads to must read back as the file it was, with the change asked
 * for and nothing else. Where it would not — the file in braces, an anchor, a comment that
 * would be lost — the suite refuses with a sentence and leaves the change to an editor.
 */
import {
  isAlias,
  isCollection,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  visit,
  type Document,
  type Pair,
  type YAMLMap
} from 'yaml'
import { applyEdits, plan, type FileSystem, type Plan, type TextEdit } from '@adr-tool/kernel'
import { hasWildcard, matcherOf } from './component-patterns'
import { FINGERPRINT_KEYS, fingerprintOf, justification, type Decisions } from './check'
import { fingerprintKey, fingerprintText, membersOf, type Fingerprint } from './fingerprint'
import { RULES_PATH, saidOf, type ConformanceNote, type ConformanceProblem } from './problems'
import { readRules, scalarText, type Rule } from './rules'
import { englishOf, refusal, type Change, type ConformanceSaid } from './sentences'

/** A Rule as a form or an agent describes it, before it is written: a Rule without its place. */
export type RuleDraft = Rule extends infer R
  ? R extends Rule
    ? Omit<R, 'line' | 'names' | 'tests' | 'ignoreTypeOnly'> & {
        /** `tests: included`. */
        readonly tests?: boolean
        /** `type-only: ignored`. Not for a threshold. */
        readonly ignoreTypeOnly?: boolean
      }
    : never
  : never

/** An Exception as it is asked for: the Violation it accepts, why, and the ADR behind it. */
export interface ExceptionDraft {
  readonly fingerprint: Fingerprint
  readonly reason: string
  /** The ADR that justifies it, as the repository names it from outside a Decision Log. */
  readonly justifiedBy?: string
}

/**
 * A Repair of a Problem or a note of `.arch/rules.yml` (docs/conformance-format.md, section 5),
 * where the suite knows what was meant: an Exception that matches no Violation, or that a first
 * one makes count for nothing, is taken out; one of a Cycle that shrank is narrowed to what it
 * accepts now. The Exception is named by its line and its fingerprint, both as they were found:
 * where the file moved on, the Repair says so instead of taking out another one.
 */
export type ConformanceRepair =
  | {
      readonly kind: 'remove-exception'
      readonly line: number
      readonly fingerprint: Fingerprint
    }
  | {
      readonly kind: 'narrow-exception'
      readonly line: number
      readonly fingerprint: Fingerprint
      readonly members: readonly string[]
    }

/** The Repair of a Problem or a note; `undefined` where the suite cannot know what was meant. */
export function repairOf(
  found: ConformanceProblem | ConformanceNote
): ConformanceRepair | undefined {
  switch (found.kind) {
    case 'unmatched-exception':
    case 'duplicate-exception':
      return { kind: 'remove-exception', line: found.line, fingerprint: found.fingerprint }
    case 'exception-can-shrink':
      return {
        kind: 'narrow-exception',
        line: found.line,
        fingerprint: found.fingerprint,
        members: found.members
      }
    default:
      return undefined
  }
}

/** A value of a key as the suite writes it: a text, a number, or a list of them. */
type Value = string | number | readonly Value[]

/** Every key of a Rule the suite knows; any other key is foreign, and stays as it is. */
const RULE_KEYS = new Set([
  'id',
  'why',
  'kind',
  'from',
  'to',
  'layers',
  'mode',
  'among',
  'inside',
  'metric',
  'max',
  'min',
  'of',
  'tests',
  'type-only'
])

/** What a key means when it is left out: written as such, it is left as it is. */
const DEFAULTS: Readonly<Record<string, string>> = {
  mode: 'relaxed',
  tests: 'excluded',
  'type-only': 'counted'
}

/** The keys of a Rule in the order the suite writes them; what is left out is not written. */
function ruleKeys(draft: RuleDraft): [string, Value][] {
  const one = (patterns: readonly string[]): Value =>
    patterns.length === 1 ? patterns[0]! : patterns
  const keys: [string, Value][] = [
    ['id', draft.id],
    ['why', draft.why.trim()],
    ['kind', draft.kind]
  ]
  switch (draft.kind) {
    case 'must-not-depend':
    case 'may-only-depend':
      keys.push(['from', one(draft.from)], ['to', draft.to])
      break
    case 'layers':
      keys.push(['layers', draft.layers.map(one)])
      if (draft.mode === 'strict') keys.push(['mode', 'strict'])
      break
    case 'no-cycles':
      keys.push([draft.scope, one(draft.components)])
      break
    case 'threshold':
      keys.push(['metric', draft.metric])
      if (draft.max !== undefined) keys.push(['max', draft.max])
      if (draft.min !== undefined) keys.push(['min', draft.min])
      keys.push(['of', one(draft.of)])
      break
  }
  if (draft.tests) keys.push(['tests', 'included'])
  if (draft.ignoreTypeOnly && draft.kind !== 'threshold') keys.push(['type-only', 'ignored'])
  return keys
}

/** Whether a key with its default value says something about a Rule of this kind. */
const meaningful = (key: string, draft: RuleDraft): boolean =>
  key === 'tests' ||
  (key === 'mode' && draft.kind === 'layers') ||
  (key === 'type-only' && draft.kind !== 'threshold')

/** The keys of an Exception in the order the suite writes them. */
function exceptionKeys(draft: ExceptionDraft): [string, Value][] {
  const { fingerprint } = draft
  const keys: [string, Value][] = [['rule', fingerprint.rule]]
  switch (fingerprint.kind) {
    case 'dependency':
      keys.push(['from', fingerprint.from], ['to', fingerprint.to])
      break
    case 'cycle':
      keys.push(['cycle', membersOf(fingerprint.cycle)])
      break
    case 'component':
      keys.push(['component', fingerprint.component])
      break
  }
  keys.push(['reason', draft.reason.trim()])
  if (draft.justifiedBy !== undefined && draft.justifiedBy.trim() !== '') {
    keys.push(['justified-by', draft.justifiedBy.trim()])
  }
  return keys
}

// Writing values.

/** A text as YAML reads it back: plain where it can be, in quotes where it must be. */
function scalar(value: string, inFlow: boolean): string {
  const readsBack = (written: string): boolean => {
    const doc = parseDocument(inFlow ? `k: [${written}]` : `k: ${written}`)
    if (doc.errors.length > 0 || doc.warnings.length > 0) return false
    const node = doc.get('k', true)
    const item = inFlow
      ? isSeq(node) && node.items.length === 1
        ? node.items[0]
        : undefined
      : node
    return isScalar(item) && typeof item.value === 'string' && item.value === value
  }
  // A control character is written as an escape, in double quotes.
  // eslint-disable-next-line no-control-regex
  if (value !== '' && !/[\0-\x1f]/.test(value) && readsBack(value)) return value
  // A pattern that begins with `*` would be an alias; it is quoted as the format shows it.
  const single = `'${value.replaceAll("'", "''")}'`
  if (value.startsWith('*') && readsBack(single)) return single
  return JSON.stringify(value)
}

/** A value on the line of its key. */
function inline(value: Value, inFlow = false): string {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return scalar(value, inFlow)
  return `[${value.map((item) => inline(item, true)).join(', ')}]`
}

/** A list in block style, from its first dash on; each further item at `indent`. */
const blockList = (items: readonly Value[], indent: string, eol: string): string =>
  items.map((item) => `- ${inline(item)}`).join(`${eol}${indent}`)

/** One item of a list in block style: its dash at column `dash`, its keys at column `key`. */
function renderItem(
  keys: readonly [string, Value][],
  dash: number,
  key: number,
  eol: string
): string {
  return keys
    .map(
      ([name, value], position) =>
        `${position === 0 ? `${' '.repeat(dash)}-${' '.repeat(key - dash - 1)}` : ' '.repeat(key)}${name}: ${inline(value)}${eol}`
    )
    .join('')
}

/** A new `.arch/rules.yml` with one Rule. */
export const renderRule = (draft: RuleDraft, eol = '\n'): string =>
  `rules:${eol}${renderItem(ruleKeys(draft), 2, 4, eol)}`

/** What an item reads as, by itself. */
function itemValue(keys: readonly [string, Value][]): unknown {
  return (parseDocument(renderItem(keys, 0, 2, '\n')).toJS() as unknown[])[0]
}

/** What a value reads as. */
const valueOf = (value: Value): unknown => parseDocument(`k: ${inline(value)}`).toJS().k

// Finding where things stand.

const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n')
const lineStart = (text: string, offset: number): number => text.lastIndexOf('\n', offset - 1) + 1
const column = (text: string, offset: number): number => offset - lineStart(text, offset)
/** The line an offset stands on, from 1. */
const lineAt = (text: string, offset: number): number => text.slice(0, offset).split('\n').length

/** The offset behind the line break of the line an offset stands in; the end of the text without one. */
function lineEnd(text: string, offset: number): number {
  const next = text.indexOf('\n', offset)
  return next === -1 ? text.length : next + 1
}

/** Where a node ends, up to the end of its line: behind its line break where it has one. */
function endOfLine(text: string, offset: number): number {
  return text[offset - 1] === '\n' ? offset : lineEnd(text, offset)
}

type Range = [number, number, number]

/** Whether a stretch of YAML holds a comment: a `#` after a blank or at a line's start, outside quotes. */
function hasComment(text: string): boolean {
  let quote: string | undefined
  for (let at = 0; at < text.length; at++) {
    const char = text[at]!
    if (quote === "'") {
      if (char === "'" && text[at + 1] === "'") at++
      else if (char === "'") quote = undefined
    } else if (quote === '"') {
      if (char === '\\') at++
      else if (char === '"') quote = undefined
    } else if (char === "'" || char === '"') {
      quote = char
    } else if (char === '#' && (at === 0 || /\s/.test(text[at - 1]!))) {
      return true
    }
  }
  return false
}

/** Whether a node, or anything in it, has an anchor or is an alias. */
function hasAnchor(node: unknown): boolean {
  let found = false
  visit(node as Parameters<typeof visit>[0], (_key, inner) => {
    if (isAlias(inner) || ((isScalar(inner) || isCollection(inner)) && inner.anchor)) {
      found = true
      return visit.BREAK
    }
    return undefined
  })
  return found
}

/** What a document reads as, to compare: numbers and booleans as the text the Rules read them as. */
const readsAs = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    typeof inner === 'number' || typeof inner === 'boolean' ? String(inner) : inner
  )

const findPair = (map: YAMLMap, key: string): Pair | undefined =>
  map.items.find((pair) => scalarText(pair.key) === key)

/** Refuse a change that cannot be written without rewriting more than was asked. */
function cannot(change: Change, why: ConformanceSaid): never {
  throw refusal({ code: 'cannot-write-rules', values: { path: RULES_PATH, change, why } })
}

const refuse = (said: ConformanceSaid): never => {
  throw refusal(said)
}

function rangeOf(node: unknown, change: Change): Range {
  const range = (node as { range?: Range | null } | null)?.range
  if (!range) cannot(change, { code: 'reads-otherwise', values: {} })
  return range
}

interface Parsed {
  readonly doc: Document.Parsed
  /** The top-level map; `undefined` in a file with nothing in it. */
  readonly top: YAMLMap | undefined
}

/** The file as the suite writes into it: readable, its top a map in block style. */
function parsed(text: string, change: Change): Parsed {
  const doc = parseDocument(text, { uniqueKeys: false })
  if (
    doc.errors.length > 0 ||
    readRules(text).problems.some((one) => one.kind === 'unreadable-rules')
  ) {
    refuse({ code: 'write-unreadable-rules', values: { path: RULES_PATH } })
  }
  const top = isMap(doc.contents) ? doc.contents : undefined
  if (top?.flow) cannot(change, { code: 'top-in-braces', values: {} })
  return { doc, top }
}

/** The items of a list at the top, in block style; empty where there is none. */
function itemsOf(top: YAMLMap | undefined, key: string, change: Change): readonly unknown[] {
  const value = top && findPair(top, key)?.value
  if (!isSeq(value) || value.items.length === 0) return []
  if (value.flow) cannot(change, { code: 'list-in-brackets', values: { key } })
  return value.items
}

/** Where an item of a list in block style begins: its dash. */
function dashOf(text: string, item: unknown, change: Change): number {
  const start = rangeOf(item, change)[0]
  const dash = text.lastIndexOf('-', start - 1)
  if (dash === -1 || text.slice(lineStart(text, dash), dash).trim() !== '') {
    cannot(change, { code: 'reads-otherwise', values: {} })
  }
  return dash
}

/** Where an item ends: behind the line break of its last line. */
const itemEnd = (text: string, item: unknown, change: Change): number =>
  endOfLine(text, rangeOf(item, change)[1])

/** What the file reads as, as a plain value to change the way the edits change the text. */
function expectedOf(doc: Document.Parsed): Record<string, unknown> {
  const value = doc.toJS() as unknown
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

/** The edits, once the text they lead to reads back as expected. */
function checked(text: string, edits: TextEdit[], expected: unknown, change: Change): TextEdit[] {
  const after = parseDocument(applyEdits(text, edits), { uniqueKeys: false })
  if (after.errors.length > 0 || readsAs(after.toJS()) !== readsAs(expected)) {
    cannot(change, { code: 'reads-otherwise', values: {} })
  }
  return edits
}

// Adding an item.

/** Append an item to the end of a list at the top, in block style; start the list where there is none. */
function appendItem(
  text: string,
  { doc, top }: Parsed,
  key: 'rules' | 'exceptions',
  keys: readonly [string, Value][],
  change: Change
): TextEdit[] {
  const eol = eolOf(text)
  const expected = expectedOf(doc)
  const list = Array.isArray(expected[key]) ? (expected[key] as unknown[]) : []
  expected[key] = [...list, itemValue(keys)]

  const pair = top && findPair(top, key)
  if (!pair) {
    const lead = text === '' || text.endsWith('\n') ? '' : eol
    const insert = `${lead}${key}:${eol}${renderItem(keys, 2, 4, eol)}`
    return checked(text, [{ start: text.length, end: text.length, insert }], expected, change)
  }

  const items = itemsOf(top, key, change)
  if (items.length > 0) {
    const first = items[0]
    const last = items.at(-1)
    const dash = column(text, dashOf(text, first, change))
    const keyColumn = column(text, rangeOf(first, change)[0])
    if (keyColumn <= dash) cannot(change, { code: 'reads-otherwise', values: {} })
    // Items with a blank line between them get one before the new item as well.
    const spaced =
      items.length > 1 &&
      text
        .slice(itemEnd(text, items.at(-2), change), lineStart(text, dashOf(text, last, change)))
        .trim() === '' &&
      itemEnd(text, items.at(-2), change) < lineStart(text, dashOf(text, last, change))
    const end = itemEnd(text, last, change)
    const lead = (end === text.length && !text.endsWith('\n') ? eol : '') + (spaced ? eol : '')
    const insert = lead + renderItem(keys, dash, keyColumn, eol)
    return checked(text, [{ start: end, end, insert }], expected, change)
  }

  // A list that is empty: `rules:`, `rules: []`, `rules: ~`. The key stays where it is, with
  // what stands behind it on its line; the items follow on the lines below.
  const edits: TextEdit[] = []
  const value = pair.value
  if (value !== null && (isScalar(value) || (isCollection(value) && value.flow))) {
    const [from, to] = rangeOf(value, change)
    let start = from
    while (text[start - 1] === ' ' || text[start - 1] === '\t') start--
    edits.push({ start, end: to, insert: '' })
  } else if (value !== null) {
    cannot(change, { code: 'reads-otherwise', values: {} })
  }
  const below = lineEnd(text, rangeOf(pair.key, change)[1])
  const lead = below === text.length && !text.endsWith('\n') ? eol : ''
  edits.push({ start: below, end: below, insert: lead + renderItem(keys, 2, 4, eol) })
  return checked(text, edits, expected, change)
}

// Taking an item out.

/**
 * The lines of an item: from the comment lines right above its dash, at its indentation, to the
 * end of its last line. Where the items are spaced by blank lines, one gap goes with it, so that
 * the list keeps its spacing.
 */
function itemLines(
  text: string,
  items: readonly unknown[],
  index: number,
  change: Change
): [number, number] {
  const item = items[index]
  const dash = dashOf(text, item, change)
  let start = lineStart(text, dash)
  while (start > 0) {
    const above = lineStart(text, start - 1)
    const line = text.slice(above, start)
    const indent = line.length - line.trimStart().length
    if (!/^[ \t]*#/.test(line) || indent > column(text, dash)) break
    start = above
  }
  const end = itemEnd(text, item, change)
  if (items.length === 1) return [start, end]

  let after = end
  while (after < text.length) {
    const next = lineEnd(text, after)
    if (text.slice(after, next).trim() !== '') break
    after = next
  }
  let before = start
  while (before > 0) {
    const previous = lineStart(text, before - 1)
    if (text.slice(previous, before).trim() !== '') break
    before = previous
  }
  const last = index === items.length - 1
  if (after > end && (before < start || index === 0)) return [start, after]
  if (last && before < start && after === end) return [before, end]
  return [start, end]
}

function removeItem(
  text: string,
  { doc, top }: Parsed,
  key: 'rules' | 'exceptions',
  index: number,
  change: Change
): TextEdit[] {
  const items = itemsOf(top, key, change)
  const [start, end] = itemLines(text, items, index, change)
  const expected = expectedOf(doc)
  const list = [...(expected[key] as unknown[])]
  list.splice(index, 1)
  expected[key] = list.length === 0 ? null : list
  return checked(text, [{ start, end, insert: '' }], expected, change)
}

// Changing the keys of an item.

/** Put a new value where the old one stands: a list in block style stays one. */
function replaceValue(text: string, pair: Pair, want: Value, change: Change): TextEdit {
  const node = pair.value
  const eol = eolOf(text)
  if (hasAnchor(node)) cannot(change, { code: 'anchor-or-alias', values: {} })
  const keyEnd = rangeOf(pair.key, change)[1]
  const colon = text.indexOf(':', keyEnd)
  if (node === null || node === undefined) {
    return { start: colon + 1, end: colon + 1, insert: ` ${inline(want)}` }
  }
  if (isSeq(node) && !node.flow && node.items.length > 0) {
    const start = rangeOf(node, change)[0]
    const end = rangeOf(node.items.at(-1), change)[1]
    if (hasComment(text.slice(start, end))) cannot(change, { code: 'comment-lost', values: {} })
    if (Array.isArray(want) && want.length > 0) {
      return { start, end, insert: blockList(want, ' '.repeat(column(text, start)), eol) }
    }
    return { start: colon + 1, end, insert: ` ${inline(want)}` }
  }
  const [start, end] = rangeOf(node, change)
  if (hasComment(text.slice(start, end))) cannot(change, { code: 'comment-lost', values: {} })
  return { start, end, insert: inline(want) }
}

/** A key leaves with its lines: the comment behind it on its line goes too, any other is kept. */
function removePair(text: string, pair: Pair, change: Change): TextEdit {
  const keyStart = rangeOf(pair.key, change)[0]
  const start = lineStart(text, keyStart)
  if (text.slice(start, keyStart).trim() !== '')
    cannot(change, { code: 'reads-otherwise', values: {} })
  if ((pair.key as { commentBefore?: string }).commentBefore) {
    cannot(change, { code: 'comment-lost', values: {} })
  }
  const node = pair.value as { range?: Range | null } | null
  const end = endOfLine(text, node?.range ? node.range[2] : rangeOf(pair.key, change)[2])
  if (hasComment(text.slice(lineEnd(text, keyStart), end))) {
    cannot(change, { code: 'comment-lost', values: {} })
  }
  return { start, end, insert: '' }
}

/** The item a key names, among those of a list at the top. */
function indexOf(
  text: string,
  items: readonly unknown[],
  key: string,
  value: string
): number | undefined {
  const index = items.findIndex((item) => {
    const found = isMap(item) ? findPair(item, key)?.value : undefined
    return scalarText(found) === value
  })
  return index === -1 ? undefined : index
}

// Rules.

/** Refuse a Rule the reader would not read as it was meant. */
function validRule(draft: RuleDraft): void {
  const read = readRules(renderRule(draft))
  const problem = read.problems[0]
  if (problem) refuse(saidOf(problem))
}

/** Add a Rule at the end of the list of Rules (docs/conformance-format.md, section 1). */
export function addRuleEdits(text: string, draft: RuleDraft): TextEdit[] {
  const change = 'add-rule'
  const file = parsed(text, change)
  validRule(draft)
  if (indexOf(text, itemsOf(file.top, 'rules', change), 'id', draft.id) !== undefined) {
    refuse({ code: 'rule-exists', values: { path: RULES_PATH, id: draft.id } })
  }
  return appendItem(text, file, 'rules', ruleKeys(draft), change)
}

/**
 * Change the Rule `id` into what `draft` says: the value of a key that says something else is
 * replaced where it stands, a key the Rule no longer has goes with its line, a new key follows
 * the last one. Keys the suite does not know, and values that say the same already, stay as
 * they are. A new ID is the Rule's alone: its Exceptions follow with `renameRuleEdits`.
 */
export function changeRuleEdits(text: string, id: string, draft: RuleDraft): TextEdit[] {
  const change = 'change-rule'
  const file = parsed(text, change)
  validRule(draft)
  const items = itemsOf(file.top, 'rules', change)
  const index = indexOf(text, items, 'id', id)
  if (index === undefined) return refuse({ code: 'no-rule', values: { path: RULES_PATH, id } })
  if (draft.id !== id && indexOf(text, items, 'id', draft.id) !== undefined) {
    refuse({ code: 'rule-exists', values: { path: RULES_PATH, id: draft.id } })
  }
  const item = items[index]
  if (!isMap(item) || item.flow) return cannot(change, { code: 'item-in-braces', values: {} })
  if (hasAnchor(item)) cannot(change, { code: 'anchor-or-alias', values: {} })

  const expected = expectedOf(file.doc)
  const rules = [...(expected.rules as Record<string, unknown>[])]
  const object = { ...rules[index]! }
  rules[index] = object
  expected.rules = rules

  const wanted = new Map(ruleKeys(draft))
  const edits: TextEdit[] = []
  item.items.forEach((pair, position) => {
    const key = scalarText(pair.key)
    if (key === undefined || !RULE_KEYS.has(key)) return
    const want = wanted.get(key)
    wanted.delete(key)
    if (want === undefined) {
      // `mode: relaxed` says what is meant without it: it stays.
      if (DEFAULTS[key] === scalarText(pair.value) && meaningful(key, draft)) return
      if (position === 0) cannot(change, { code: 'reads-otherwise', values: {} })
      edits.push(removePair(text, pair, change))
      delete object[key]
      return
    }
    if (
      readsAs(pair.value === null ? null : (pair.value as { toJSON(): unknown }).toJSON()) ===
      readsAs(valueOf(want))
    ) {
      return
    }
    edits.push(replaceValue(text, pair, want, change))
    object[key] = valueOf(want)
  })
  if (wanted.size > 0) {
    const eol = eolOf(text)
    const end = itemEnd(text, item, change)
    const indent = ' '.repeat(column(text, rangeOf(item, change)[0]))
    const lead = end === text.length && !text.endsWith('\n') ? eol : ''
    const lines = [...wanted].map(([key, value]) => `${indent}${key}: ${inline(value)}${eol}`)
    edits.push({ start: end, end, insert: lead + lines.join('') })
    for (const [key, value] of wanted) object[key] = valueOf(value)
  }
  return edits.length === 0 ? [] : checked(text, edits, expected, change)
}

/** The Exceptions of the Rule `from` name it `to`: its new ID, where each one names it. */
export function renameRuleEdits(text: string, from: string, to: string): TextEdit[] {
  const change = 'change-exception'
  const file = parsed(text, change)
  const items = itemsOf(file.top, 'exceptions', change)
  const expected = expectedOf(file.doc)
  const exceptions = [...((expected.exceptions as Record<string, unknown>[] | null) ?? [])]
  expected.exceptions = exceptions
  const edits: TextEdit[] = []
  items.forEach((item, index) => {
    const pair = isMap(item) ? findPair(item, 'rule') : undefined
    if (!pair || scalarText(pair.value) !== from) return
    edits.push(replaceValue(text, pair, to, change))
    exceptions[index] = { ...exceptions[index], rule: to }
  })
  return edits.length === 0 ? [] : checked(text, edits, expected, change)
}

/** Take the Rule `id` out of the list, with its lines. Its Exceptions follow one by one. */
export function removeRuleEdits(text: string, id: string): TextEdit[] {
  const change = 'remove-rule'
  const file = parsed(text, change)
  const index = indexOf(text, itemsOf(file.top, 'rules', change), 'id', id)
  if (index === undefined) return refuse({ code: 'no-rule', values: { path: RULES_PATH, id } })
  return removeItem(text, file, 'rules', index, change)
}

/** The first Exception that names the Rule `id`, by its place in the list. */
function exceptionOfRule(text: string, id: string): number | undefined {
  const file = parsed(text, 'remove-exception')
  return indexOf(text, itemsOf(file.top, 'exceptions', 'remove-exception'), 'rule', id)
}

// Exceptions.

/** Add an Exception at the end of the list of Exceptions (docs/conformance-format.md, section 4). */
export function addExceptionEdits(
  text: string,
  draft: ExceptionDraft,
  decisions?: Decisions
): TextEdit[] {
  const change = 'add-exception'
  const file = parsed(text, change)
  const read = readRules(text)
  const { fingerprint } = draft
  const rule = read.rules.find((candidate) => candidate.id === fingerprint.rule)
  if (!rule) return refuse({ code: 'no-rule', values: { path: RULES_PATH, id: fingerprint.rule } })
  const keys = exceptionKeys(draft)

  // What the reader reads it as: its keys, and a fingerprint that fits its Rule.
  const alone = readRules(`exceptions:\n${renderItem(keys, 2, 4, '\n')}`)
  if (alone.problems[0]) refuse(saidOf(alone.problems[0]))
  const written = fingerprintOf(alone.exceptions[0]!, rule)
  if (written === undefined || written.kind !== fingerprint.kind) {
    refuse({
      code: 'invalid-exception',
      values: {
        rule: rule.id,
        detail: {
          code: 'fingerprint-of-kind',
          values: { kind: rule.kind, keys: FINGERPRINT_KEYS[rule.kind] }
        }
      }
    })
  }
  const key = fingerprintKey(fingerprint)
  const taken = read.exceptions.some((exception) => {
    const named = exception.rule === rule.id ? fingerprintOf(exception, rule) : undefined
    return named !== undefined && fingerprintKey(named) === key
  })
  if (taken)
    refuse({ code: 'exception-exists', values: { fingerprint: fingerprintText(fingerprint) } })
  const adr = draft.justifiedBy?.trim()
  if (adr && decisions !== undefined) {
    const found = justification(adr, decisions)
    if (found !== 'exists') {
      refuse({
        code: found === 'url' ? 'invalid-justification' : 'unknown-justification',
        values: { fingerprint: fingerprintText(fingerprint), adr }
      })
    }
  }
  return appendItem(text, file, 'exceptions', keys, change)
}

/** The Exception a Repair names, by its place in the list: at its line, with its fingerprint. */
function exceptionAt(
  text: string,
  file: Parsed,
  { line, fingerprint }: { line: number; fingerprint: Fingerprint },
  change: Change
): number {
  const items = itemsOf(file.top, 'exceptions', change)
  const read = readRules(text)
  const rule = read.rules.find((candidate) => candidate.id === fingerprint.rule)
  const index = items.findIndex((item) => lineAt(text, rangeOf(item, change)[0]) === line)
  const written = read.exceptions.find((exception) => exception.line === line)
  const named = rule && written ? fingerprintOf(written, rule) : undefined
  // A duplicate's fingerprint is that of its Rule as written, whatever the reader made of it.
  const same =
    named !== undefined
      ? fingerprintKey(named) === fingerprintKey(fingerprint)
      : written !== undefined &&
        written.rule === fingerprint.rule &&
        fingerprintKey(writtenFingerprint(written, fingerprint)) === fingerprintKey(fingerprint)
  if (index === -1 || !same) {
    refuse({
      code: 'no-exception',
      values: { path: RULES_PATH, fingerprint: fingerprintText(fingerprint), line }
    })
  }
  return index
}

/** What an Exception names, read by the keys of a fingerprint of that kind. */
function writtenFingerprint(
  written: {
    rule: string
    from?: string
    to?: string
    cycle?: readonly string[]
    component?: string
  },
  like: Fingerprint
): Fingerprint {
  switch (like.kind) {
    case 'dependency':
      return { kind: like.kind, rule: written.rule, from: written.from ?? '', to: written.to ?? '' }
    case 'cycle':
      return { kind: like.kind, rule: written.rule, cycle: written.cycle ?? [] }
    case 'component':
      return { kind: like.kind, rule: written.rule, component: written.component ?? '' }
  }
}

/** Take an Exception out, with its lines: the Repair of one that matches nothing, or that is there twice. */
export function removeExceptionEdits(
  text: string,
  at: { line: number; fingerprint: Fingerprint }
): TextEdit[] {
  const change = 'remove-exception'
  const file = parsed(text, change)
  return removeItem(text, file, 'exceptions', exceptionAt(text, file, at, change), change)
}

/** Narrow an Exception of a Cycle to the members of the Cycles it accepts now. */
export function narrowExceptionEdits(
  text: string,
  at: { line: number; fingerprint: Fingerprint; members: readonly string[] }
): TextEdit[] {
  const change = 'change-exception'
  const file = parsed(text, change)
  const index = exceptionAt(text, file, at, change)
  const item = itemsOf(file.top, 'exceptions', change)[index]
  const pair = isMap(item) ? findPair(item, 'cycle') : undefined
  if (!pair) return cannot(change, { code: 'reads-otherwise', values: {} })
  const members = membersOf(at.members)
  const expected = expectedOf(file.doc)
  const exceptions = [...(expected.exceptions as Record<string, unknown>[])]
  exceptions[index] = { ...exceptions[index], cycle: valueOf(members) }
  expected.exceptions = exceptions
  return checked(text, [replaceValue(text, pair, members, change)], expected, change)
}

// Plans: what the window and the server ask for. Each returns a change set and writes nothing.

const asText = (text: string): string => text

/**
 * What a Rule names that the declaration does not have, as warnings: the Rule is written all
 * the same, and its Problem is reported until the Component is there.
 */
function namingWarnings(
  draft: RuleDraft,
  declared: readonly string[] | undefined
): { warnings?: string[]; warned?: ConformanceSaid[] } {
  if (declared === undefined) return {}
  const rule = readRules(renderRule(draft)).rules[0]
  const known = new Set(declared)
  const warned: ConformanceSaid[] = []
  for (const { pattern, key } of rule?.names ?? []) {
    const by = 'rule' as const
    if (!hasWildcard(pattern) && !known.has(pattern)) {
      warned.push(
        saidOf({ kind: 'unknown-component', by, owner: draft.id, key, component: pattern, line: 0 })
      )
    } else if (hasWildcard(pattern) && !declared.some(matcherOf([pattern]))) {
      warned.push(
        saidOf({ kind: 'no-component-matches', by, owner: draft.id, key, pattern, line: 0 })
      )
    }
  }
  return warned.length === 0 ? {} : { warnings: warned.map(englishOf), warned }
}

/**
 * Plan a new Rule in `.arch/rules.yml`, the file created where there is none. `declared`, the
 * IDs of the declared Components, turns a name the declaration does not have into a warning.
 */
export async function planAddRule(
  fs: FileSystem,
  draft: RuleDraft,
  declared?: readonly string[]
): Promise<Plan> {
  const planned = await plan(fs, asText, async (pending) => {
    if ((await fs.readText(RULES_PATH)) === undefined) {
      await pending.create(RULES_PATH, applyEdits('', addRuleEdits('', draft)))
    } else {
      await pending.write(RULES_PATH, (text) => addRuleEdits(text, draft))
    }
  })
  return planned.ok ? { ...planned, ...namingWarnings(draft, declared) } : planned
}

/** Plan a change of the Rule `id`: its keys, and its ID in its Exceptions where that changes. */
export async function planChangeRule(
  fs: FileSystem,
  id: string,
  draft: RuleDraft,
  declared?: readonly string[]
): Promise<Plan> {
  const planned = await plan(fs, asText, async (pending) => {
    const before = await fs.readText(RULES_PATH)
    if (before === undefined) refuse({ code: 'no-rule', values: { path: RULES_PATH, id } })
    await pending.write(RULES_PATH, (text) => changeRuleEdits(text, id, draft))
    if (draft.id !== id) {
      await pending.write(RULES_PATH, (text) => renameRuleEdits(text, id, draft.id))
    }
    if ((await pending.read(RULES_PATH)) === before) {
      refuse({ code: 'rule-unchanged', values: { id } })
    }
  })
  return planned.ok ? { ...planned, ...namingWarnings(draft, declared) } : planned
}

/** Plan taking the Rule `id` out of `.arch/rules.yml`, its Exceptions with it (ADR-0017). */
export function planRemoveRule(fs: FileSystem, id: string): Promise<Plan> {
  return plan(fs, asText, async (pending) => {
    if ((await fs.readText(RULES_PATH)) === undefined) {
      refuse({ code: 'no-rule', values: { path: RULES_PATH, id } })
    }
    await pending.write(RULES_PATH, (text) => removeRuleEdits(text, id))
    for (;;) {
      const index = exceptionOfRule(await pending.read(RULES_PATH), id)
      if (index === undefined) break
      await pending.write(RULES_PATH, (text) =>
        removeItem(text, parsed(text, 'remove-exception'), 'exceptions', index, 'remove-exception')
      )
    }
  })
}

/**
 * Plan an Exception for a Violation. `decisions`, the ADRs of the repository, refuses an ADR in
 * `justifiedBy` that is not there.
 */
export function planAddException(
  fs: FileSystem,
  draft: ExceptionDraft,
  decisions?: Decisions
): Promise<Plan> {
  return plan(fs, asText, async (pending) => {
    if ((await fs.readText(RULES_PATH)) === undefined) {
      refuse({ code: 'no-rule', values: { path: RULES_PATH, id: draft.fingerprint.rule } })
    }
    await pending.write(RULES_PATH, (text) => addExceptionEdits(text, draft, decisions))
  })
}

/** Plan a Repair of a Problem or a note of `.arch/rules.yml` (`repairOf`). */
export function planConformanceRepair(fs: FileSystem, repair: ConformanceRepair): Promise<Plan> {
  return plan(fs, asText, async (pending) => {
    if ((await fs.readText(RULES_PATH)) === undefined) {
      refuse({
        code: 'no-exception',
        values: {
          path: RULES_PATH,
          fingerprint: fingerprintText(repair.fingerprint),
          line: repair.line
        }
      })
    }
    await pending.write(RULES_PATH, (text) =>
      repair.kind === 'remove-exception'
        ? removeExceptionEdits(text, repair)
        : narrowExceptionEdits(text, repair)
    )
  })
}
