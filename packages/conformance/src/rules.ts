/**
 * Reading `.arch/rules.yml` (docs/conformance-format.md, sections 1, 2, 4 and 6): its Rules,
 * Exceptions and applied Patterns, and what is wrong with their form. Read tolerantly: keys the
 * suite does not know are ignored, a single value stands for a list of one, and a Rule that
 * cannot be read takes nothing else down with it.
 */
import {
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
  type ParsedNode,
  type YAMLMap
} from 'yaml'
import { RULE_KIND_NAMES, type ConformanceProblem } from './problems'
import type { ConformanceSaid } from './sentences'

export type RuleKind = (typeof RULE_KIND_NAMES)[number]

/** The metrics of Structure a threshold can be on (docs/conformance-format.md, section 2). */
export const METRICS = [
  'files',
  'lines',
  'efferent-coupling',
  'afferent-coupling',
  'instability',
  'fan-out',
  'fan-in',
  'relational-cohesion',
  'internal-share'
] as const
export type MetricName = (typeof METRICS)[number]

/** Where a Rule or an applied Pattern names Components: the pattern as written, its key, its line. */
export interface Naming {
  readonly pattern: string
  readonly key: string
  readonly line: number
}

interface CommonRule {
  readonly id: string
  readonly why: string
  /** The line of the Rule's first key, from 1. */
  readonly line: number
  /** `tests: included`: test files count. */
  readonly tests: boolean
  /** `type-only: ignored`: type-only Dependencies do not count. */
  readonly ignoreTypeOnly: boolean
  /** Every Component pattern the Rule names, where it names it. */
  readonly names: readonly Naming[]
}

export type DependencyRule = CommonRule & {
  readonly kind: 'must-not-depend' | 'may-only-depend'
  readonly from: readonly string[]
  readonly to: readonly string[]
}
export type LayersRule = CommonRule & {
  readonly kind: 'layers'
  /** The top layer first; each layer a list of Component patterns. */
  readonly layers: readonly (readonly string[])[]
  readonly mode: 'relaxed' | 'strict'
}
export type CyclesRule = CommonRule & {
  readonly kind: 'no-cycles'
  /** Among the Components the patterns match, or among the Source Files inside each of them. */
  readonly scope: 'among' | 'inside'
  readonly components: readonly string[]
}
export type ThresholdRule = CommonRule & {
  readonly kind: 'threshold'
  readonly metric: MetricName
  readonly max?: number
  readonly min?: number
  readonly of: readonly string[]
}
export type Rule = DependencyRule | LayersRule | CyclesRule | ThresholdRule

/** An Exception as the file writes it; whether its fingerprint fits its Rule is checked later. */
export interface WrittenException {
  readonly line: number
  readonly rule: string
  readonly from?: string
  readonly to?: string
  readonly cycle?: readonly string[]
  readonly component?: string
  readonly reason: string
  readonly justifiedBy?: { readonly adr: string; readonly line: number }
}

/** What applying a Pattern recorded (docs/conformance-format.md, section 6). */
export interface AppliedPattern {
  readonly line: number
  readonly id: string
  readonly pattern: string
  readonly roles: readonly { readonly role: string; readonly components: readonly string[] }[]
  readonly names: readonly Naming[]
}

export interface RulesFile {
  /** Whether `.arch/rules.yml` is there. */
  readonly present: boolean
  /** The Rules that can be checked: read without a Problem of their form, first of their ID. */
  readonly rules: readonly Rule[]
  readonly exceptions: readonly WrittenException[]
  readonly patterns: readonly AppliedPattern[]
  /** What is wrong with the form of the file, of a Rule, an Exception, an applied Pattern. */
  readonly problems: readonly ConformanceProblem[]
  /** How many items `rules` has, readable or not. */
  readonly written: number
  /** The line of `rules`, for what is said about the Rules as a whole. */
  readonly rulesLine: number
  /**
   * The IDs of Rules that are written but cannot be checked: their Exceptions are neither
   * matched nor reported as matching nothing.
   */
  readonly unchecked: ReadonlySet<string>
}

const RULE_ID = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/** Whether a text is a valid Rule ID: as a segment of a Component ID is written. */
export const isRuleId = (text: string): boolean => RULE_ID.test(text)

/** A key with a value of the wrong form: why the item cannot be read. */
class Wrong extends Error {
  constructor(
    readonly said: ConformanceSaid,
    readonly at: number
  ) {
    super(said.code)
  }
}

const NOTHING: RulesFile = {
  present: false,
  rules: [],
  exceptions: [],
  patterns: [],
  problems: [],
  written: 0,
  rulesLine: 1,
  unchecked: new Set()
}

/** Read the text of `.arch/rules.yml`; `undefined` when there is no such file. Never throws. */
export function readRules(text: string | undefined): RulesFile {
  if (text === undefined) return NOTHING
  const lines = new LineCounter()
  const doc = parseDocument(text, { uniqueKeys: false, lineCounter: lines })
  const lineOf = (node: unknown, fallback = 1): number => {
    const range = (node as Partial<ParsedNode> | null | undefined)?.range
    return range ? lines.linePos(range[0]).line : fallback
  }
  const unreadable = (detail: ConformanceSaid, line: number): RulesFile => ({
    ...NOTHING,
    present: true,
    problems: [{ kind: 'unreadable-rules', detail, line }]
  })

  if (doc.errors.length > 0) {
    const error = doc.errors[0]!
    return unreadable(
      { code: 'not-yaml', values: { message: error.message.split('\n')[0]!.replace(/:$/, '') } },
      error.linePos?.[0].line ?? 1
    )
  }
  if (doc.contents === null || isEmpty(doc.contents)) return { ...NOTHING, present: true }
  if (!isMap(doc.contents)) return unreadable({ code: 'top-not-map', values: {} }, 1)
  const top = doc.contents
  // A key written twice would hide what it says first: a second list of Rules goes unchecked.
  const twice = repeatedKey(top)
  if (twice !== undefined) {
    return unreadable({ code: 'key-twice', values: { key: twice.key } }, lineOf(twice.node))
  }

  const lists: Record<'rules' | 'exceptions' | 'patterns', readonly unknown[]> = {
    rules: [],
    exceptions: [],
    patterns: []
  }
  for (const key of ['rules', 'exceptions', 'patterns'] as const) {
    const node = valueOf(top, key)
    if (node === undefined || node === null || isEmpty(node)) continue
    if (!isSeq(node)) {
      return unreadable({ code: 'key-not-list', values: { key } }, lineOf(keyNodeOf(top, key)))
    }
    lists[key] = node.items
  }

  const problems: ConformanceProblem[] = []
  const rules: Rule[] = []
  const unchecked = new Set<string>()
  const seen = new Set<string>()
  for (const item of lists.rules) {
    const line = lineOf(item)
    const id = isMap(item) ? textAt(item, 'id') : undefined
    const named = id !== undefined && isRuleId(id) ? id : ''
    if (named !== '' && seen.has(named)) {
      problems.push({ kind: 'duplicate-rule', rule: named, line })
      continue
    }
    if (named !== '') seen.add(named)
    try {
      if (!isMap(item)) throw new Wrong({ code: 'item-not-map', values: {} }, line)
      const read = readRule(item, line, lineOf)
      if ('problem' in read) {
        problems.push(read.problem)
        if (named !== '') unchecked.add(named)
      } else rules.push(read.rule)
    } catch (error) {
      if (!(error instanceof Wrong)) throw error
      problems.push({ kind: 'invalid-rule', rule: named, detail: error.said, line: error.at })
      if (named !== '') unchecked.add(named)
    }
  }

  const exceptions: WrittenException[] = []
  for (const item of lists.exceptions) {
    const line = lineOf(item)
    const rule = isMap(item) ? (textAt(item, 'rule') ?? '') : ''
    try {
      if (!isMap(item)) throw new Wrong({ code: 'item-not-map', values: {} }, line)
      exceptions.push(readException(item, line, lineOf))
    } catch (error) {
      if (!(error instanceof Wrong)) throw error
      problems.push({ kind: 'invalid-exception', rule, detail: error.said, line: error.at })
    }
  }

  const patterns: AppliedPattern[] = []
  for (const item of lists.patterns) {
    const line = lineOf(item)
    const id = isMap(item) ? (textAt(item, 'id') ?? '') : ''
    try {
      if (!isMap(item)) throw new Wrong({ code: 'item-not-map', values: {} }, line)
      patterns.push(readAppliedPattern(item, line, lineOf))
    } catch (error) {
      if (!(error instanceof Wrong)) throw error
      problems.push({
        kind: 'invalid-applied-pattern',
        pattern: id,
        detail: error.said,
        line: error.at
      })
    }
  }

  return {
    present: true,
    rules,
    exceptions,
    patterns,
    problems,
    written: lists.rules.length,
    rulesLine: lineOf(keyNodeOf(top, 'rules')),
    unchecked
  }
}

type LineOf = (node: unknown, fallback?: number) => number

function readRule(
  map: YAMLMap,
  line: number,
  lineOf: LineOf
): { rule: Rule } | { problem: ConformanceProblem } {
  const at = (key: string): number => lineOf(keyNodeOf(map, key), line)
  noKeyTwice(map, lineOf)
  const id = requiredText(map, 'id', line, lineOf)
  if (!isRuleId(id)) throw new Wrong({ code: 'not-rule-id', values: { id } }, at('id'))
  const why = requiredText(map, 'why', line, lineOf)
  const kind = text(map, 'kind', lineOf) ?? ''
  if (!(RULE_KIND_NAMES as readonly string[]).includes(kind)) {
    return { problem: { kind: 'unknown-rule-kind', rule: id, written: kind, line: at('kind') } }
  }

  const names: Naming[] = []
  const patternsAt = (key: string, required: boolean): string[] | undefined => {
    const node = valueOf(map, key)
    if (node === undefined || node === null) {
      // `to:` without a value is reported where it stands.
      if (required) throw new Wrong({ code: 'missing-key', values: { key } }, at(key))
      return undefined
    }
    return componentPatterns(node, key, names, lineOf)
  }
  const choice = <T extends string>(key: string, allowed: readonly T[]): T => {
    const value = text(map, key, lineOf)
    if (value === undefined) return allowed[0]!
    if (!(allowed as readonly string[]).includes(value)) {
      throw new Wrong({ code: 'not-one-of', values: { key, value, allowed } }, at(key))
    }
    return value as T
  }
  // A threshold's metric says what it counts; `type-only` there would be read past.
  if (kind === 'threshold' && keyNodeOf(map, 'type-only') !== undefined) {
    throw new Wrong(
      { code: 'key-not-of-kind', values: { key: 'type-only', kind } },
      at('type-only')
    )
  }
  const common = {
    id,
    why,
    line,
    tests: choice('tests', ['excluded', 'included'] as const) === 'included',
    ignoreTypeOnly:
      kind !== 'threshold' && choice('type-only', ['counted', 'ignored'] as const) === 'ignored',
    names
  }

  switch (kind as RuleKind) {
    case 'must-not-depend':
    case 'may-only-depend': {
      const from = patternsAt('from', true)!
      const to = patternsAt('to', true)!
      return { rule: { ...common, kind: kind as DependencyRule['kind'], from, to } }
    }
    case 'layers': {
      const node = valueOf(map, 'layers')
      if (node === undefined || node === null) {
        throw new Wrong({ code: 'missing-key', values: { key: 'layers' } }, line)
      }
      if (!isSeq(node))
        throw new Wrong({ code: 'not-patterns', values: { key: 'layers' } }, at('layers'))
      const layers = node.items.map((layer) => componentPatterns(layer, 'layers', names, lineOf))
      if (layers.length < 2 || layers.some((layer) => layer.length === 0)) {
        throw new Wrong({ code: 'too-few-layers', values: {} }, at('layers'))
      }
      const mode = choice('mode', ['relaxed', 'strict'] as const)
      return { rule: { ...common, kind: 'layers', layers, mode } }
    }
    case 'no-cycles': {
      const among = patternsAt('among', false)
      const inside = patternsAt('inside', false)
      if ((among === undefined) === (inside === undefined)) {
        throw new Wrong({ code: 'among-or-inside', values: {} }, line)
      }
      const scope = among !== undefined ? 'among' : 'inside'
      return { rule: { ...common, kind: 'no-cycles', scope, components: (among ?? inside)! } }
    }
    case 'threshold': {
      const metric = requiredText(map, 'metric', line, lineOf)
      if (!(METRICS as readonly string[]).includes(metric)) {
        throw new Wrong(
          { code: 'unknown-metric', values: { metric, metrics: [...METRICS] } },
          at('metric')
        )
      }
      const max = numberAt(map, 'max', lineOf)
      const min = numberAt(map, 'min', lineOf)
      if (max === undefined && min === undefined) {
        throw new Wrong({ code: 'max-or-min', values: {} }, line)
      }
      const of = patternsAt('of', true)!
      return {
        rule: {
          ...common,
          kind: 'threshold',
          metric: metric as MetricName,
          ...(max !== undefined && { max }),
          ...(min !== undefined && { min }),
          of
        }
      }
    }
  }
}

function readException(map: YAMLMap, line: number, lineOf: LineOf): WrittenException {
  noKeyTwice(map, lineOf)
  const rule = requiredText(map, 'rule', line, lineOf)
  const reason = requiredText(map, 'reason', line, lineOf)
  const from = text(map, 'from', lineOf)
  const to = text(map, 'to', lineOf)
  const component = text(map, 'component', lineOf)
  const cycleNode = valueOf(map, 'cycle')
  let cycle: string[] | undefined
  if (cycleNode !== undefined && cycleNode !== null) {
    const items = isSeq(cycleNode) ? cycleNode.items : [cycleNode]
    cycle = items.map((item) => {
      const value = scalarText(item)
      if (value === undefined) {
        throw new Wrong({ code: 'not-patterns', values: { key: 'cycle' } }, lineOf(item, line))
      }
      return value
    })
  }
  const adr = text(map, 'justified-by', lineOf)
  return {
    line,
    rule,
    ...(from !== undefined && { from }),
    ...(to !== undefined && { to }),
    ...(cycle !== undefined && { cycle }),
    ...(component !== undefined && { component }),
    reason,
    ...(adr !== undefined && {
      justifiedBy: { adr, line: lineOf(keyNodeOf(map, 'justified-by'), line) }
    })
  }
}

function readAppliedPattern(map: YAMLMap, line: number, lineOf: LineOf): AppliedPattern {
  noKeyTwice(map, lineOf)
  const id = requiredText(map, 'id', line, lineOf)
  if (!isRuleId(id)) throw new Wrong({ code: 'not-rule-id', values: { id } }, line)
  const pattern = requiredText(map, 'pattern', line, lineOf)
  const node = valueOf(map, 'roles')
  const names: Naming[] = []
  const roles: { role: string; components: string[] }[] = []
  if (node !== undefined && node !== null && !isEmpty(node)) {
    if (!isMap(node)) throw new Wrong({ code: 'roles-not-map', values: {} }, line)
    noKeyTwice(node, lineOf)
    for (const pair of node.items) {
      const role = scalarText(pair.key)
      if (role === undefined || pair.value === null) {
        throw new Wrong({ code: 'roles-not-map', values: {} }, line)
      }
      roles.push({
        role,
        components: componentPatterns(pair.value, `roles of ${role}`, names, lineOf)
      })
    }
  }
  return { line, id, pattern, roles, names }
}

/** A Component pattern or a list of them; each one is noted with where it stands. */
function componentPatterns(node: unknown, key: string, names: Naming[], lineOf: LineOf): string[] {
  const items = isSeq(node) ? node.items : [node]
  return items.map((item) => {
    const value = scalarText(item)
    if (value === undefined || value.trim() === '' || /\s/.test(value)) {
      throw new Wrong({ code: 'not-patterns', values: { key } }, lineOf(item, lineOf(node)))
    }
    names.push({ pattern: value, key, line: lineOf(item, lineOf(node)) })
    return value
  })
}

/** The first key of a map that is written again, at its second place; `undefined` if none is. */
function repeatedKey(map: YAMLMap): { key: string; node: unknown } | undefined {
  const seen = new Set<string>()
  for (const pair of map.items) {
    const key = scalarText(pair.key)
    if (key === undefined) continue
    if (seen.has(key)) return { key, node: pair.key }
    seen.add(key)
  }
  return undefined
}

/** A Rule, an Exception or an applied Pattern with a key written twice cannot be read. */
function noKeyTwice(map: YAMLMap, lineOf: LineOf): void {
  const twice = repeatedKey(map)
  if (twice !== undefined) {
    throw new Wrong({ code: 'key-twice', values: { key: twice.key } }, lineOf(twice.node))
  }
}

/** The key node of a key, `undefined` when the key is not there. The first one counts. */
function keyNodeOf(map: YAMLMap, key: string): unknown {
  return map.items.find((pair) => scalarText(pair.key) === key)?.key
}

/** The value of a key, `undefined` when the key is not there, `null` when it has none. */
function valueOf(map: YAMLMap, key: string): unknown {
  const pair = map.items.find((candidate) => scalarText(candidate.key) === key)
  if (pair === undefined) return undefined
  return pair.value === null || (isScalar(pair.value) && pair.value.value === null)
    ? null
    : pair.value
}

/** A scalar without a value, or an empty list or map: nothing is written there. */
const isEmpty = (node: unknown): boolean =>
  (isScalar(node) && node.value === null) ||
  ((isSeq(node) || isMap(node)) && node.items.length === 0)

/** The text of a key, `undefined` when it is not there or is no text. Never throws. */
const textAt = (map: YAMLMap, key: string): string | undefined => scalarText(valueOf(map, key))

/** A scalar as the text it stands for: `2` and `true` written as a name are text. */
export function scalarText(node: unknown): string | undefined {
  if (!isScalar(node) || node.value === null || typeof node.value === 'object') return undefined
  return typeof node.value === 'string' ? node.value : (node.source ?? String(node.value))
}

function text(map: YAMLMap, key: string, lineOf: LineOf): string | undefined {
  const node = valueOf(map, key)
  if (node === undefined || node === null) return undefined
  const value = scalarText(node)
  if (value === undefined) throw new Wrong({ code: 'not-text', values: { key } }, lineOf(node))
  return value
}

function requiredText(map: YAMLMap, key: string, line: number, lineOf: LineOf): string {
  const value = text(map, key, lineOf)
  if (value === undefined || value.trim() === '') {
    throw new Wrong({ code: 'missing-key', values: { key } }, line)
  }
  return value
}

function numberAt(map: YAMLMap, key: string, lineOf: LineOf): number | undefined {
  const node = valueOf(map, key)
  if (node === undefined || node === null) return undefined
  if (!isScalar(node) || typeof node.value !== 'number' || !Number.isFinite(node.value)) {
    throw new Wrong({ code: 'not-number', values: { key } }, lineOf(node))
  }
  return node.value
}
