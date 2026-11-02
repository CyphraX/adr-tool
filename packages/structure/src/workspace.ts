import { parse as parseYaml } from 'yaml'
import type { FileSystem } from '@adr-tool/kernel'
import { matcherOf } from './patterns'

/**
 * The directories of the packages a JavaScript workspace declares: the globs of
 * `pnpm-workspace.yaml` and of `workspaces` in the root `package.json`, matched against the
 * directories that hold a `package.json`. Read as text, never run. The Draft takes them as
 * units, and module resolution resolves their names to them.
 */
export async function workspacePackages(
  fs: FileSystem,
  files: readonly string[]
): Promise<string[]> {
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
