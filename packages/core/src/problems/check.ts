import type { Adr } from '../adr/adr'
import type { NamingScheme } from '../log/naming'
import { BACK_REFERENCE_KEYS } from '../relation'
import type { LogContext, Relation } from '../relations/graph'
import {
  absoluteReference,
  isQualified,
  normalReference,
  outsideReference,
  referenceTo
} from '../relations/reference'
import type { BackReferenceKey, Problem } from './problem'

const MIRRORED = Object.entries(BACK_REFERENCE_KEYS) as [
  keyof typeof BACK_REFERENCE_KEYS,
  BackReferenceKey
][]

/**
 * The consistency rules of a Decision Log (docs/file-format.md, "Consistency"), beyond what
 * a single file can tell: Back-references, the `superseded` Status, cycles, duplicate numbers.
 */
export function checkConsistency(
  adrs: readonly Adr[],
  relations: readonly Relation[],
  scheme: NamingScheme,
  log: LogContext = { path: '', guests: [] }
): Problem[] {
  const byId = new Map(adrs.map((adr) => [adr.id, adr]))
  const guests = new Set(log.guests.map((guest) => guest.reference))
  const inEffect = relations.filter((relation) => relation.state === 'in-effect')
  const problems: Problem[] = []

  for (const [type, key] of MIRRORED) {
    const founded = inEffect.filter((relation) => relation.type === type)

    // The Relation is authoritative: every one in effect needs its mirror on the target …
    for (const { from, to } of founded) {
      // A target in another log is that log's to check.
      const target = byId.get(to)
      if (!target) continue
      const mirrored = target.metadata.backReferences[key].map((item) =>
        normalReference(log.path, item)
      )
      if (!mirrored.includes(from)) {
        problems.push({ kind: 'missing-back-reference', adr: to, key, source: from })
      }
      if (type === 'supersedes' && target.metadata.status !== 'superseded') {
        problems.push({ kind: 'not-marked-superseded', adr: to, source: from })
      }
    }

    // … and every Back-reference needs a Relation in effect behind it.
    for (const adr of adrs) {
      for (const written of adr.metadata.backReferences[key]) {
        if (outsideReference(written)) {
          problems.push({ kind: 'other-repository', adr: adr.id, key, target: written })
          continue
        }
        const source = normalReference(log.path, written)
        if (source === adr.id) problems.push({ kind: 'self-reference', adr: adr.id, key })
        else if (!byId.has(source) && !guests.has(source)) {
          problems.push({ kind: 'unknown-target', adr: adr.id, key, target: written })
        } else if (
          !founded.some((relation) => relation.from === source && relation.to === adr.id)
        ) {
          problems.push({ kind: 'unfounded-back-reference', adr: adr.id, key, source })
        }
      }
    }
  }

  for (const adr of adrs) {
    const superseded = inEffect.some(({ type, to }) => type === 'supersedes' && to === adr.id)
    if (adr.metadata.status === 'superseded' && !superseded) {
      problems.push({ kind: 'superseded-without-successor', adr: adr.id })
    }
  }

  // A circle may run through other logs and back: what they supersede among each other counts.
  const known = new Set([...byId.keys(), ...guests])
  const between = log.guests.flatMap((guest) =>
    [...guest.metadata.relations.supersedes, ...(guest.impliedSupersedes ?? [])].flatMap(
      (written) => {
        const target = absoluteReference(guest.log, written)
        const to = referenceTo(log.path, target.log, target.id)
        return isQualified(to) && known.has(to) ? [{ from: guest.reference, to }] : []
      }
    )
  )
  for (const cycle of supersedesCycles(relations, between)) {
    // A circle among other logs alone is theirs to report.
    if (cycle.some((id) => !isQualified(id)))
      problems.push({ kind: 'supersedes-cycle', adrs: cycle })
  }

  if (scheme === 'sequential') {
    const byNumber = new Map<number, string[]>()
    for (const adr of adrs) {
      if (adr.number !== undefined) {
        byNumber.set(adr.number, [...(byNumber.get(adr.number) ?? []), adr.id])
      }
    }
    for (const [number, ids] of byNumber) {
      if (ids.length > 1) problems.push({ kind: 'duplicate-number', number, adrs: ids })
    }
  }

  return problems
}

/** The Traces of the ADRs that name a Component the repository does not declare. */
export function checkTraces(adrs: readonly Adr[], components: readonly string[]): Problem[] {
  const declared = new Set(components)
  return adrs.flatMap((adr) =>
    adr.metadata.affects
      .filter((component) => !declared.has(component))
      .map((component): Problem => ({ kind: 'unknown-component', adr: adr.id, component }))
  )
}

const ownFirst = (a: string, b: string): number =>
  Number(isQualified(a)) - Number(isQualified(b)) || (a < b ? -1 : a > b ? 1 : 0)

/**
 * Groups of ADRs that supersede each other in a circle, whatever the state of the Relations:
 * the strongly connected components of the `supersedes` graph with more than one member.
 */
function supersedesCycles(
  relations: readonly Relation[],
  between: readonly { from: string; to: string }[]
): string[][] {
  const next = new Map<string, string[]>()
  const edges = [...relations.filter(({ type }) => type === 'supersedes'), ...between]
  for (const { from, to } of edges) next.set(from, [...(next.get(from) ?? []), to])

  // Tarjan's algorithm.
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const cycles: string[][] = []

  const visit = (id: string): void => {
    index.set(id, index.size)
    low.set(id, index.get(id)!)
    stack.push(id)
    onStack.add(id)
    for (const target of next.get(id) ?? []) {
      if (!index.has(target)) {
        visit(target)
        low.set(id, Math.min(low.get(id)!, low.get(target)!))
      } else if (onStack.has(target)) {
        low.set(id, Math.min(low.get(id)!, index.get(target)!))
      }
    }
    if (low.get(id) === index.get(id)) {
      const component: string[] = []
      let member: string
      do {
        member = stack.pop()!
        onStack.delete(member)
        component.push(member)
      } while (member !== id)
      // The log's own ADRs first: the first one is the ADR the Problem is reported on.
      if (component.length > 1) cycles.push(component.sort(ownFirst))
    }
  }

  for (const id of next.keys()) if (!index.has(id)) visit(id)
  return cycles
}
