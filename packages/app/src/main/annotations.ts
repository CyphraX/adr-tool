/**
 * The Review module's side of the open repositories (docs/plan-vision.md, part 9): their
 * Annotations, read with `review` and their Anchors found again in the code as it is on disk
 * (docs/review-format.md, section 4), in the background. A repository is looked at again when
 * HEAD moves, when the Annotations change, or when the files they are about do; until the new
 * result is there, the last one is what the window gets. Nothing here writes: a write is planned
 * as a change set and held by `Repositories`, as every other one.
 */
import { dirname, join } from 'node:path'
import { watch } from 'chokidar'
import { lookAtAnnotations } from '@adr-tool/cli/annotations'
import { openRepository, type Plan } from '@adr-tool/core'
import {
  adrReferencesOf,
  findAnchor,
  planAnnotation,
  planAttach,
  planCite,
  planReply,
  planState,
  planUncite,
  planUpdateAnchor,
  readAnnotations,
  type AdrReference,
  type Found
} from '@adr-tool/review'
import type { ReviewOverview, ReviewRequest } from '../shared/ipc'
import { gitIn, type Git } from './git'
import { nodeFileSystem } from './node-file-system'
import { localDate } from './repositories'

/** Git and editors touch several files at once; one look covers them all. */
const LOOK_AGAIN_DELAY_MS = 300

/** What a look at a repository found, and what has to be watched to know when to look again. */
export interface Looked {
  readonly overview: Omit<ReviewOverview, 'repositoryId' | 'finding' | 'failed'>
  /** Absolute paths, each watched one level deep. */
  readonly watch: readonly string[]
}

/** How a repository is looked at: `lookAt` unless a test says otherwise. */
export type Look = (root: string) => Promise<Looked>

/** What watches paths, and is told to stop. */
export type WatchPaths = (
  paths: readonly string[],
  changed: () => void
) => { close(): Promise<void> }

const chokidar: WatchPaths = (paths, changed) =>
  watch([...paths], { depth: 0, ignoreInitial: true }).on('all', changed)

/**
 * Look at the Annotations of the repository at `root`: read them, check their Traces against
 * the ADRs, and find each Anchor again with one cache for the run — HEAD and the changes since a
 * commit are read once for all of them.
 */
export async function lookAt(root: string, git: Git = gitIn(root)): Promise<Looked> {
  const fs = nodeFileSystem(root)
  const looked = await lookAtAnnotations(fs, git, adrReferencesOf((await openRepository(fs)).logs))
  const { directory } = looked

  // What is watched: the settings, the Annotations and their Replies, the files the Anchors
  // name and where they are found — a directory each, so that a rename is seen —, and what
  // git changes when somebody commits or checks out.
  const sources = new Set<string>()
  for (const annotation of looked.annotations) {
    if (annotation.anchor) sources.add(dirname(annotation.anchor.path))
    const now = annotation.found
    if (now && now.kind !== 'orphaned') sources.add(dirname(now.anchor.path))
  }
  const replies = directory
    ? ((await fs.list(directory)) ?? [])
        .filter((entry) => entry.kind === 'directory')
        .map((entry) => join(directory, entry.name))
    : []
  const gitDirectory = await git.directory()
  const paths = [
    join(root, '.arch'),
    ...(directory ? [join(root, directory), ...replies.map((path) => join(root, path))] : []),
    ...[...sources].map((path) => join(root, path)),
    ...(gitDirectory ? ['HEAD', 'logs/HEAD'].map((file) => join(gitDirectory, file)) : [])
  ]

  return {
    overview: {
      directory,
      // Neither a directory nor a Problem of Review: the file of the settings cannot be read.
      configUnreadable: looked.unreadableConfig !== undefined,
      annotations: looked.annotations,
      problems: looked.problems,
      head: looked.head,
      foundAt: Date.now()
    },
    watch: [...new Set(paths)].sort()
  }
}

interface Entry {
  readonly root: string
  last?: Looked['overview']
  running?: Promise<void>
  /** Something changed while a look was running: it runs again when it is done. */
  again: boolean
  /** A look is due: it starts when the timer goes off. */
  timer?: NodeJS.Timeout
  /** Why the last look failed, while the result before it is what the window gets. */
  failed?: string
  watcher?: { close(): Promise<void> }
  watched: readonly string[]
}

/**
 * The Annotations of the open repositories, each looked at in the background and again when
 * what they depend on changes. `onChanged` says that a look began or ended: the window asks
 * again, and gets the last result with `finding` set while one runs.
 */
export class Annotations {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly onChanged: (repositoryId: string) => void,
    private readonly look: Look = lookAt,
    private readonly watchPaths: WatchPaths | false = chokidar
  ) {}

  /**
   * The last result, or the first one once it is there. `finding` while a look runs or is due —
   * from the moment something changed, so that a write just applied is not taken for undone —,
   * and `failed` when the last look failed and an earlier result is what is shown.
   */
  async overview(repositoryId: string, root: string): Promise<ReviewOverview> {
    const entry = this.entryOf(repositoryId, root)
    if (!entry.last) await this.run(repositoryId, entry)
    return {
      repositoryId,
      ...entry.last!,
      finding: entry.running !== undefined || entry.timer !== undefined,
      ...(entry.failed !== undefined && { failed: entry.failed })
    }
  }

  /** Look again soon, if the repository was looked at at all. */
  refresh(repositoryId: string): void {
    const entry = this.entries.get(repositoryId)
    if (!entry) return
    clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      entry.timer = undefined
      if (entry.running) {
        entry.again = true
        return
      }
      // Done or failed, the window asks again: the new result, or the last one and why not.
      const done = (): void => this.onChanged(repositoryId)
      void this.run(repositoryId, entry).then(done, done)
      // The window shows that the Anchors are looked for again.
      this.onChanged(repositoryId)
    }, LOOK_AGAIN_DELAY_MS)
  }

  async close(repositoryId: string): Promise<void> {
    const entry = this.entries.get(repositoryId)
    if (!entry) return
    this.entries.delete(repositoryId)
    clearTimeout(entry.timer)
    await entry.watcher?.close()
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((id) => this.close(id)))
  }

  private entryOf(repositoryId: string, root: string): Entry {
    let entry = this.entries.get(repositoryId)
    if (!entry || entry.root !== root) {
      if (entry) {
        clearTimeout(entry.timer)
        void entry.watcher?.close()
      }
      entry = { root, again: false, watched: [] }
      this.entries.set(repositoryId, entry)
    }
    return entry
  }

  private run(repositoryId: string, entry: Entry): Promise<void> {
    if (entry.running) return entry.running
    const running = this.look(entry.root).then(
      (looked) => {
        entry.running = undefined
        if (this.entries.get(repositoryId) !== entry) return
        entry.last = looked.overview
        entry.failed = undefined
        this.watch(repositoryId, entry, looked.watch)
        this.again(repositoryId, entry)
      },
      (error: unknown) => {
        entry.running = undefined
        if (this.entries.get(repositoryId) === entry) {
          entry.failed = String(error)
          this.again(repositoryId, entry)
        }
        throw error
      }
    )
    entry.running = running
    return running
  }

  /** What changed while a look ran is looked at once it is done, whether it found or failed. */
  private again(repositoryId: string, entry: Entry): void {
    if (!entry.again) return
    entry.again = false
    this.refresh(repositoryId)
  }

  /** (Re)start the watcher when the paths changed: an Annotation on a file of another directory. */
  private watch(repositoryId: string, entry: Entry, paths: readonly string[]): void {
    if (!this.watchPaths) return
    if (entry.watcher && paths.join('\n') === entry.watched.join('\n')) return
    void entry.watcher?.close()
    entry.watched = paths
    entry.watcher = this.watchPaths(paths, () => this.refresh(repositoryId))
  }
}

/**
 * Plan a write to the Annotations of the repository at `root` (docs/review-format.md, section
 * 5): against the disk as it is now, the day and the moment as the person's clock has them, and
 * the ADRs the repository has. Update the Anchor looks for the Anchor again first: what the
 * window last saw is not taken for where it is.
 */
export async function planReview(
  root: string,
  request: ReviewRequest,
  now = new Date(),
  git: Git = gitIn(root)
): Promise<Plan> {
  const fs = nodeFileSystem(root)
  const adrs = async (): Promise<AdrReference[]> => adrReferencesOf((await openRepository(fs)).logs)
  switch (request.kind) {
    case 'create':
      return planAnnotation(
        fs,
        git,
        {
          type: request.type,
          author: request.author,
          date: localDate(now),
          lines: { path: request.path, start: request.start, end: request.end },
          text: request.text,
          cites: request.cites
        },
        await adrs()
      )
    case 'reply':
      return planReply(fs, request.id, {
        author: request.author,
        date: localDate(now),
        time: now.toISOString(),
        text: request.text
      })
    case 'state':
      return planState(fs, request.id, request.state)
    case 'update-anchor': {
      const annotation = (await readAnnotations(fs)).annotations.find(
        (one) => one.id === request.id
      )
      const found: Found = annotation?.anchor
        ? await findAnchor(annotation.anchor, { fs, git }, annotation.date)
        : { kind: 'orphaned', file: 'gone' }
      return planUpdateAnchor(fs, request.id, found)
    }
    case 'attach':
      return planAttach(fs, git, request.id, request)
    case 'cite':
      return planCite(fs, request.id, request.adr, await adrs())
    case 'uncite':
      return planUncite(fs, request.id, request.adr)
  }
}
