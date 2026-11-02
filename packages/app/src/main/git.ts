import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isAbsolute, join, resolve as resolvePath } from 'node:path'
import { GIT_OPTIONS, gitExecutable, within } from '@adr-tool/cli/git'
import { t } from './strings'

/**
 * How the app runs git. Reading is the command line's code, which the app shares
 * (docs/adr/0020-git-is-a-port-of-the-kernel-implemented-once-for-node.md): every run of git
 * goes through one hardening. Committing is the app's own and stays here.
 */
export {
  gitExecutable,
  gitIn,
  MAX_BRANCHES,
  type Branch,
  type FileCommit,
  type RepositoryGit as Git,
  type TreeEntry,
  type WorkingTree
} from '@adr-tool/cli/git'

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
  executable = gitExecutable()
): Promise<CommitOutcome> {
  const git = (
    args: string[],
    timeout = 15_000
  ): Promise<{ ok: boolean; stdout: string; stderr: string }> =>
    new Promise((resolve) => {
      execFile(
        executable,
        [...GIT_OPTIONS, ...args],
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
