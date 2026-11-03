import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { win32 } from 'node:path'
import {
  isDay,
  isObjectName,
  normalizePath,
  type ChangedFile,
  type Git,
  type LogEntry,
  type LogOptions
} from '@adr-tool/kernel'

export { within } from './files'
export type { ChangedFile, Git, LogEntry, LogOptions }

/**
 * The system's git, as the app's main process and the command line run it: the one place
 * that does (docs/adr/0020-git-is-a-port-of-the-kernel-implemented-once-for-node.md). The
 * kernel's port is what the cores read; the app reads more of git for Decisions — the working
 * tree, the history of an ADR, the branches —, and that is here too, so that every run of git
 * goes through the same hardening.
 */

/**
 * The git to run. On Windows a bare `git` is looked for in the directory it runs in before
 * the PATH — a `git.exe` a repository brings along would run — so git is found on the PATH
 * there, by its full path.
 */
export function gitExecutable(
  platform: NodeJS.Platform = process.platform,
  path: string | undefined = process.env.PATH,
  exists: (path: string) => boolean = existsSync
): string {
  if (platform !== 'win32') return 'git'
  for (const entry of (path ?? '').split(';')) {
    const directory = entry.replace(/^"(.*)"$/, '$1')
    if (!win32.isAbsolute(directory)) continue
    const candidate = win32.join(directory, 'git.exe')
    if (exists(candidate)) return candidate
  }
  return 'git'
}

/**
 * What every run of git starts with, reading or committing: no pager, a file name is a file
 * name and never a pattern, paths as they are, and no fsmonitor, which is a program the
 * repository's configuration may name.
 */
export const GIT_OPTIONS: readonly string[] = [
  '--no-pager',
  '--literal-pathspecs',
  '-c',
  'core.quotepath=off',
  '-c',
  'core.fsmonitor=false'
]

/**
 * What every read adds: no optional locks, and no transport at all, so that a partial clone
 * fetches nothing it lacks — with `GIT_NO_LAZY_FETCH` (`READ_ENVIRONMENT`), and with
 * `protocol.allow` for gits older than that, which would run the `core.sshCommand` of the
 * repository's configuration to fetch.
 */
export const READ_OPTIONS: readonly string[] = [
  '--no-optional-locks',
  ...GIT_OPTIONS,
  '-c',
  'protocol.allow=never'
]

/** What every read runs with besides the environment it inherits. */
export const READ_ENVIRONMENT: Readonly<Record<string, string>> = { GIT_NO_LAZY_FETCH: '1' }

/**
 * What a read of a diff or a log adds: no colours a configuration asks for, no external diff,
 * no textconv — programs the configuration names — and no signature checks.
 */
const DIFF_OPTIONS = ['--no-color', '--no-ext-diff', '--no-textconv']

/**
 * What a log or a diff is read with whatever the configuration says about showing one: paths
 * from the top of the repository, the files of the first commit, and text in UTF-8.
 */
const SHOWN_AS_IT_IS = ['-c', 'diff.relative=false', '-c', 'log.showRoot=true']

/** What git says about the working tree below the directory that was opened. */
export interface WorkingTree {
  /** The branch that is checked out; `undefined` on a detached HEAD. */
  readonly branch: string | undefined
  /** Files with uncommitted changes, new ones included. Sorted. */
  readonly changed: readonly string[]
  /** Files that are gone from the working tree and still in the last commit. */
  readonly deleted: readonly string[]
  /** Renames git already knows about (they are staged): where a file came from. */
  readonly renamedFrom: Readonly<Record<string, string>>
}

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

/** A branch that is not checked out: one commit, and every name git has for it. */
export interface Branch {
  /** `feature/kafka`, `origin/feature/kafka`: local branches first. */
  readonly names: readonly string[]
  readonly sha: string
  /** When its last commit was made, ISO 8601. */
  readonly date: string
}

/** An entry of a directory as a commit has it: a file and its blob, or a directory and its tree. */
export interface TreeEntry {
  readonly name: string
  readonly kind: 'file' | 'directory'
  readonly object: string
}

/** The kernel's port, and what the app reads of git besides. */
export interface RepositoryGit extends Git {
  workingTree(): Promise<WorkingTree | undefined>
  /** The commits that changed a file, newest first, through every rename. */
  history(path: string): Promise<FileCommit[]>
  /** A file's text as a commit left it, or as it was just before. `undefined`: it was not there. */
  text(commit: FileCommit, side: 'before' | 'after'): Promise<string | undefined>
  /** The file as the last commit has it; `undefined` when it is new. */
  head(path: string): Promise<string | undefined>
  /** `user.name` from git's configuration, if it knows one. */
  userName(): Promise<string | undefined>
  /** Where git keeps HEAD and the index: what changes when somebody commits or switches branches. */
  directory(): Promise<string | undefined>
  /**
   * The files the directory consists of: what git tracks and is still there, plus what it
   * neither tracks nor ignores (docs/structure-format.md, section 2). Sorted. `undefined`
   * without git.
   */
  files(): Promise<string[] | undefined>
  /** Whether the repository is a shallow clone: its history ends somewhere. */
  shallow(): Promise<boolean>
  /**
   * The local and remote-tracking branches that are not merged into HEAD, other than the one
   * that is checked out, the most recently committed to first, at most `MAX_BRANCHES`
   * commits. `undefined` when git could not list them.
   */
  branches(): Promise<Branch[] | undefined>
  /**
   * The commit that HEAD and `sha` last had in common; `null` when they have none, `undefined`
   * when git could not tell.
   */
  mergeBase(sha: string): Promise<string | null | undefined>
  /**
   * The tree of the directory as a commit has it; `null` when the commit does not have the
   * directory, `undefined` when git could not tell.
   */
  directoryTree(sha: string): Promise<string | null | undefined>
  /**
   * What a tree holds: its files and its directories, without symbolic links and submodules.
   * `undefined` when git could not read it.
   */
  treeEntries(tree: string): Promise<TreeEntry[] | undefined>
  /**
   * The text of blobs, by their names, in few reads of git. A blob too large to be an ADR is
   * `null`; one that git does not have is left out. `undefined` when git failed.
   */
  blobs(names: readonly string[]): Promise<Map<string, string | null> | undefined>
}

/** How many branches are read at most: those with the most recent commits. */
export const MAX_BRANCHES = 50

/** A file larger than this is no ADR, and is not read from a branch. */
const MAX_BLOB_BYTES = 1024 * 1024

/** How much one read of blobs asks git for at most: well below what a command may print. */
const MAX_BATCH_BYTES = 16 * 1024 * 1024

const FIELD = '\x1f'
const RECORD = '\x1e'

/** A path of the port as it may go to git: relative, inside the directory, never an option. */
const safePath = (path: string): boolean =>
  path !== '' && normalizePath(path) === path && !path.includes('\0')

/** A status of `--name-status`: `M`, `A`, `D`, `T`, or `R`/`C` with a score. */
const STATUS = /^[ACDMRTUXB]\d*$/

/**
 * The system's git, read-only, for one opened directory (docs/plan.md, decision 2): users
 * have git by definition, and its behaviour is the reference. The directory may lie below
 * the top of its repository; every path here is relative to the directory.
 *
 * Without git, or outside a repository, everything degrades to "nothing": no state, no history.
 *
 * A repository is untrusted input, its configuration included. Nothing here takes a lock,
 * pages, or runs a program the repository names: no fsmonitor, no signature check, no
 * textconv or external diff, no filter (`cat-file blob` prints the blob as it is, and status
 * runs with every filter driver emptied), no submodule, and no fetch of an object a partial
 * clone lacks, which would run the transport the configuration names.
 */
export function gitIn(root: string, executable = gitExecutable()): RepositoryGit {
  /** The output of a git command, or how it ended when it failed: its exit code, if it exited. */
  const call = (
    args: string[],
    input?: string
  ): Promise<{ stdout: Buffer } | { stdout?: undefined; code: number | undefined }> =>
    new Promise((resolve) => {
      const child = execFile(
        executable,
        [...READ_OPTIONS, ...args],
        {
          cwd: root,
          env: { ...process.env, ...READ_ENVIRONMENT },
          timeout: 15_000,
          maxBuffer: 64 * 1024 * 1024,
          windowsHide: true,
          encoding: 'buffer'
        },
        (error, stdout) =>
          resolve(
            error ? { code: typeof error.code === 'number' ? error.code : undefined } : { stdout }
          )
      )
      // Without input, git must not wait for any.
      child.stdin?.on('error', () => undefined)
      child.stdin?.end(input)
    })
  /** The output of a git command, or `undefined` when it fails. */
  const output = async (args: string[], input?: string): Promise<Buffer | undefined> =>
    (await call(args, input)).stdout
  /** The output of a git command, read as UTF-8, or `undefined` when it fails. */
  const run = async (args: string[], input?: string): Promise<string | undefined> =>
    (await output(args, input))?.toString('utf8')

  /**
   * The options that empty every filter driver the configuration names, so that `git status`
   * does not run its `clean` command or `process` on a file whose stat changed. `undefined`
   * for a driver whose name cannot be passed with `-c` — it holds a `=` —: then status is
   * not run at all.
   */
  const withoutFilters = async (): Promise<string[] | undefined> => {
    const done = await call(['config', '--null', '--name-only', '--get-regexp', '^filter\\.'])
    // It exits with 1 when nothing matches.
    if (done.stdout === undefined) return done.code === 1 ? [] : undefined
    const drivers = new Set(
      done.stdout
        .toString('utf8')
        .split('\0')
        .filter((key) => key.startsWith('filter.') && key.lastIndexOf('.') > 'filter.'.length)
        .map((key) => key.slice('filter.'.length, key.lastIndexOf('.')))
    )
    if ([...drivers].some((driver) => driver.includes('='))) return undefined
    return [...drivers].flatMap((driver) =>
      ['clean=', 'smudge=', 'process=', 'required=false'].flatMap((setting) => [
        '-c',
        `filter.${driver}.${setting}`
      ])
    )
  }

  /** `service/` when the directory is `service` below the top of the repository. */
  const folder = async (): Promise<string | undefined> =>
    (await run(['rev-parse', '--show-prefix']))?.replace(/\r?\n$/, '')

  const below = (folder: string, path: string | undefined): string | undefined =>
    path?.startsWith(folder) ? path.slice(folder.length) : undefined

  const headCommit = async (): Promise<string | undefined> => {
    const head = (await run(['rev-parse', '--verify', '--quiet', 'HEAD']))?.trim()
    return head !== undefined && isObjectName(head) ? head : undefined
  }

  /**
   * A file as a revision has it: the blob, and nothing but a blob. `./` makes the path
   * relative to the directory.
   */
  const show = (revision: string, path: string): Promise<string | undefined> =>
    run(['cat-file', 'blob', `${revision}:./${path}`])

  /**
   * The files of `--name-status -z` from `tokens[at]` on, relative to the directory, until a
   * token that is no status: `M`, `path` — or `R100`, `from`, `to`. A file that leaves the
   * directory is gone from it, one that comes in is new. Where the files end, `next` says.
   */
  const filesOf = (
    tokens: readonly string[],
    at: number,
    top: string
  ): { changes: ChangedFile[]; next: number } => {
    const changes: ChangedFile[] = []
    let position = at
    for (;;) {
      const status = tokens[position]?.replace(/^\n/, '')
      if (status === undefined || !STATUS.test(status)) break
      const pair = /^[RC]/.test(status)
      const first = below(top, tokens[position + 1])
      const second = pair ? below(top, tokens[position + 2]) : undefined
      position += pair ? 3 : 2
      if (status.startsWith('R')) {
        if (first !== undefined && second !== undefined) {
          changes.push({ kind: 'renamed', path: second, from: first })
        } else if (second !== undefined) changes.push({ kind: 'added', path: second })
        else if (first !== undefined) changes.push({ kind: 'deleted', path: first })
        continue
      }
      // A copy leaves its source where it was: the copy is a new file.
      const path = status.startsWith('C') ? second : first
      if (path === undefined) continue
      const kind =
        status === 'A' || status.startsWith('C') ? 'added' : status === 'D' ? 'deleted' : 'modified'
      changes.push({ kind, path })
    }
    return { changes, next: position }
  }

  /** `git log` with the files of each commit; `--follow` for a single file. */
  const logOf = async (options: LogOptions): Promise<LogEntry[] | undefined> => {
    if (options.path !== undefined && !safePath(options.path)) return []
    if (options.since !== undefined && !isDay(options.since)) return undefined
    if (options.limit !== undefined && !(Number.isInteger(options.limit) && options.limit > 0)) {
      return undefined
    }
    const top = await folder()
    if (top === undefined) return undefined
    if ((await headCommit()) === undefined) return []
    // Each field a token of its own: git prints a name or a subject only up to a NUL in it.
    const format = ['%H', '%P', '%aI', '%an', '%s'].join('%x00')
    const log = await run([
      ...SHOWN_AS_IT_IS,
      'log',
      '--encoding=UTF-8',
      '-z',
      '--no-merges',
      '-M',
      '--name-status',
      ...DIFF_OPTIONS,
      '--no-show-signature',
      `--format=${RECORD}${format}`,
      ...(options.since === undefined ? [] : [`--since=${options.since}T00:00:00Z`]),
      ...(options.limit === undefined ? [] : [`--max-count=${options.limit}`]),
      ...(options.path === undefined ? [] : ['--follow']),
      '--',
      options.path ?? '.'
    ])
    if (log === undefined) return undefined

    // NUL-separated: `<RECORD>commit`, parents, date, author, subject, then the files. A commit
    // object may hold a NUL in its message, but git prints the message only up to it, so no
    // name or subject can make a field or a file of its own. Every token is read where it
    // stands: what a name, a subject or a path says is never taken for a header.
    const entries: LogEntry[] = []
    const tokens = log.split('\0')
    for (let position = 0; position < tokens.length;) {
      const token = tokens[position]!
      if (!token.startsWith(RECORD)) {
        position++
        continue
      }
      const commit = token.slice(RECORD.length)
      const [parents, date, author, subject] = tokens.slice(position + 1, position + 5)
      const { changes, next } = filesOf(tokens, position + 5, top)
      position = next
      const parent = parents?.split(' ')[0] || undefined
      if (!isObjectName(commit) || date === undefined || author === undefined) continue
      if (subject === undefined || (parent !== undefined && !isObjectName(parent))) continue
      entries.push({ commit, parent, author, date, subject, changes })
    }
    return entries
  }

  return {
    headCommit,

    async hasCommit(commit: string): Promise<boolean> {
      if (!isObjectName(commit)) return false
      return (await run(['cat-file', '-t', commit]))?.trim() === 'commit'
    },

    async textAt(commit: string, path: string): Promise<string | undefined> {
      if (!isObjectName(commit) || !safePath(path)) return undefined
      return show(commit, path)
    },

    async changes(from: string, to: string): Promise<ChangedFile[] | undefined> {
      if (!isObjectName(from) || !isObjectName(to)) return undefined
      const top = await folder()
      if (top === undefined) return undefined
      const diff = await run([
        ...SHOWN_AS_IT_IS,
        'diff-tree',
        '-r',
        '-z',
        '-M',
        '--name-status',
        ...DIFF_OPTIONS,
        from,
        to,
        '--'
      ])
      if (diff === undefined) return undefined
      return filesOf(diff.split('\0'), 0, top).changes
    },

    async log(options: LogOptions = {}): Promise<LogEntry[] | undefined> {
      return logOf(options)
    },

    async workingTree(): Promise<WorkingTree | undefined> {
      // Status reads files of the working tree that may have changed: through their filters,
      // which are emptied, and into submodules, which are left alone.
      const filters = await withoutFilters()
      if (filters === undefined) return undefined
      const [top, status] = await Promise.all([
        folder(),
        run([
          ...filters,
          'status',
          '--porcelain',
          '-z',
          '--untracked-files=all',
          '--ignore-submodules=all',
          '--',
          '.'
        ])
      ])
      if (top === undefined || status === undefined) return undefined
      const branch = (await run(['symbolic-ref', '--short', '-q', 'HEAD']))?.trim()

      // `XY path`, NUL-terminated, relative to the top; a rename is followed by where it came from.
      const changed: string[] = []
      const deleted: string[] = []
      const renamedFrom: Record<string, string> = {}
      const entries = status.split('\0')
      for (let position = 0; position < entries.length; position++) {
        const entry = entries[position]!
        if (entry.length < 4) continue
        const codes = entry.slice(0, 2)
        const path = below(top, entry.slice(3))
        // A rename and a copy are both followed by where they came from; only a rename moved it.
        const source = /[RC]/.test(codes) ? entries[++position] : undefined
        const origin = codes.includes('R') ? below(top, source) : undefined
        if (path === undefined) continue
        changed.push(path)
        if (codes.includes('D')) deleted.push(path)
        if (origin !== undefined) renamedFrom[path] = origin
      }
      return {
        branch: branch === '' ? undefined : branch,
        changed: changed.sort(),
        deleted,
        renamedFrom
      }
    },

    async history(path: string): Promise<FileCommit[]> {
      const log = await logOf({ path })
      return (log ?? []).flatMap((entry): FileCommit[] => {
        const change = entry.changes[0]
        if (!change) return []
        return [
          {
            sha: entry.commit,
            author: entry.author,
            date: entry.date,
            subject: entry.subject,
            path: change.path,
            previousPath: change.kind === 'renamed' ? change.from : change.path
          }
        ]
      })
    },

    async text(commit: FileCommit, side: 'before' | 'after'): Promise<string | undefined> {
      if (!isObjectName(commit.sha)) return undefined
      return side === 'after'
        ? show(commit.sha, commit.path)
        : show(`${commit.sha}^`, commit.previousPath)
    },

    head(path: string): Promise<string | undefined> {
      return show('HEAD', path)
    },

    async userName(): Promise<string | undefined> {
      const name = (await run(['config', 'user.name']))?.trim()
      return name === '' ? undefined : name
    },

    async directory(): Promise<string | undefined> {
      return (await run(['rev-parse', '--absolute-git-dir']))?.trim()
    },

    async files(): Promise<string[] | undefined> {
      // Run in the directory, ls-files names what lies below it, relative to it.
      const [listed, deleted] = await Promise.all([
        run(['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.']),
        run(['ls-files', '-z', '--deleted', '--', '.'])
      ])
      if (listed === undefined || deleted === undefined) return undefined
      const gone = new Set(deleted.split('\0'))
      return [...new Set(listed.split('\0'))]
        .filter((path) => path !== '' && !gone.has(path))
        .sort()
    },

    async shallow(): Promise<boolean> {
      return (await run(['rev-parse', '--is-shallow-repository']))?.trim() === 'true'
    },

    async branches(): Promise<Branch[] | undefined> {
      const format = [
        '%(objectname)',
        '%(objecttype)',
        '%(symref)',
        '%(committerdate:iso-strict)',
        '%(refname)'
      ].join('%1f')
      const [headSha, current] = await Promise.all([
        headCommit(),
        run(['symbolic-ref', '--quiet', 'HEAD'])
      ])
      const refs = await run([
        'for-each-ref',
        // The last key sorts first: the newest commit, then by name.
        '--sort=refname',
        '--sort=-committerdate',
        // What is merged into HEAD does nothing HEAD has not: it does not count against the limit.
        ...(headSha === undefined ? [] : [`--no-merged=${headSha}`]),
        `--format=${format}`,
        'refs/heads',
        'refs/remotes'
      ])
      if (refs === undefined) return undefined
      const checkedOut = current?.trim()

      // A ref name holds no control character: neither the separator nor a line break.
      const bySha = new Map<string, { local: string[]; remote: string[]; date: string }>()
      for (const line of refs.split('\n')) {
        const [sha, type, symref, date, ref] = line.split(FIELD)
        if (!sha || !isObjectName(sha) || type !== 'commit' || symref || !date || !ref) continue
        if (sha === headSha || ref === checkedOut) continue
        const local = ref.startsWith('refs/heads/')
        const name = ref.replace(/^refs\/(?:heads|remotes)\//, '')
        const branch = bySha.get(sha) ?? { local: [], remote: [], date }
        ;(local ? branch.local : branch.remote).push(name)
        bySha.set(sha, branch)
      }
      return [...bySha]
        .slice(0, MAX_BRANCHES)
        .map(([sha, { local, remote, date }]) => ({ names: [...local, ...remote], sha, date }))
    },

    async mergeBase(sha: string): Promise<string | null | undefined> {
      if (!isObjectName(sha)) return undefined
      const done = await call(['merge-base', 'HEAD', sha])
      // It exits with 1, and says nothing, when the two have no commit in common.
      if (done.stdout === undefined) return done.code === 1 ? null : undefined
      const base = done.stdout.toString('utf8').trim()
      return isObjectName(base) ? base : undefined
    },

    async directoryTree(sha: string): Promise<string | null | undefined> {
      if (!isObjectName(sha)) return undefined
      // `./`: the directory git runs in, as the commit has it.
      const done = await call(['rev-parse', '--verify', '--quiet', `${sha}:./`])
      if (done.stdout === undefined) return done.code === 1 ? null : undefined
      const tree = done.stdout.toString('utf8').trim()
      return isObjectName(tree) ? tree : undefined
    },

    async treeEntries(tree: string): Promise<TreeEntry[] | undefined> {
      if (!isObjectName(tree)) return undefined
      // `--full-tree`: the tree as it is, wherever git runs.
      const listing = await run(['ls-tree', '-z', '--full-tree', tree])
      if (listing === undefined) return undefined
      // `<mode> <type> <name>\t<path>`: a symbolic link or a submodule is nothing to read.
      return listing.split('\0').flatMap((entry): TreeEntry[] => {
        const match = /^(100644|100755|040000) (?:blob|tree) ([0-9a-f]+)\t(.+)$/s.exec(entry)
        if (!match || !isObjectName(match[2]!)) return []
        return [
          { name: match[3]!, kind: match[1] === '040000' ? 'directory' : 'file', object: match[2]! }
        ]
      })
    },

    async blobs(names: readonly string[]): Promise<Map<string, string | null> | undefined> {
      const texts = new Map<string, string | null>()
      const asked = [...new Set(names)].filter((name) => isObjectName(name))
      if (asked.length === 0) return texts
      const ask = (names: readonly string[]): string => names.map((name) => `${name}\n`).join('')

      // Their sizes first: `<name> blob <size>`, or `<name> missing` for one git does not have.
      const checked = await run(['cat-file', '--batch-check'], ask(asked))
      if (checked === undefined) return undefined
      const batches: string[][] = []
      let bytes = Infinity
      for (const line of checked.split('\n')) {
        const [name, type, size] = line.split(' ')
        if (!name || !isObjectName(name) || type !== 'blob') continue
        if (Number(size) > MAX_BLOB_BYTES) {
          texts.set(name, null)
          continue
        }
        if (bytes + Number(size) > MAX_BATCH_BYTES) {
          batches.push([])
          bytes = 0
        }
        batches.at(-1)!.push(name)
        bytes += Number(size)
      }

      for (const batch of batches) {
        // `<name> blob <size>\n<content>\n` for each.
        const out = await output(['cat-file', '--batch'], ask(batch))
        if (out === undefined) return undefined
        for (let position = 0; position < out.length;) {
          const end = out.indexOf(10, position)
          if (end < 0) break
          const header = /^([0-9a-f]+) (\w+) (\d+)$/.exec(out.toString('utf8', position, end))
          if (!header) {
            position = end + 1
            continue
          }
          const size = Number(header[3])
          if (header[2] === 'blob') {
            texts.set(header[1]!, out.toString('utf8', end + 1, end + 1 + size))
          }
          position = end + 1 + size + 1
        }
      }
      return texts
    }
  }
}
