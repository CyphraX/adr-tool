/** Which files of a repository are Source Files (docs/structure-format.md, section 2). */

export type Language = 'typescript' | 'svelte' | 'java'

export interface SourceFile {
  /** Relative to the repository root, with forward slashes. */
  readonly path: string
  /** TypeScript stands for JavaScript as well: one adapter reads both. */
  readonly language: Language
  /** Marked as a test, by convention or by a `tests` pattern of a Component that contains it. */
  readonly test: boolean
}

const LANGUAGES: readonly (readonly [RegExp, Language])[] = [
  [/\.(?:[cm]?[tj]s|[tj]sx)$/, 'typescript'],
  [/\.svelte$/, 'svelte'],
  [/\.java$/, 'java']
]

/** Never looked at, at any depth, whatever git says. */
const NEVER = new Set(['node_modules', '.git', '.arch'])
const TEST_DIRECTORIES = new Set(['test', 'tests', '__tests__', 'e2e'])

export function languageOf(path: string): Language | undefined {
  return LANGUAGES.find(([extension]) => extension.test(path))?.[1]
}

/** Whether a path lies in a directory the suite never looks into. */
export function isNeverLookedAt(path: string): boolean {
  return path.split('/').some((segment) => NEVER.has(segment))
}

/** A test by the conventions of section 2; the `tests` patterns of Components come on top. */
export function isTestByConvention(path: string): boolean {
  const segments = path.split('/')
  const name = segments.pop() ?? ''
  return (
    segments.some((segment) => TEST_DIRECTORIES.has(segment)) ||
    /\.(?:test|spec)\.[^.]+$/.test(name) ||
    `/${path}`.includes('/src/test/')
  )
}

/**
 * The Source Files among the files of a repository, in the order of their paths. What the
 * repository consists of — what git tracks, plus what it neither tracks nor ignores — is the
 * caller's to find out; `structure` does not run git.
 */
export function sourceFilesAmong(files: readonly string[]): SourceFile[] {
  const found: SourceFile[] = []
  for (const path of new Set(files)) {
    const language = languageOf(path)
    if (language === undefined || isNeverLookedAt(path)) continue
    found.push({ path, language, test: isTestByConvention(path) })
  }
  return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
