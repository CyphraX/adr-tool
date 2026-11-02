import type { FileSystem } from '@adr-tool/kernel'
import type { DecisionLog } from '../log/load'
import { replaceInList } from '../metadata/write'
import type { Plan } from '../plan'
import { Refusal, plan } from './pending'
import { requireOwnFormat } from './rules'

/** A line of a frontmatter that holds `affects`, as far as text that cannot be parsed tells. */
const AFFECTS_LINE = /^affects[ \t]*:/m

/**
 * The ADRs' half of a Component's Rename (docs/file-format.md, section 5): wherever an ADR of
 * any of the logs names the Component `from`, or a Component below it, in `affects`, the item
 * is rewritten to name `to` where it stands. Whether `to` is a valid new ID is Structure's to
 * say, which plans the declaration's half; the caller puts the two together.
 */
export function planRenameTraces(
  fs: FileSystem,
  logs: readonly DecisionLog[],
  from: string,
  to: string
): Promise<Plan> {
  const renamed = (item: string): string | undefined =>
    item === from ? to : item.startsWith(`${from}/`) ? to + item.slice(from.length) : undefined

  return plan(fs, async (pending) => {
    if (from === '' || to === '' || from === to) {
      throw new Refusal('A Rename needs an old and a new Component ID that differ.')
    }
    for (const log of logs) {
      for (const adr of log.adrs) {
        if (!adr.metadataWritable) {
          // Nobody can tell what this file names, so nothing may be left behind in it.
          if (AFFECTS_LINE.test((await fs.readText(adr.path)) ?? '')) {
            throw new Refusal(
              `The frontmatter of ${adr.id} cannot be read, and it has a list "affects". Fix it before ${from} is renamed.`
            )
          }
          continue
        }
        const items = adr.metadata.affects.filter((item) => renamed(item) !== undefined)
        if (items.length === 0) continue
        requireOwnFormat(adr, ` It names ${from} in affects: migrate it first.`)
        for (const item of items) {
          await pending.write(adr.path, (view) =>
            replaceInList(view, 'affects', item, renamed(item)!)
          )
        }
      }
    }
  })
}
