import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isAbsolute, join, relative, resolve as resolvePath } from 'node:path'
import { t } from './strings'

/** Whether `path` is `root` or lies below it. Both are absolute. */
const within = (root: string, path: string): boolean => {
  const rest = relative(root, path)
  return rest === '' || (!rest.startsWith('..') && !isAbsolute(rest))
}

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

/** A file as a commit has it: where it is below the directory, and its blob. */
export interface TreeFile {
  readonly path: string
  readonly blob: string
}

export interface Git {
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
  /**
   * The local and remote-tracking branches other than the one that is checked out and those
   * that point at HEAD, the most recently committed to first, at most `MAX_BRANCHES` commits.
   */
  branches(): Promise<Branch[]>
  /** The commit that HEAD and `sha` last had in common; `undefined` when they have none. */
  mergeBase(sha: string): Promise<string | undefined>
  /** The files below the directory as a commit has them, without what is too large to be an ADR. */
  tree(sha: string): Promise<TreeFile[] | undefined>
  /** The text of blobs, by their names, in one go. A blob git does not have is left out. */
  blobs(names: readonly string[]): Promise<Map<string, string>>
}

/** How many branches are read at most: those with the most recent commits. */
export const MAX_BRANCHES = 50

/** A file larger than this is no ADR, and is not read from a branch. */
const MAX_BLOB_BYTES = 1024 * 1024

const FIELD = '\x1f'
const RECORD = '\x1e'

/** Only ever a full object name goes back into a git command line: never anything a commit message could forge. */
const OBJECT_NAME = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/

/**
 * The system's git, read-only, for one opened directory (docs/plan.md, decision 2): users
 * have git by definition, and its behaviour is the reference. The directory may lie below
 * the top of its repository; every path here is relative to the directory.
 *
 * Without git, or outside a repository, everything degrades to "nothing": no state, no history.
 *
 * A repository is untrusted input, its configuration included. Nothing here takes a lock,
 * pages, or runs a program the repository names: no fsmonitor, no signature check, no
 * textconv or filter (`cat-file blob` prints the blob as it is).
 */
export function gitIn(root: string, executable = 'git'): Git {
  /** The output of a git command, or `undefined` when it fails. */
  const output = (args: string[], input?: string): Promise<Buffer | undefined> =>
    new Promise((resolve) => {
      const child = execFile(
        executable,
        [
          '--no-pager',
          '--no-optional-locks',
          // A file name is a file name, never a pattern.
          '--literal-pathspecs',
          '-c',
          'core.quotepath=off',
          '-c',
          'core.fsmonitor=false',
          ...args
        ],
        {
          cwd: root,
          timeout: 15_000,
          maxBuffer: 64 * 1024 * 1024,
          windowsHide: true,
          encoding: 'buffer'
        },
        (error, stdout) => resolve(error ? undefined : stdout)
      )
      // Without input, git must not wait for any.
      child.stdin?.on('error', () => undefined)
      child.stdin?.end(input)
    })
  /** The output of a git command, read as UTF-8, or `undefined` when it fails. */
  const run = async (args: string[]): Promise<string | undefined> =>
    (await output(args))?.toString('utf8')

  /** `service/` when the directory is `service` below the top of the repository. */
  const folder = async (): Promise<string | undefined> =>
    (await run(['rev-parse', '--show-prefix']))?.replace(/\r?\n$/, '')

  const below = (folder: string, path: string | undefined): string | undefined =>
    path?.startsWith(folder) ? path.slice(folder.length) : undefined

  /**
   * A file as a revision has it: the blob, and nothing but a blob. `./` makes the path
   * relative to the directory.
   */
  const show = (revision: string, path: string): Promise<string | undefined> =>
    run(['cat-file', 'blob', `${revision}:./${path}`])

  return {
    async workingTree(): Promise<WorkingTree | undefined> {
      const [top, status] = await Promise.all([
        folder(),
        run(['status', '--porcelain', '-z', '--untracked-files=all', '--', '.'])
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
      const top = await folder()
      const format = ['%H', '%an', '%aI', '%s'].join(FIELD)
      const log =
        top === undefined
          ? undefined
          : await run([
              'log',
              '-z',
              '--follow',
              '-M',
              '--name-status',
              '--no-show-signature',
              `--format=${RECORD}${format}`,
              '--',
              path
            ])
      if (top === undefined || log === undefined) return []

      // NUL-separated: `<RECORD>header`, then `\nM`, `path` — or `\nR100`, `from`, `to`.
      // A commit message cannot hold a NUL, so it cannot forge any of this.
      const commits: FileCommit[] = []
      const tokens = log.split('\0')
      for (let position = 0; position < tokens.length; position++) {
        if (!tokens[position]!.startsWith(RECORD)) continue
        const [sha, author, date, ...subject] = tokens[position]!.slice(1).split(FIELD)
        const renames = /^\s*[RC]/.test(tokens[position + 1] ?? '')
        const before = below(top, tokens[position + 2])
        const now = renames ? below(top, tokens[position + 3]) : before
        if (!sha || !OBJECT_NAME.test(sha) || !author || !date || !before || !now) continue
        commits.push({
          sha,
          author,
          date,
          subject: subject.join(FIELD),
          path: now,
          previousPath: before
        })
      }
      return commits
    },

    async text(commit: FileCommit, side: 'before' | 'after'): Promise<string | undefined> {
      if (!OBJECT_NAME.test(commit.sha)) return undefined
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

    async branches(): Promise<Branch[]> {
      const format = [
        '%(objectname)',
        '%(objecttype)',
        '%(symref)',
        '%(committerdate:iso-strict)',
        '%(refname)'
      ].join('%1f')
      const [head, current, refs] = await Promise.all([
        run(['rev-parse', '--verify', '--quiet', 'HEAD']),
        run(['symbolic-ref', '--quiet', 'HEAD']),
        run([
          'for-each-ref',
          // The last key sorts first: the newest commit, then by name.
          '--sort=refname',
          '--sort=-committerdate',
          `--format=${format}`,
          'refs/heads',
          'refs/remotes'
        ])
      ])
      if (refs === undefined) return []
      const checkedOut = current?.trim()
      const headSha = head?.trim()

      // A ref name holds no control character: neither the separator nor a line break.
      const bySha = new Map<string, { local: string[]; remote: string[]; date: string }>()
      for (const line of refs.split('\n')) {
        const [sha, type, symref, date, ref] = line.split(FIELD)
        if (!sha || !OBJECT_NAME.test(sha) || type !== 'commit' || symref || !date || !ref) continue
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

    async mergeBase(sha: string): Promise<string | undefined> {
      if (!OBJECT_NAME.test(sha)) return undefined
      const base = (await run(['merge-base', 'HEAD', sha]))?.trim()
      return base !== undefined && OBJECT_NAME.test(base) ? base : undefined
    },

    async tree(sha: string): Promise<TreeFile[] | undefined> {
      if (!OBJECT_NAME.test(sha)) return undefined
      // Run in the directory, ls-tree names what lies below it, relative to it.
      const listing = await run(['ls-tree', '-r', '-z', '-l', sha, '--', '.'])
      if (listing === undefined) return undefined
      // `<mode> blob <name> <size>\t<path>`: a symbolic link or a submodule is no file to read.
      return listing.split('\0').flatMap((entry) => {
        const match = /^100(?:644|755) blob ([0-9a-f]+) +(\d+)\t(.+)$/s.exec(entry)
        return match && OBJECT_NAME.test(match[1]!) && Number(match[2]) <= MAX_BLOB_BYTES
          ? [{ path: match[3]!, blob: match[1]! }]
          : []
      })
    },

    async blobs(names: readonly string[]): Promise<Map<string, string>> {
      const texts = new Map<string, string>()
      const asked = [...new Set(names)].filter((name) => OBJECT_NAME.test(name))
      if (asked.length === 0) return texts
      // `<name> blob <size>\n<content>\n` for each; `<name> missing\n` for one git does not have.
      const out = await output(['cat-file', '--batch'], asked.map((name) => `${name}\n`).join(''))
      if (out === undefined) return texts
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
      return texts
    }
  }
}

/**
 * What became of a commit: its hash, or what git said instead. A commit that git made and
 * then reported a failure for — a hook after the commit failed or took too long — is made;
 * what git said comes with it.
 */
export type CommitOutcome =
  | { readonly committed: true; readonly sha: string; readonly said?: string }
  | { readonly committed: false; readonly reason: string }

/**
 * Commit these files as they are in the working tree, and nothing else that is changed or
 * staged (docs/adr/0012-committing-an-adr-runs-git-commit-for-its-files-only.md): the one
 * place where the app writes to git. It is `git commit --only`, so git runs the hooks and the
 * signing that are configured, as it does on the command line. A file git does not know yet
 * is announced to it first, and taken out of the index again when the commit fails.
 * The paths are relative to the opened directory; nothing is pushed.
 */
export async function commitFiles(
  root: string,
  paths: readonly string[],
  message: string,
  executable = 'git'
): Promise<CommitOutcome> {
  const git = (
    args: string[],
    timeout = 15_000
  ): Promise<{ ok: boolean; stdout: string; stderr: string }> =>
    new Promise((resolve) => {
      execFile(
        executable,
        [
          '--no-pager',
          '--literal-pathspecs',
          '-c',
          'core.quotepath=off',
          '-c',
          'core.fsmonitor=false',
          ...args
        ],
        { cwd: root, timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) => resolve({ ok: !error, stdout, stderr })
      )
    })
  /** The last lines git wrote, which say why. */
  const said = (output: { stdout: string; stderr: string }): string =>
    (output.stderr.trim() || output.stdout.trim()).split(/\r?\n/).slice(-6).join('\n') ||
    t.commit.failed

  const text = message.trim()
  if (text === '') return { committed: false, reason: t.commit.noMessage }
  const base = resolvePath(root)
  const outside = paths.find((path) => {
    const full = resolvePath(base, path)
    return isAbsolute(path) || !within(base, full) || full === base
  })
  if (outside !== undefined) return { committed: false, reason: t.commit.notInRepository(outside) }
  if (paths.length === 0) return { committed: false, reason: t.commit.failed }

  const tracked = await git(['ls-files', '-z', '--', ...paths])
  if (!tracked.ok) return { committed: false, reason: said(tracked) }
  const known = new Set(tracked.stdout.split('\0').filter(Boolean))
  const announced = paths.filter((path) => !known.has(path) && existsSync(join(base, path)))
  if (announced.length > 0) {
    const added = await git(['add', '--intent-to-add', '--', ...announced])
    if (!added.ok) return { committed: false, reason: said(added) }
  }
  const head = async (): Promise<string> =>
    (await git(['rev-parse', '--verify', '--quiet', 'HEAD'])).stdout.trim()
  const parent = await head()
  // A hook may take its time; a signing may wait for a passphrase.
  const done = await git(['commit', '--only', '--quiet', '-m', text, '--', ...paths], 120_000)
  const sha = await head()
  if (done.ok) return { committed: true, sha }
  // HEAD moved: the commit is made, whatever failed after it. Its files are in it to stay.
  if (sha !== '' && sha !== parent) return { committed: true, sha, said: said(done) }

  const reason = said(done)
  if (announced.length === 0) return { committed: false, reason }
  const undone = await git(['rm', '--cached', '--quiet', '--', ...announced])
  return {
    committed: false,
    reason: undone.ok ? reason : `${reason}\n\n${t.commit.stillAnnounced(announced.join(', '))}`
  }
}
