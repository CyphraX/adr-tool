import { plan, type FileSystem, type Plan } from '@adr-tool/kernel'
import { everyComponent, isSegment, readDeclaration } from './declaration'
import { DECLARATION_PATH, type StructureProblem } from './problems'
import { refuse } from './sentences'
import type { Structure } from './structure'
import { insertComponents, removePattern, renameSegment, renderComponents } from './write'

const asText = (text: string): string => text

/**
 * Adopt (docs/structure-format.md, "The Draft"): make the Draft the declaration — as a new
 * `.arch/components.yml`, or into one that is there and declares nothing. Like every
 * operation it returns a change set and writes nothing itself.
 */
export function planAdopt(fs: FileSystem, structure: Structure): Promise<Plan> {
  return plan(fs, asText, async (pending) => {
    if (structure.origin !== 'draft') {
      refuse({ code: 'declared-already', values: {} })
    }
    if (!structure.canAdopt) {
      refuse(
        structure.components.length === 0
          ? { code: 'nothing-to-adopt', values: {} }
          : { code: 'adopt-over-unreadable', values: { path: DECLARATION_PATH } }
      )
    }
    if ((await fs.readText(DECLARATION_PATH)) === undefined) {
      await pending.create(DECLARATION_PATH, renderComponents(structure.components))
    } else {
      await pending.write(DECLARATION_PATH, (text) => insertComponents(text, structure.components))
    }
  })
}

/** Whether a Problem has a Repair. One has: a pattern that matches no Source File is removed. */
export const hasRepair = (problem: StructureProblem): boolean => problem.kind === 'dead-pattern'

/** The Repair of a Problem, as a change set. A Repair exists only where exactly one change is right. */
export function planRepair(fs: FileSystem, problem: StructureProblem): Promise<Plan> {
  return plan(fs, asText, async (pending) => {
    if (problem.kind !== 'dead-pattern') {
      refuse({ code: 'no-repair', values: {} })
    }
    await pending.write(DECLARATION_PATH, (text) =>
      removePattern(text, problem.component, problem.key, problem.pattern)
    )
  })
}

/** What a Rename tells its caller: the ID before and after, for the Traces and the view to follow. */
export type RenamePlan = Plan<{ readonly renamed: { readonly from: string; readonly to: string } }>

/**
 * Rename (docs/structure-format.md, section 1): give the declared Component `id` a new segment,
 * in `.arch/components.yml` as it is on disk now. This is the declaration's half; what names
 * the Component elsewhere — the Traces of the ADRs — is the caller's to rewrite with it.
 */
export async function planRename(fs: FileSystem, id: string, segment: string): Promise<RenamePlan> {
  const parent = id.includes('/') ? id.slice(0, id.lastIndexOf('/') + 1) : ''
  const to = parent + segment
  const planned = await plan(fs, asText, async (pending) => {
    if (!isSegment(segment)) {
      refuse({ code: 'not-a-segment', values: { segment } })
    }
    const declaration = readDeclaration(await fs.readText(DECLARATION_PATH))
    if (declaration.kind === 'absent') {
      refuse({ code: 'rename-needs-declaration', values: {} })
    }
    if (declaration.kind === 'unreadable') {
      refuse({
        code: 'unreadable-declaration',
        values: { path: DECLARATION_PATH, detail: declaration.said }
      })
    }
    const declared = new Set(everyComponent(declaration.components).map((one) => one.id))
    if (!declared.has(id)) {
      refuse({ code: 'not-declared', values: { path: DECLARATION_PATH, id } })
    }
    if (to === id) refuse({ code: 'segment-unchanged', values: { id } })
    if (declared.has(to)) refuse({ code: 'component-exists', values: { id: to } })
    await pending.write(DECLARATION_PATH, (text) => renameSegment(text, id, segment))
  })
  return planned.ok ? { ...planned, renamed: { from: id, to } } : planned
}
