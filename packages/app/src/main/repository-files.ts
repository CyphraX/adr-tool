import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import ignore, { type Ignore } from 'ignore'
import { gitIn } from './git'

/** Never walked into, at any depth. git does not list them either. */
const NEVER = new Set(['node_modules', '.git'])
/** Build output, left out where it stands next to a build file. */
const BUILD_OUTPUT = new Set(['dist', 'build', 'out', 'target'])
const BUILD_FILES = ['package.json', 'pom.xml', 'build.gradle', 'build.gradle.kts']

/**
 * What a repository consists of (docs/structure-format.md, section 2): in a git repository,
 * what git tracks plus what it neither tracks nor ignores; without git, a walk of the
 * directory. Paths are relative to `root`, with forward slashes, sorted.
 */
export async function repositoryFiles(root: string): Promise<string[]> {
  return (await gitIn(root).files()) ?? walk(root)
}

/**
 * The files below `root` for a folder without git: `.gitignore` files are honoured where
 * they exist, each for the directory it lies in and below, and `dist`, `build`, `out` and
 * `target` are left out next to a build file. Symbolic links are not followed.
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
