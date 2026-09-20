import {
  PendingFiles as Pending,
  plan as planWith,
  Refusal,
  type FileSystem
} from '@adr-tool/kernel'
import type { Plan } from '../plan'
import { viewSource, type SourceView } from '../text/source'

export { Refusal }

/** The files an operation on a Decision Log is about to change, each seen as frontmatter and body. */
export type PendingFiles = Pending<SourceView>

/** Pending files outside of a plan: to try whether something can be written at all. */
export const pendingFiles = (fs: FileSystem): PendingFiles => new Pending(fs, viewSource)

/** Run an operation's planning; a Refusal — Metadata that cannot be written is one — becomes the reason. */
export function plan(
  fs: FileSystem,
  build: (pending: PendingFiles) => Promise<void>
): Promise<Plan> {
  return planWith(fs, viewSource, build)
}
