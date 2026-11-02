import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const SOURCE = fileURLToPath(new URL('../src/', import.meta.url))

/** The modules a module imports, transitively, by their paths below src. */
function reachable(start: string, seen = new Set<string>()): Set<string> {
  if (seen.has(start)) return seen
  seen.add(start)
  const text = readFileSync(join(SOURCE, start), 'utf8')
  for (const [, kind, specifier] of text.matchAll(
    /^(?:import|export)( type)?[^'"]*from '([^']+)'/gm
  )) {
    if (kind) continue
    if (specifier!.startsWith('.')) {
      reachable(join(dirname(start), `${specifier}.ts`), seen)
    } else {
      seen.add(specifier!)
    }
  }
  return seen
}

// The main process and the renderer of the app use this entry; the 9 MB of TypeScript and the
// WebAssembly of tree-sitter belong to the analysis alone (ADR-0008).
it('keeps the model free of the parsers', () => {
  const modules = [...reachable('model.ts')]
  expect(modules).not.toContain('typescript')
  expect(modules).not.toContain('web-tree-sitter')
  expect(modules.filter((module) => module.startsWith('typescript/'))).toEqual([])
  expect(modules).toContain('levels.ts')
})
