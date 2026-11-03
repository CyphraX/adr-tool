import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join, win32 } from 'node:path'
import ignore, { type Ignore } from 'ignore'

/**
 * What a repository consists of (docs/structure-format.md, section 2), as the app finds it: in
 * a git repository, what git tracks plus what it neither tracks nor ignores; without git, a
 * walk of the directory that honours `.gitignore`. Paths are relative to `root`, with forward
 * slashes, sorted. Nothing is written, and nothing the repository brings along is run.
 */
export async function listRepository(root: string): Promise<string[]> {
  return (await gitFiles(root)) ?? walk(root)
}

/**
 * The git to run. On Windows a bare `git` is looked for in the directory it runs in before the
 * PATH — a `git.exe` a repository brings along would run — so git is found on the PATH there,
 * by its full path. As the app does (packages/app/src/main/git.ts).
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
 * The files git lists below `root`; `undefined` without git, or outside a repository. A
 * repository is untrusted input, its configuration included: nothing here takes a lock, pages,
 * or runs a program the repository names — no fsmonitor, and no fetch of an object a partial
 * clone lacks.
 */
async function gitFiles(root: string): Promise<string[] | undefined> {
  const run = (args: string[]): Promise<string | undefined> =>
    new Promise((resolve) => {
      const child = execFile(
        gitExecutable(),
        [
          '--no-pager',
          '--no-optional-locks',
          '--literal-pathspecs',
          '-c',
          'core.quotepath=off',
          '-c',
          'core.fsmonitor=false',
          ...args
        ],
        {
          cwd: root,
          env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
          timeout: 60_000,
          maxBuffer: 256 * 1024 * 1024,
          windowsHide: true,
          encoding: 'utf8'
        },
        (error, stdout) => resolve(error ? undefined : stdout)
      )
      child.stdin?.on('error', () => undefined)
      child.stdin?.end()
    })
  // Run in the directory, ls-files names what lies below it, relative to it.
  const [listed, deleted] = await Promise.all([
    run(['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.']),
    run(['ls-files', '-z', '--deleted', '--', '.'])
  ])
  if (listed === undefined || deleted === undefined) return undefined
  const gone = new Set(deleted.split('\0'))
  return [...new Set(listed.split('\0'))].filter((path) => path !== '' && !gone.has(path)).sort()
}

/** Never walked into, at any depth. git does not list them either. */
const NEVER = new Set(['node_modules', '.git'])
/** Build output, left out where it stands next to a build file. */
const BUILD_OUTPUT = new Set(['dist', 'build', 'out', 'target'])
const BUILD_FILES = [
  'package.json',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'go.mod'
]

/**
 * The files below `root` for a folder without git, as the app walks it: `.gitignore` files are
 * honoured where they exist, each for the directory it lies in and below, and `dist`, `build`,
 * `out` and `target` are left out next to a build file. Symbolic links are not followed.
 */
export async function walk(root: string): Promise<string[]> {
  const found: string[] = []
  const visit = async (
    directory: string,
    rules: readonly { base: string; ignores: Ignore }[]
  ): Promise<void> => {
    const entries = await readdir(join(root, directory), { withFileTypes: true }).catch(() => [])
    const names = new Set(entries.map((entry) => entry.name))
    const own = names.has('.gitignore')
      ? await readFile(join(root, directory, '.gitignore'), 'utf8').catch(() => undefined)
      : undefined
    const here =
      own === undefined ? rules : [...rules, { base: directory, ignores: ignore().add(own) }]
    const besideBuildFile = BUILD_FILES.some((name) => names.has(name))

    // As in git: the deeper `.gitignore` has the last word, `!` included.
    const ignored = (path: string, isDirectory: boolean): boolean => {
      let verdict = false
      for (const { base, ignores } of here) {
        const relative = base === '' ? path : path.slice(base.length + 1)
        const tested = ignores.test(isDirectory ? `${relative}/` : relative)
        if (tested.ignored) verdict = true
        else if (tested.unignored) verdict = false
      }
      return verdict
    }

    for (const entry of entries) {
      const path = directory === '' ? entry.name : `${directory}/${entry.name}`
      if (entry.isDirectory()) {
        if (NEVER.has(entry.name) || ignored(path, true)) continue
        if (besideBuildFile && BUILD_OUTPUT.has(entry.name)) continue
        await visit(path, here)
      } else if (entry.isFile() && !ignored(path, false)) {
        found.push(path)
      }
    }
  }
  await visit('', [])
  return found.sort()
}
