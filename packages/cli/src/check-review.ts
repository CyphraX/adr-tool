import type { FileSystem, Git } from '@adr-tool/kernel'
import { wordingOf, type AdrReference, type ReviewProblem } from '@adr-tool/review'
import { lookAtAnnotations } from './annotations'

/** A Problem of Review, as `adr check` reports it. */
export interface ReviewEntry {
  readonly code: ReviewProblem['kind']
  readonly message: string
  /** The file it is about: an Annotation, a directory of Replies, or `.arch/config.yml`. */
  readonly path: string
  /** Where the file says one: the line of the key `annotations`. */
  readonly line?: number
  readonly problem: ReviewProblem
}

/** What `adr check` found of the Annotations (docs/cli.md, "adr check"). */
export interface ReviewCheck {
  /** Where they are; `undefined` while `.arch/config.yml` says nothing that can be used. */
  readonly directory: string | undefined
  /** How many Annotations were read. */
  readonly annotations: number
  /** The Problems that fail the check: of their files, and of their Traces to ADRs. */
  readonly problems: readonly ReviewEntry[]
  /**
   * The orphaned ones: notes, which fail nothing. The code moved on under the remark, and
   * only a person knows where it belongs now.
   */
  readonly orphaned: readonly ReviewEntry[]
}

const entryOf = (problem: ReviewProblem): ReviewEntry => ({
  code: problem.kind,
  message: wordingOf(problem),
  path: problem.path,
  ...('line' in problem && { line: problem.line }),
  problem
})

/**
 * Check the Annotations of the repository behind `fs` as the app shows them: read them and
 * their Replies, check their Traces against `adrs`, and find each Anchor again in the code as
 * it is on disk, with git's help (docs/review-format.md, sections 4 and 6). Never writes.
 */
export async function checkReview(
  fs: FileSystem,
  git: Git,
  adrs: readonly AdrReference[]
): Promise<ReviewCheck> {
  const looked = await lookAtAnnotations(fs, git, adrs)
  const orphaned = looked.problems.filter((problem) => problem.kind === 'orphaned')
  return {
    directory: looked.directory,
    annotations: looked.annotations.length,
    problems: looked.problems.filter((problem) => problem.kind !== 'orphaned').map(entryOf),
    orphaned: orphaned.map(entryOf)
  }
}
