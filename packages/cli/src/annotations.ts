import {
  KERNEL_SENTENCES,
  openConfig,
  sentenceOf,
  type FileSystem,
  type Git,
  type UnreadableConfig
} from '@adr-tool/kernel'
import {
  findAnchors,
  findingCache,
  readAnnotations,
  traceProblems,
  type AdrReference,
  type Annotation,
  type Found,
  type ReviewProblem
} from '@adr-tool/review'

/** An Annotation with what became of its Anchor in the code as it is now. */
export interface FoundAnnotation extends Annotation {
  /** Absent for an Annotation without an Anchor that can be read. */
  readonly found?: Found
}

/** What a look at the Annotations of a repository finds (docs/review-format.md). */
export interface LookedAnnotations {
  /** Where they are; `undefined` while the settings, or their key `annotations`, cannot be used. */
  readonly directory: string | undefined
  /** `.arch/config.yml` cannot be read: no Annotation is read until it is fixed. */
  readonly unreadableConfig: UnreadableConfig | undefined
  readonly annotations: readonly FoundAnnotation[]
  /** Of their files, of their Traces to ADRs, and the orphaned ones. */
  readonly problems: readonly ReviewProblem[]
  /** The commit HEAD points at, which the Anchors were found against; `undefined` without one. */
  readonly head: string | undefined
}

/**
 * Look at the Annotations of the repository behind `fs` as the app, `adr check` and the MCP
 * server do: read them and their Replies, check their Traces against `adrs`, and find each
 * Anchor again in the code, with one cache for the run — HEAD, and the changes since a
 * commit, are read once for all of them. Never writes.
 */
export async function lookAtAnnotations(
  fs: FileSystem,
  git: Git,
  adrs: readonly AdrReference[]
): Promise<LookedAnnotations> {
  const config = await openConfig(fs)
  const reading = await readAnnotations(fs, config)
  const cache = findingCache()
  const finding = await findAnchors(reading.annotations, { fs, git, cache })
  const head = await (cache.head ??= git.headCommit())
  return {
    directory: reading.directory,
    unreadableConfig: config.readable ? undefined : config.problem,
    annotations: reading.annotations.map((annotation) => {
      const found = finding.found.get(annotation.id)
      return found ? { ...annotation, found } : annotation
    }),
    problems: [
      ...reading.problems,
      ...traceProblems(reading.annotations, adrs),
      ...finding.problems
    ],
    head
  }
}

/** What the kernel says of `.arch/config.yml` that cannot be read, in English. */
export const unreadableConfigSentence = (problem: UnreadableConfig): string =>
  sentenceOf(KERNEL_SENTENCES, problem.said)
