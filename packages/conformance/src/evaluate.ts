/**
 * Evaluating Rules on Structure's model (docs/conformance-format.md, sections 2 and 3): the
 * Violations of each Rule, each with its fingerprint and the Source File Dependencies behind it.
 * Violations are derived and never stored.
 */
import {
  everyComponent,
  findCycles,
  metricsOf,
  UNASSIGNED,
  type Cycle,
  type DeclaredComponent,
  type Dependency,
  type Metrics,
  type Structure
} from '@adr-tool/structure/model'
import { matcherOf } from './component-patterns'
import type { Fingerprint } from './fingerprint'
import type {
  CyclesRule,
  DependencyRule,
  LayersRule,
  MetricName,
  Rule,
  ThresholdRule
} from './rules'
import type { ConformanceSaid } from './sentences'

/** What the Rules are evaluated on: Structure's model of the repository. */
export interface Model {
  readonly structure: Pick<Structure, 'components' | 'sourceFiles'>
  readonly dependencies: readonly Dependency[]
  /** How many lines each Source File has (Structure's Size). */
  readonly lineCounts: ReadonlyMap<string, number>
}

/** One place where the code breaks a Rule. */
export interface Violation {
  readonly rule: Rule
  readonly fingerprint: Fingerprint
  /** What the Violation is, as a code: the kind of its Rule, with the values of its sentence. */
  readonly said: ConformanceSaid
  /** Of a Dependency: the source and the target Component; `(unassigned)` for no Component. */
  readonly from?: string
  readonly to?: string
  /**
   * Of a Cycle: its members, one round trip through them as an example, among Components the
   * weakest Dependency on that round trip as a hint where to cut, and whether it is type-only.
   */
  readonly cycle?: {
    readonly members: readonly string[]
    readonly roundTrip: readonly string[]
    readonly weakest?: { readonly from: string; readonly to: string }
    readonly typeOnly: boolean
  }
  /** Of a threshold: the Component and its value. */
  readonly component?: string
  readonly value?: number
  /**
   * The Source File Dependencies behind the Violation, with the lines of their imports: of a
   * Dependency, all of them; of a Cycle, every one among its members — each lies on the Cycle,
   * whichever is new; of a threshold, none.
   */
  readonly dependencies: readonly Dependency[]
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The chains of Components that contain each Source File, top down, and which files are tests. */
interface Chains {
  /** Per Source File: the Components that contain it, top down; empty for an Unassigned one. */
  readonly ofFile: ReadonlyMap<string, readonly string[]>
  readonly test: ReadonlySet<string>
  readonly components: readonly DeclaredComponent[]
}

const chainsOf = new WeakMap<object, Chains>()

function chains(structure: Model['structure']): Chains {
  const known = chainsOf.get(structure)
  if (known) return known
  const ofComponent = new Map<string, readonly string[]>()
  const walk = (list: readonly DeclaredComponent[], above: readonly string[]): void => {
    for (const component of list) {
      const chain = [...above, component.id]
      ofComponent.set(component.id, chain)
      walk(component.children, chain)
    }
  }
  walk(structure.components, [])
  const NONE: readonly string[] = []
  const ofFile = new Map<string, readonly string[]>()
  const test = new Set<string>()
  for (const file of structure.sourceFiles) {
    ofFile.set(file.path, (file.component !== undefined && ofComponent.get(file.component)) || NONE)
    if (file.test) test.add(file.path)
  }
  const result = { ofFile, test, components: everyComponent(structure.components) }
  chainsOf.set(structure, result)
  return result
}

/**
 * Where a Dependency stands for a Rule (section 2, "Where a Dependency stands"): below the
 * Components that contain both files, the chain of each side.
 */
interface Parted {
  readonly dependency: Dependency
  /** The Components that contain the source file and not the target, top down. */
  readonly source: readonly string[]
  /** The Components that contain the target file and not the source, top down. */
  readonly target: readonly string[]
  /** Every Component that contains the target file, top down. */
  readonly targetChain: readonly string[]
  /** The innermost Component that contains both; `undefined` when none does. */
  readonly common: string | undefined
}

/**
 * A Dependency as a Rule that ignores type-only uses sees it: without the lines on which every
 * use is type-only, so that no annotation stands on an import the Rule does not count.
 */
function counted(rule: Rule, dependency: Dependency): Dependency {
  const typed = dependency.typeOnlyLines
  if (!rule.ignoreTypeOnly || typed === undefined) return dependency
  const { from, to, typeOnly } = dependency
  return { from, to, typeOnly, lines: dependency.lines.filter((line) => !typed.includes(line)) }
}

/** The Dependencies a Rule counts — test files and type-only ones as it says — where they stand. */
function parted(rule: Rule, model: Model): Parted[] {
  const { ofFile, test } = chains(model.structure)
  const result: Parted[] = []
  for (const written of model.dependencies) {
    if (!rule.tests && (test.has(written.from) || test.has(written.to))) continue
    if (rule.ignoreTypeOnly && written.typeOnly) continue
    const dependency = counted(rule, written)
    const from = ofFile.get(dependency.from)
    const to = ofFile.get(dependency.to)
    if (from === undefined || to === undefined) continue
    let common = 0
    while (common < from.length && common < to.length && from[common] === to[common]) common++
    result.push({
      dependency,
      source: from.slice(common),
      target: to.slice(common),
      targetChain: to,
      common: common > 0 ? from[common - 1] : undefined
    })
  }
  return result
}

/** Violations between two Components, each with the Source File Dependencies behind it. */
class Pairs {
  private readonly found = new Map<
    string,
    { from: string; to: string; said: ConformanceSaid; dependencies: Dependency[] }
  >()

  add(from: string, to: string, said: ConformanceSaid, dependency: Dependency): void {
    const key = `${from}\n${to}`
    const pair = this.found.get(key) ?? { from, to, said, dependencies: [] }
    pair.dependencies.push(dependency)
    this.found.set(key, pair)
  }

  violations(rule: Rule): Violation[] {
    return [...this.found.values()]
      .sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to))
      .map(({ from, to, said, dependencies }) => ({
        rule,
        fingerprint: { kind: 'dependency', rule: rule.id, from, to },
        said,
        from,
        to,
        dependencies
      }))
  }
}

/** The Violations of one Rule, in the order of their fingerprints. */
export function evaluate(rule: Rule, model: Model): Violation[] {
  switch (rule.kind) {
    case 'must-not-depend':
    case 'may-only-depend':
      return dependencyViolations(rule, model)
    case 'layers':
      return layerViolations(rule, model)
    case 'no-cycles':
      return rule.scope === 'among' ? cyclesAmong(rule, model) : cyclesInside(rule, model)
    case 'threshold':
      return thresholdViolations(rule, model)
  }
}

function dependencyViolations(rule: DependencyRule, model: Model): Violation[] {
  const isFrom = matcherOf(rule.from)
  const isTo = matcherOf(rule.to)
  const pairs = new Pairs()
  for (const one of parted(rule, model)) {
    const from = one.source.find(isFrom)
    if (from === undefined) continue
    if (rule.kind === 'must-not-depend') {
      const to = one.target.find(isTo)
      if (to === undefined) continue
      pairs.add(from, to, { code: rule.kind, values: { from, to } }, one.dependency)
      continue
    }
    // What is not allowed is forbidden; a Component contains what it allows.
    if (one.targetChain.some(isTo)) continue
    const to = one.target[0] ?? one.common ?? UNASSIGNED
    pairs.add(from, to, { code: rule.kind, values: { from, to, allowed: rule.to } }, one.dependency)
  }
  return pairs.violations(rule)
}

function layerViolations(rule: LayersRule, model: Model): Violation[] {
  const layers = rule.layers.map(matcherOf)
  /** The first layer whose patterns match the Component. */
  const layerOf = (id: string): number | undefined => {
    const index = layers.findIndex((matches) => matches(id))
    return index === -1 ? undefined : index
  }
  const inLayer = (id: string): boolean => layerOf(id) !== undefined
  const pairs = new Pairs()
  for (const one of parted(rule, model)) {
    const from = one.source.find(inLayer)
    const to = one.target.find(inLayer)
    if (from === undefined || to === undefined) continue
    const above = layerOf(to)! < layerOf(from)!
    const skips = rule.mode === 'strict' && layerOf(to)! > layerOf(from)! + 1
    if (!above && !skips) continue
    const where = above ? 'above' : 'further-below'
    pairs.add(from, to, { code: 'layers', values: { from, to, where } }, one.dependency)
  }
  return pairs.violations(rule)
}

function cyclesAmong(rule: CyclesRule, model: Model): Violation[] {
  const matches = matcherOf(rule.components)
  const nodes = chains(model.structure)
    .components.map((component) => component.id)
    .filter(matches)
  const edges = new Map<
    string,
    { from: string; to: string; weight: number; typeOnly: boolean; dependencies: Dependency[] }
  >()
  for (const one of parted(rule, model)) {
    const from = one.source.find(matches)
    const to = one.target.find(matches)
    if (from === undefined || to === undefined) continue
    const key = `${from}\n${to}`
    const edge = edges.get(key) ?? { from, to, weight: 0, typeOnly: true, dependencies: [] }
    edge.weight++
    edge.typeOnly &&= one.dependency.typeOnly
    edge.dependencies.push(one.dependency)
    edges.set(key, edge)
  }
  return findCycles(nodes, [...edges.values()], { weakest: true }).map((cycle) => {
    const inside = new Set(cycle.members)
    const among = [...edges.values()]
      .filter((edge) => inside.has(edge.from) && inside.has(edge.to))
      .flatMap((edge) => edge.dependencies)
    return cycleViolation(rule, cycle, among)
  })
}

function cyclesInside(rule: CyclesRule, model: Model): Violation[] {
  const matches = matcherOf(rule.components)
  const { ofFile, test, components } = chains(model.structure)
  const depth = (id: string): number => id.split('/').length
  // The innermost first: a Cycle inside a child is reported for the child, not again for its parent.
  const inside = components
    .map((component) => component.id)
    .filter(matches)
    .map((id, order) => ({ id, order }))
    .sort((a, b) => depth(b.id) - depth(a.id) || a.order - b.order)
  const counted = parted(rule, model).map((one) => one.dependency)
  const reported = new Set<string>()
  const violations: Violation[] = []
  for (const { id } of inside) {
    const files = [...ofFile]
      .filter(([path, chain]) => chain.includes(id) && (rule.tests || !test.has(path)))
      .map(([path]) => path)
      .sort(compare)
    const within = new Set(files)
    const byPair = new Map<string, Dependency>()
    for (const dependency of counted) {
      if (within.has(dependency.from) && within.has(dependency.to)) {
        byPair.set(`${dependency.from}\n${dependency.to}`, dependency)
      }
    }
    const edges = [...byPair.values()].map((dependency) => ({ ...dependency, weight: 1 }))
    for (const cycle of findCycles(files, edges, { weakest: false })) {
      const key = cycle.members.join('\n')
      if (reported.has(key)) continue
      reported.add(key)
      const members = new Set(cycle.members)
      const among = [...byPair.values()].filter(
        (dependency) => members.has(dependency.from) && members.has(dependency.to)
      )
      violations.push(cycleViolation(rule, cycle, among))
    }
  }
  return violations.sort((a, b) => compare(a.cycle!.members[0]!, b.cycle!.members[0]!))
}

/**
 * The Violation of a Cycle: in a strongly connected group every Dependency among the members
 * lies on a round trip through them, so each is behind it — the import that closed the Cycle
 * and the ones that were there before.
 */
function cycleViolation(
  rule: CyclesRule,
  cycle: Pick<Cycle, 'members' | 'roundTrip' | 'weakest' | 'typeOnly'>,
  dependencies: readonly Dependency[]
): Violation {
  const { members, roundTrip, weakest, typeOnly } = cycle
  return {
    rule,
    fingerprint: { kind: 'cycle', rule: rule.id, cycle: members },
    said: {
      code: 'no-cycles',
      values: { members, roundTrip, ...(weakest && { weakest: [weakest.from, weakest.to] }) }
    },
    cycle: { members, roundTrip, ...(weakest && { weakest }), typeOnly },
    dependencies: [...dependencies].sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to))
  }
}

/** Where Structure keeps each metric a threshold can be on. */
const METRIC_OF: Record<MetricName, (metrics: Metrics) => number | undefined> = {
  files: (metrics) => metrics.files,
  lines: (metrics) => metrics.lines,
  'efferent-coupling': (metrics) => metrics.efferent,
  'afferent-coupling': (metrics) => metrics.afferent,
  instability: (metrics) => metrics.instability,
  'fan-out': (metrics) => metrics.fanOut,
  'fan-in': (metrics) => metrics.fanIn,
  'relational-cohesion': (metrics) => metrics.cohesion,
  'internal-share': (metrics) => metrics.internalShare
}

function thresholdViolations(rule: ThresholdRule, model: Model): Violation[] {
  const matches = matcherOf(rule.of)
  const metrics = metricsOf(model.structure, model.dependencies, model.lineCounts, {
    tests: rule.tests
  })
  const violations: Violation[] = []
  for (const { id } of chains(model.structure).components) {
    if (!matches(id)) continue
    const known = metrics.get(id)
    const value = known && METRIC_OF[rule.metric](known)
    if (value === undefined) continue
    const bound =
      rule.max !== undefined && value > rule.max
        ? ('max' as const)
        : rule.min !== undefined && value < rule.min
          ? ('min' as const)
          : undefined
    if (bound === undefined) continue
    const limit = bound === 'max' ? rule.max! : rule.min!
    violations.push({
      rule,
      fingerprint: { kind: 'component', rule: rule.id, component: id },
      said: {
        code: 'threshold',
        values: { metric: rule.metric, component: id, value, bound, limit }
      },
      component: id,
      value,
      dependencies: []
    })
  }
  return violations
}
