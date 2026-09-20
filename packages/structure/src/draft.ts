import { parse as parseYaml } from 'yaml'
import { normalizePath, type FileSystem } from '@adr-tool/kernel'
import type { DeclaredComponent } from './declaration'
import { matcherOf } from './patterns'
import { isNeverLookedAt, type SourceFile } from './source-files'

/**
 * The Draft (docs/structure-format.md, "The Draft"): the Components the suite derives as long
 * as none are declared. It is built from build files, which are read as text and never run,
 * and from the directories that hold Source Files — not from parsed code.
 */
export async function draftComponents(
  fs: FileSystem,
  files: readonly string[],
  sourceFiles: readonly SourceFile[]
): Promise<DeclaredComponent[]> {
  const sources = sourceFiles.map((file) => file.path)
  const holdsSources = (directory: string): boolean =>
    sources.some((path) => isBeneath(path, directory))

  const found = new Set([
    ...(await workspacePackages(fs, files)),
    ...(await mavenModules(fs, files)),
    ...(await gradleProjects(fs, files))
  ])
  const units = [...found]
    .filter((unit) => unit !== '' && !isNeverLookedAt(unit) && holdsSources(unit))
    .sort()

  const build = (unit: string): DeclaredComponent[] => {
    // The units directly beneath this one: those with no other unit in between.
    const nested = units.filter(
      (other) =>
        other !== unit &&
        isBeneath(other, unit) &&
        !units.some(
          (between) =>
            between !== unit &&
            between !== other &&
            isBeneath(other, between) &&
            isBeneath(between, unit)
        )
    )
    const isTaken = (directory: string): boolean =>
      units.some((other) => other !== unit && (isBeneath(other, directory) || other === directory))
    // Where build files name units, they are the top level; directories beside them are not drafted.
    const directories =
      unit === '' && units.length > 0 ? [] : childDirectories(unit, sources, isTaken)
    return named([
      ...nested.map((other) => ({ directory: other, children: build(other) })),
      ...directories.map((directory) => ({ directory, children: [] }))
    ])
  }

  const top = build('')
  if (top.length > 0 || sources.length === 0) return top
  // Nothing to tell apart: the one directory that holds the code is the one Component.
  const root = sourceRootOf('', sources)
  return named([{ directory: root, children: [] }])
}

/** A path lies beneath a directory; everything lies beneath the root. */
const isBeneath = (path: string, directory: string): boolean =>
  directory === '' || path.startsWith(`${directory}/`)

const lastSegment = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** `src/main/java` where it holds Source Files, otherwise `src`, otherwise the unit itself. */
function sourceRootOf(unit: string, sources: readonly string[]): string {
  const under = (directory: string): string => (unit === '' ? directory : `${unit}/${directory}`)
  for (const candidate of [under('src/main/java'), under('src')]) {
    if (sources.some((path) => isBeneath(path, candidate))) return candidate
  }
  return unit
}

/**
 * The directories that become the children of a unit: those under its source root, after
 * going down for as long as a directory holds exactly one directory and no Source File —
 * which passes over a common base package such as `com/example/shop`.
 */
function childDirectories(
  unit: string,
  sources: readonly string[],
  isTaken: (directory: string) => boolean
): string[] {
  let directory = sourceRootOf(unit, sources)
  for (;;) {
    const beneath = sources.filter((path) => isBeneath(path, directory))
    const rest = (path: string): string =>
      directory === '' ? path : path.slice(directory.length + 1)
    const holdsFiles = beneath.some((path) => !rest(path).includes('/'))
    const directories = [
      ...new Set(
        beneath
          .filter((path) => rest(path).includes('/'))
          .map((path) => (directory === '' ? '' : `${directory}/`) + rest(path).split('/')[0]!)
      )
    ].sort()
    const only = directories[0]
    if (!holdsFiles && directories.length === 1 && only !== undefined && !isTaken(only)) {
      directory = only
      continue
    }
    // What is a unit of its own, or holds one, is not drafted a second time.
    return directories.filter((candidate) => !isTaken(candidate) && !isNeverLookedAt(candidate))
  }
}

/** Give every directory of one level its segment, and with it its Component. */
function named(
  level: readonly { directory: string; children: readonly DeclaredComponent[] }[]
): DeclaredComponent[] {
  const taken = new Map<string, number>()
  return [...level]
    .sort((a, b) => (a.directory < b.directory ? -1 : a.directory > b.directory ? 1 : 0))
    .map(({ directory, children }) => {
      const written = directory === '' ? 'repository' : lastSegment(directory)
      const base = segmentOf(written)
      const count = (taken.get(base) ?? 0) + 1
      taken.set(base, count)
      const segment = count === 1 ? base : `${base}-${count}`
      return {
        id: segment,
        // The directory's own name is shown where the segment had to depart from it.
        name: written === segment ? segment : written,
        paths: [directory === '' ? '**' : `${directory}/**`],
        tests: [],
        children: children.map((child) => withParent(child, segment))
      }
    })
}

const withParent = (component: DeclaredComponent, parent: string): DeclaredComponent => ({
  ...component,
  id: `${parent}/${component.id}`,
  children: component.children.map((child) => withParent(child, parent))
})

/** A segment of a Component ID from the name of a directory. */
export function segmentOf(name: string): string {
  const segment = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return segment === '' ? 'unit' : segment
}

async function workspacePackages(fs: FileSystem, files: readonly string[]): Promise<string[]> {
  const globs: string[] = []
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

  if (files.includes('pnpm-workspace.yaml')) {
    try {
      const workspace: unknown = parseYaml((await fs.readText('pnpm-workspace.yaml')) ?? '')
      globs.push(...strings((workspace as { packages?: unknown } | null)?.packages))
    } catch {
      // A workspace file that cannot be read names no packages.
    }
  }
  if (files.includes('package.json')) {
    try {
      const manifest = JSON.parse((await fs.readText('package.json')) ?? '{}') as {
        workspaces?: unknown
      }
      const workspaces = manifest.workspaces
      globs.push(
        ...strings(
          Array.isArray(workspaces)
            ? workspaces
            : (workspaces as { packages?: unknown } | undefined)?.packages
        )
      )
    } catch {
      // As above.
    }
  }
  if (globs.length === 0) return []
  const isPackage = matcherOf(globs, true)
  return files
    .filter((path) => path.endsWith('/package.json'))
    .map((path) => path.slice(0, -'/package.json'.length))
    .filter(isPackage)
}

async function mavenModules(fs: FileSystem, files: readonly string[]): Promise<string[]> {
  const modules: string[] = []
  const visited = new Set<string>()
  const visit = async (directory: string): Promise<void> => {
    const pom = directory === '' ? 'pom.xml' : `${directory}/pom.xml`
    if (visited.has(pom) || !files.includes(pom)) return
    visited.add(pom)
    if (directory !== '') modules.push(directory)
    const text = ((await fs.readText(pom)) ?? '').replace(/<!--[\s\S]*?-->/g, '')
    for (const block of text.matchAll(/<modules>([\s\S]*?)<\/modules>/g)) {
      for (const module of block[1]!.matchAll(/<module>\s*([^<]*?)\s*<\/module>/g)) {
        const written = module[1]!.replace(/\/?pom\.xml$/, '')
        const path = normalizePath(directory === '' ? written : `${directory}/${written}`)
        if (path !== undefined) await visit(path)
      }
    }
  }
  await visit('')
  return modules
}

async function gradleProjects(fs: FileSystem, files: readonly string[]): Promise<string[]> {
  const projects: string[] = []
  for (const settings of ['settings.gradle', 'settings.gradle.kts']) {
    if (!files.includes(settings)) continue
    const text = ((await fs.readText(settings)) ?? '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1')
    // `include` and the string literals that follow it, over as many lines as the call takes.
    for (const call of text.matchAll(/\binclude\b\s*\(?((?:\s*,?\s*(?:'[^'\n]*'|"[^"\n]*"))+)/g)) {
      for (const literal of call[1]!.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)) {
        const parts = (literal[1] ?? literal[2] ?? '').split(':').filter((part) => part !== '')
        // `:a:b` is the project `b` of the project `a`: both are directories.
        parts.forEach((_, index) => {
          const path = normalizePath(parts.slice(0, index + 1).join('/'))
          if (path !== undefined && path !== '') projects.push(path)
        })
      }
    }
  }
  return projects
}
