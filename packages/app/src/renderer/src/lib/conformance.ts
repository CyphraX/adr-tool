/**
 * What the window makes of the Rules of a repository and their Violations
 * (docs/plan-vision.md, part 4): the form a Rule is written with, the Violations on a level of
 * Structure's drawing, the Rules that name a Component, the Exceptions an ADR justifies.
 * Nothing here reads or writes; `conformance` checks and writes, in the main process.
 */
import {
  componentMatcher,
  fingerprintKindOfKeys,
  fingerprintNames,
  METRICS,
  readFingerprint,
  type MetricName,
  type Rule,
  type RuleDraft,
  type RuleKind
} from '@adr-tool/conformance'
import type {
  ConformanceException,
  ConformanceViolation,
  StructureEdge,
  StructureView
} from '../../../shared/ipc'
import { t, type MetricKey } from './strings'

/** The metrics a threshold can be on that Structure's table has a column for, by its key. */
const METRIC_KEY: Partial<Record<MetricName, MetricKey>> = {
  files: 'files',
  lines: 'lines',
  'efferent-coupling': 'efferent',
  'afferent-coupling': 'afferent',
  instability: 'instability',
  'fan-out': 'fanOut',
  'fan-in': 'fanIn',
  'relational-cohesion': 'cohesion',
  'internal-share': 'internalShare',
  abstractness: 'abstractness',
  distance: 'distance'
}

/** A metric a threshold can be on, in the words of the window: its name, its definition, a value. */
export function metricWording(metric: MetricName): {
  long: string
  definition: string
  value: (value: number) => string
} {
  const key = METRIC_KEY[metric]
  if (key !== undefined) {
    const { long, definition } = t.structure.metric[key]
    return { long, definition, value: (value) => t.structure.value(key, value) }
  }
  const words = t.conformance.metric[metric as keyof typeof t.conformance.metric]
  return {
    ...words,
    value: (value) =>
      metric === 'propagation-cost' ? `${Math.round(value * 100)} %` : decimalOf(value)
  }
}

/** A count or a measure, as the window writes numbers. */
const decimalOf = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2)

/** What a Rule says, in the words of the window. */
export const ruleSays = (rule: Rule): string =>
  t.conformance.says(rule, rule.kind === 'threshold' ? metricWording(rule.metric).long : '')

/** A Rule as the form holds it while it is written: the keys of every kind, as typed. */
export interface RuleForm {
  /** The ID of the Rule that is changed; `undefined` for a new one. */
  readonly original: string | undefined
  id: string
  why: string
  kind: RuleKind
  from: string[]
  to: string[]
  /** The layers from the top down, each its Component patterns. */
  layers: string[][]
  strict: boolean
  scope: 'among' | 'inside'
  components: string[]
  metric: MetricName
  /** As typed: a number, with a point or a comma. */
  max: string
  min: string
  of: string[]
  /** Of a Rule about Libraries: its Library patterns, and whether its Components are allowed or not. */
  libraries: string[]
  libraryScope: 'only-in' | 'not-in'
  tests: boolean
  ignoreTypeOnly: boolean
}

/** The form for a new Rule, or for changing `rule`. */
export function ruleFormOf(rule?: Rule): RuleForm {
  const form: RuleForm = {
    original: rule?.id,
    id: rule?.id ?? '',
    why: rule?.why ?? '',
    kind: rule?.kind ?? 'must-not-depend',
    from: [],
    to: [],
    layers: [[], []],
    strict: false,
    scope: 'among',
    components: [],
    metric: METRICS[0],
    max: '',
    min: '',
    of: [],
    libraries: [],
    libraryScope: 'only-in',
    tests: rule?.tests ?? false,
    ignoreTypeOnly: rule?.ignoreTypeOnly ?? false
  }
  switch (rule?.kind) {
    case 'must-not-depend':
    case 'may-only-depend':
      return { ...form, from: [...rule.from], to: [...rule.to] }
    case 'layers':
      return {
        ...form,
        layers: rule.layers.map((layer) => [...layer]),
        strict: rule.mode === 'strict'
      }
    case 'no-cycles':
      return { ...form, scope: rule.scope, components: [...rule.components] }
    case 'threshold':
      return {
        ...form,
        metric: rule.metric,
        max: rule.max === undefined ? '' : String(rule.max),
        min: rule.min === undefined ? '' : String(rule.min),
        of: [...rule.of]
      }
    case 'library':
      return {
        ...form,
        libraries: [...rule.libraries],
        libraryScope: rule.scope,
        components: [...rule.components]
      }
    case undefined:
      return form
  }
}

/** A number as typed: `0.5` or `0,5`; `undefined` for nothing, `NaN` for what is no number. */
export function numberOf(typed: string): number | undefined {
  const trimmed = typed.trim()
  if (trimmed === '') return undefined
  return /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(trimmed) ? Number(trimmed.replace(',', '.')) : NaN
}

/**
 * What the form still needs before it can be previewed, as the keys it lacks. What else is
 * wrong — an ID that is no Rule ID, a metric out of range — `conformance` says in its refusal.
 */
export function missingOf(form: RuleForm): string[] {
  const missing: string[] = []
  if (form.id.trim() === '') missing.push('id')
  if (form.why.trim() === '') missing.push('why')
  switch (form.kind) {
    case 'must-not-depend':
      if (form.from.length === 0) missing.push('from')
      if (form.to.length === 0) missing.push('to')
      break
    case 'may-only-depend':
      // An empty `to` says: no other Component at all.
      if (form.from.length === 0) missing.push('from')
      break
    case 'layers':
      if (form.layers.filter((layer) => layer.length > 0).length < 2) missing.push('layers')
      break
    case 'no-cycles':
      if (form.components.length === 0) missing.push(form.scope)
      break
    case 'threshold': {
      const max = numberOf(form.max)
      const min = numberOf(form.min)
      if (max === undefined && min === undefined) missing.push('max')
      if (Number.isNaN(max)) missing.push('max')
      if (Number.isNaN(min)) missing.push('min')
      if (form.of.length === 0) missing.push('of')
      break
    }
    case 'library':
      if (form.libraries.length === 0) missing.push('library')
      if (form.components.length === 0) missing.push(form.libraryScope)
      break
  }
  return missing
}

/** The Rule the form describes, as `conformance` writes it; `undefined` while it lacks a key. */
export function draftOfForm(form: RuleForm): RuleDraft | undefined {
  if (missingOf(form).length > 0) return undefined
  // As `draftOf` gives a Rule of the file: a key at its default is not written.
  const common = { id: form.id.trim(), why: form.why.trim(), tests: form.tests }
  const typeOnly = { ignoreTypeOnly: form.ignoreTypeOnly }
  switch (form.kind) {
    case 'must-not-depend':
    case 'may-only-depend':
      return { ...common, ...typeOnly, kind: form.kind, from: form.from, to: form.to }
    case 'layers':
      return {
        ...common,
        ...typeOnly,
        kind: 'layers',
        layers: form.layers.filter((layer) => layer.length > 0),
        mode: form.strict ? 'strict' : 'relaxed'
      }
    case 'no-cycles':
      return {
        ...common,
        ...typeOnly,
        kind: 'no-cycles',
        scope: form.scope,
        components: form.components
      }
    case 'threshold': {
      const max = numberOf(form.max)
      const min = numberOf(form.min)
      return {
        ...common,
        kind: 'threshold',
        metric: form.metric,
        ...(max !== undefined && { max }),
        ...(min !== undefined && { min }),
        of: form.of
      }
    }
    case 'library':
      return {
        ...common,
        ...typeOnly,
        kind: 'library',
        libraries: form.libraries,
        scope: form.libraryScope,
        components: form.components
      }
  }
}

/** What tells a line of a level apart. */
export const edgeKey = (edge: Pick<StructureEdge, 'from' | 'to'>): string =>
  `${edge.from}\n${edge.to}`

/** What a level of Structure's drawing shows of the Violations that no Exception accepts. */
export interface ViolationsOnLevel {
  /** The lines with a Source File Dependency of a Violation behind them, by `edgeKey`. */
  readonly edges: ReadonlyMap<string, readonly ConformanceViolation[]>
  /** The boxes whose metric, or that of a Component inside, is outside a threshold. */
  readonly nodes: ReadonlyMap<string, readonly ConformanceViolation[]>
}

export function violationsOnLevel(
  view: Pick<StructureView, 'nodes' | 'edges'>,
  violations: readonly ConformanceViolation[]
): ViolationsOnLevel {
  const open = violations.filter((violation) => violation.exception === undefined)
  const byPair = new Map<string, ConformanceViolation[]>()
  for (const violation of open) {
    for (const dependency of violation.dependencies) {
      const key = edgeKey(dependency)
      const list = byPair.get(key) ?? []
      if (!list.includes(violation)) list.push(violation)
      byPair.set(key, list)
    }
  }
  const edges = new Map<string, ConformanceViolation[]>()
  for (const edge of view.edges) {
    const found = new Set(
      edge.dependencies.flatMap((dependency) => byPair.get(edgeKey(dependency)) ?? [])
    )
    if (found.size > 0) edges.set(edgeKey(edge), [...found])
  }
  const nodes = new Map<string, ConformanceViolation[]>()
  for (const node of view.nodes) {
    // A threshold on a function or a class marks the box its Source File lies in.
    const found = open.filter((violation) => {
      const of = violation.component ?? violation.owner
      const inFile = violation.file !== undefined && violation.file === node.id
      return inFile || (of !== undefined && (of === node.id || of.startsWith(`${node.id}/`)))
    })
    if (found.length > 0) nodes.set(node.id, found)
  }
  return { edges, nodes }
}

/** The Rules that name a Component, by its ID or by a pattern that matches it. */
export function rulesNaming(rules: readonly Rule[], id: string): Rule[] {
  return rules.filter((rule) => rule.names.some(({ pattern }) => componentMatcher([pattern])(id)))
}

/**
 * The Violations about a Component or one inside it: from it, to it, of it, of its Cycle, or of
 * a function or class in its Source Files.
 */
export function violationsAbout(
  violations: readonly ConformanceViolation[],
  id: string
): ConformanceViolation[] {
  const about = (other: string | undefined): boolean =>
    other !== undefined && (other === id || other.startsWith(`${id}/`))
  return violations.filter(
    (violation) =>
      about(violation.from) ||
      about(violation.to) ||
      about(violation.component) ||
      about(violation.owner) ||
      (violation.cycle?.members.some(about) ?? false)
  )
}

/**
 * Whether `justified-by` names the ADR `id` of the log at `log`: by the directory of its log
 * and its ID — `.` for a log at the top —, or by its ID alone where there is one log.
 */
export function justifies(
  reference: string,
  logs: readonly string[],
  log: string,
  id: string
): boolean {
  const slash = reference.lastIndexOf('/')
  const written = slash === -1 ? undefined : reference.slice(0, slash)
  const named =
    written === undefined
      ? logs.length === 1
        ? logs[0]
        : undefined
      : written === '.'
        ? ''
        : written
  return reference.slice(slash + 1) === id && named === log
}

/** The Exceptions an ADR justifies. */
export function exceptionsJustifiedBy(
  exceptions: readonly ConformanceException[],
  logs: readonly string[],
  log: string,
  id: string
): ConformanceException[] {
  return exceptions.filter(
    (exception) =>
      exception.justifiedBy !== undefined && justifies(exception.justifiedBy.adr, logs, log, id)
  )
}

/** How an Exception names an ADR of a Decision Log: the directory of its log — `.` at the top — and its ID. */
export const referenceOf = (log: string, id: string): string => `${log === '' ? '.' : log}/${id}`

/** The ADR a `justified-by` names, among the Decision Logs of the repository. */
export function adrNamed<A extends { readonly id: string }>(
  reference: string,
  logs: readonly { readonly path: string; readonly adrs: readonly A[] }[]
): { log: string; adr: A } | undefined {
  const paths = logs.map((log) => log.path)
  for (const log of logs) {
    const adr = log.adrs.find((candidate) => justifies(reference, paths, log.path, candidate.id))
    if (adr) return { log: log.path, adr }
  }
  return undefined
}

/** What an Exception names, without its Rule: `billing → web`, `a ⇄ b`, `parse (src/a.ts)`. */
export function exceptionNames(exception: ConformanceException): string {
  return fingerprintNames(
    exception.fingerprint ??
      readFingerprint(fingerprintKindOfKeys(exception), exception.rule, exception) ?? {
        kind: 'component',
        rule: exception.rule,
        component: '–'
      }
  )
}
