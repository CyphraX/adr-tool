import type { Adr } from '../adr/adr'
import type { NamingScheme } from '../log/naming'
import { BACK_REFERENCE_KEYS } from '../relation'
import type { Relation } from '../relations/graph'
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
  scheme: NamingScheme
): Problem[] {
  const byId = new Map(adrs.map((adr) => [adr.id, adr]))
  const inEffect = relations.filter((relation) => relation.state === 'in-effect')
  const problems: Problem[] = []

  for (const [type, key] of MIRRORED) {
    const founded = inEffect.filter((relation) => relation.type === type)

    // The Relation is authoritative: every one in effect needs its mirror on the target …
    for (const { from, to } of founded) {
      const target = byId.get(to)!
      if (!target.metadata.backReferences[key].includes(from)) {
        problems.push({ kind: 'missing-back-reference', adr: to, key, source: from })
      }
      if (type === 'supersedes' && target.metadata.status !== 'superseded') {
        problems.push({ kind: 'not-marked-superseded', adr: to, source: from })
      }
    }

    // … and every Back-reference needs a Relation in effect behind it.
    for (const adr of adrs) {
      for (const source of adr.metadata.backReferences[key]) {
        if (source === adr.id) problems.push({ kind: 'self-reference', adr: adr.id, key })
        else if (!byId.has(source)) {
          problems.push({ kind: 'unknown-target', adr: adr.id, key, target: source })
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

  for (const cycle of supersedesCycles(adrs, relations)) {
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

/**
 * Groups of ADRs that supersede each other in a circle, whatever the state of the Relations:
 * the strongly connected components of the `supersedes` graph with more than one member.
 */
function supersedesCycles(adrs: readonly Adr[], relations: readonly Relation[]): string[][] {
  const next = new Map<string, string[]>()
  for (const { type, from, to } of relations) {
    if (type === 'supersedes') next.set(from, [...(next.get(from) ?? []), to])
  }

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
      if (component.length > 1) cycles.push(component.sort())
    }
  }

  for (const adr of adrs) if (!index.has(adr.id)) visit(adr.id)
  return cycles
}
