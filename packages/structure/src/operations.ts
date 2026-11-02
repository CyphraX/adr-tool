import { plan, Refusal, type FileSystem, type Plan } from '@adr-tool/kernel'
import { everyComponent, isSegment, readDeclaration } from './declaration'
import { DECLARATION_PATH, SEGMENT_RULE, type StructureProblem } from './problems'
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
      throw new Refusal('The Components of this repository are declared already.')
    }
    if (!structure.canAdopt) {
      throw new Refusal(
        structure.components.length === 0
          ? 'There is nothing to adopt: the Draft has no Components.'
          : `${DECLARATION_PATH} is there and cannot be read. Adopting would overwrite what a person wrote; fix the file first.`
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
      throw new Refusal('This Problem has no Repair: the suite cannot know what was meant.')
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
      throw new Refusal(`"${segment}" is not a valid segment of a Component ID. ${SEGMENT_RULE}`)
    }
    const declaration = readDeclaration(await fs.readText(DECLARATION_PATH))
    if (declaration.kind === 'absent') {
      throw new Refusal('Only a declared Component can be renamed. Adopt the Draft first.')
    }
    if (declaration.kind === 'unreadable') {
      throw new Refusal(`${DECLARATION_PATH} cannot be read: ${declaration.detail}`)
    }
    const declared = new Set(everyComponent(declaration.components).map((one) => one.id))
    if (!declared.has(id)) {
      throw new Refusal(`${DECLARATION_PATH} declares no Component ${id}. Look at the file again.`)
    }
    if (to === id) throw new Refusal(`${id} has that segment already.`)
    if (declared.has(to)) throw new Refusal(`There is a Component ${to} already.`)
    await pending.write(DECLARATION_PATH, (text) => renameSegment(text, id, segment))
  })
  return planned.ok ? { ...planned, renamed: { from: id, to } } : planned
}
