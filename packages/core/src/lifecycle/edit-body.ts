import type { Adr } from '../adr/adr'
import type { Plan } from '../plan'
import type { FileSystem } from '@adr-tool/kernel'
import type { DecisionLog } from '../log/load'
import { appendCorrection } from '../metadata/write'
import { editsForLines } from '../text/line-diff'
import { viewSource } from '../text/source'
import { correctionSaid } from './correction'
import type { Today } from './decide'
import { plan } from './pending'
import { refuse, Warnings } from '../sentences'
import { requireOwnFormat } from './rules'

export interface BodyEdit extends Today {
  /** The body the edit started from, exactly as it was read (`Adr.body`). */
  readonly base: string
  /** The new body. Any line break will do; an editor hands over LF. */
  readonly body: string
  /** Who corrects, and what: recorded when the ADR is no longer `proposed`. */
  readonly author?: string
  readonly note?: string
}

/**
 * Replace the body of an ADR. Only the lines that differ are written; every other line
 * keeps its bytes, line break included, and the frontmatter is not part of the edit at all.
 *
 * While an ADR is `proposed` its body is a free file. After that, editing it is a
 * Correction: an entry is appended to `corrections`, and the plan carries warnings when
 * the change looks like more than one.
 */
export function planEditBody(
  fs: FileSystem,
  log: DecisionLog,
  id: string,
  edit: BodyEdit
): Promise<Plan> {
  const warnings = new Warnings()
  const planned = plan(fs, async (pending) => {
    const adr = log.adrs.find((candidate) => candidate.id === id)
    if (!adr) refuse({ code: 'no-adr', values: { id } })
    requireOwnFormat(adr)

    const current = viewSource(await pending.read(adr.path))
    if (current.text.slice(current.bodyStart) !== edit.base) {
      refuse({ code: 'changed-since-edit', values: { adr: id } })
    }
    await pending.write(adr.path, (view) =>
      editsForLines(view.text, view.bodyStart, edit.body, view.eol)
    )
    if (pending.changeSet().files.length === 0) return

    if (!recordsCorrection(adr)) return
    await pending.write(adr.path, (view) =>
      appendCorrection(view, {
        date: edit.today,
        ...(edit.author && { author: edit.author }),
        ...(edit.note && { note: edit.note })
      })
    )
    warnings.push(...correctionSaid(edit.base, edit.body))
  })
  return planned.then((result) => (result.ok ? { ...result, ...warnings.outcome() } : result))
}

/**
 * Whether saving an edit of this ADR records a Correction: it does once the ADR is no
 * longer `proposed`. An ADR whose Status or frontmatter cannot be read is being repaired,
 * not corrected.
 */
export function recordsCorrection(adr: Pick<Adr, 'metadata' | 'metadataWritable'>): boolean {
  const status = adr.metadata.status
  return adr.metadataWritable && status !== undefined && status !== 'proposed'
}
