import type { FileSystem } from '@adr-tool/kernel'
import type { DecisionLog } from '../log/load'
import { replaceInList } from '../metadata/write'
import type { Plan } from '../plan'
import { viewSource } from '../text/source'
import { plan } from './pending'
import { refuse } from '../sentences'
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
      refuse({ code: 'rename-needs-two-ids', values: {} })
    }
    for (const log of logs) {
      for (const adr of log.adrs) {
        if (!adr.metadataWritable) {
          // Nobody can tell what this file names, so nothing may be left behind in it. What
          // its body says is no Trace; a frontmatter that never closes runs to the end.
          const view = viewSource((await fs.readText(adr.path)) ?? '')
          const frontmatter = view.frontmatter
            ? view.text.slice(view.frontmatter.start, view.frontmatter.end)
            : view.text
          if (AFFECTS_LINE.test(frontmatter)) {
            refuse({ code: 'unreadable-has-affects', values: { adr: adr.id, component: from } })
          }
          continue
        }
        const items = adr.metadata.affects.filter((item) => renamed(item) !== undefined)
        if (items.length === 0) continue
        requireOwnFormat(adr, (foreign) => ({
          code: 'foreign-format-names-component',
          values: { ...foreign, component: from }
        }))
        for (const item of items) {
          await pending.write(adr.path, (view) =>
            replaceInList(view, 'affects', item, renamed(item)!)
          )
        }
      }
    }
  })
}
