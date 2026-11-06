import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const SOURCE = fileURLToPath(new URL('../src/', import.meta.url))

/** The packages a module imports, transitively, also those it imports types of. */
function packagesOf(start: string, seen = new Set<string>(), found = new Set<string>()) {
  if (seen.has(start)) return found
  seen.add(start)
  const text = readFileSync(join(SOURCE, start), 'utf8')
  for (const [, specifier] of text.matchAll(/^(?:import|export)[^'"]*from '([^']+)'/gm)) {
    if (specifier!.startsWith('.')) packagesOf(join(dirname(start), `${specifier}.ts`), seen, found)
    else found.add(specifier!)
  }
  return found
}

// As Diagrams and Review: the app's main process and its renderer can use this
// package, so it reaches Structure through its model alone, never through the entry that loads
// TypeScript and tree-sitter (ADR-0006, ADR-0008).
it('imports the kernel, Structure’s model and yaml, and nothing else', () => {
  const modules = readdirSync(SOURCE).filter((name) => name.endsWith('.ts'))
  expect(modules).toContain('index.ts')
  const packages = new Set<string>()
  for (const module of modules) for (const name of packagesOf(module)) packages.add(name)
  expect([...packages].sort()).toEqual(['@adr-tool/kernel', '@adr-tool/structure/model', 'yaml'])
})
