import { plan, Refusal, type FileSystem, type Plan } from '@adr-tool/kernel'
import { DECLARATION_PATH, type StructureProblem } from './problems'
import type { Structure } from './structure'
import { insertComponents, removePattern, renderComponents } from './write'

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
