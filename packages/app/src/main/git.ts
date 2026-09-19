import { execFile } from 'node:child_process'
import type { GitState } from '../shared/ipc'

/** One commit in the history of one file. */
export interface FileCommit {
  readonly sha: string
  readonly author: string
  /** The author date, ISO 8601. */
  readonly date: string
  readonly subject: string
  /** Where the file was after this commit, and before it: a Renumber renames. */
  readonly path: string
  readonly previousPath: string
}

/** A file's text before and after a commit. */
export interface CommittedChange {
  readonly path: string
  readonly before: string
  readonly after: string
}

export interface Git {
  /** The branch, and every file below the directory with uncommitted changes, new ones included. */
  state(): Promise<GitState | undefined>
  /** The commits that changed a file, newest first, through every rename. */
  history(path: string): Promise<FileCommit[]>
  /** What a commit did to the file. */
  change(commit: FileCommit): Promise<CommittedChange>
  /** The file as the last commit has it; `undefined` when it is new. */
  head(path: string): Promise<string | undefined>
  /** Where git keeps HEAD and the index: what changes when somebody commits or switches branches. */
  directory(): Promise<string | undefined>
}

const FIELD = '\x1f'
const RECORD = '\x1e'

/**
 * The system's git, read-only, for one opened directory (docs/plan.md, decision 2): users
 * have git by definition, and its behaviour is the reference. The directory may lie below
 * the top of its repository; every path here is relative to the directory.
 *
 * Without git, or outside a repository, everything degrades to "nothing": no state, no history.
 */
export function gitIn(root: string, executable = 'git'): Git {
  /** The output of a git command as bytes-preserving text, or `undefined` when it fails. */
  const run = (args: string[]): Promise<string | undefined> =>
    new Promise((resolve) => {
      execFile(
        executable,
        // Never page, never take a lock for the sake of a read, never escape non-ASCII paths.
        ['--no-pager', '--no-optional-locks', '-c', 'core.quotepath=off', ...args],
        { cwd: root, timeout: 15_000, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
        (error, stdout) => resolve(error ? undefined : stdout)
      )
    })

  /** `service/` when the directory is `service` below the top of the repository. */
  const prefix = async (): Promise<string | undefined> =>
    (await run(['rev-parse', '--show-prefix']))?.replace(/\r?\n$/, '')

  const below = (prefix: string, path: string): string | undefined =>
    path.startsWith(prefix) ? path.slice(prefix.length) : undefined

  /** A file as a revision has it. `./` makes the path relative to the directory. */
  const show = (revision: string, path: string): Promise<string | undefined> =>
    run(['show', `${revision}:./${path}`])

  return {
    async state(): Promise<GitState | undefined> {
      const [inside, status] = await Promise.all([
        prefix(),
        run(['status', '--porcelain', '-z', '--untracked-files=all', '--', '.'])
      ])
      if (inside === undefined || status === undefined) return undefined
      const branch = (await run(['symbolic-ref', '--short', '-q', 'HEAD']))?.trim()

      // `XY path`, NUL-terminated, relative to the top; a rename is followed by where it came from.
      const changed: string[] = []
      const entries = status.split('\0')
      for (let position = 0; position < entries.length; position++) {
        const entry = entries[position]!
        if (entry.length < 4) continue
        const path = below(inside, entry.slice(3))
        if (path !== undefined) changed.push(path)
        if (entry[0] === 'R' || entry[0] === 'C') position++
      }
      return { branch: branch === '' ? undefined : branch, changed: changed.sort() }
    },

    async history(path: string): Promise<FileCommit[]> {
      const inside = await prefix()
      const format = ['%H', '%an', '%aI', '%s'].join(FIELD)
      const log =
        inside === undefined
          ? undefined
          : await run([
              'log',
              '--follow',
              '-M',
              '--name-status',
              `--format=${RECORD}${format}`,
              '--',
              path
            ])
      if (inside === undefined || log === undefined) return []

      return log
        .split(RECORD)
        .slice(1)
        .flatMap((record) => {
          const [header, ...rest] = record.split('\n')
          const [sha, author, date, subject] = header!.split(FIELD)
          // `M\tpath`, or `R100\tfrom\tto`.
          const names = rest
            .find((line) => line.includes('\t'))
            ?.trimEnd()
            .split('\t')
            .slice(1)
          const now = names?.at(-1) && below(inside, names.at(-1)!)
          const before = names?.[0] && below(inside, names[0])
          if (!sha || !author || !date || subject === undefined || !now) return []
          return [{ sha, author, date, subject, path: now, previousPath: before || now }]
        })
    },

    async change(commit: FileCommit): Promise<CommittedChange> {
      const [before, after] = await Promise.all([
        show(`${commit.sha}^`, commit.previousPath),
        show(commit.sha, commit.path)
      ])
      return { path: commit.path, before: before ?? '', after: after ?? '' }
    },

    head(path: string): Promise<string | undefined> {
      return show('HEAD', path)
    },

    async directory(): Promise<string | undefined> {
      return (await run(['rev-parse', '--absolute-git-dir']))?.trim()
    }
  }
}
