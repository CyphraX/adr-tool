import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import type { FileSystem } from '@adr-tool/kernel'
import { analyseDependencies, openStructure } from '@adr-tool/structure'
import { openConformance, sentenceAt } from '../src'

// A repository on disk whose Rule is broken on purpose, as `adr check` meets it (docs/cli.md).
const root = fileURLToPath(new URL('fixtures/layered-shop/', import.meta.url))

const fileSystem: FileSystem = {
  readText: (path) => readFile(join(root, path), 'utf8').catch(() => undefined),
  list: async (path) =>
    (await readdir(join(root, path), { withFileTypes: true }).catch(() => undefined))?.map(
      (entry) => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' })
    )
}

async function files(directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const found = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? files(join(directory, entry.name))
        : [relative(root, join(directory, entry.name)).split('\\').join('/')]
    )
  )
  return found.flat().sort()
}

it('finds the Violation of the fixture at the line of its import, and its Exception-free state', async () => {
  const paths = await files()
  const structure = await openStructure(fileSystem, paths)
  const analysis = await analyseDependencies(fileSystem, paths, structure.sourceFiles)
  const report = await openConformance(fileSystem, structure, analysis, {
    logs: ['docs/adr'],
    adrs: [{ log: 'docs/adr', id: '0001-invoices-format-dates-like-the-web' }]
  })

  expect(report.problems).toEqual([])
  expect(report.rules.map((rule) => rule.id)).toEqual(['billing-not-web', 'layered'])
  expect(
    report.violations.flatMap((violation) =>
      violation.dependencies.map((dependency) => sentenceAt(violation, dependency))
    )
  ).toEqual([
    'billing must not depend on web: src/billing/invoice.ts:3 imports src/web/format.ts.',
    'billing must not depend on web, which lies in a layer above it: src/billing/invoice.ts:3 imports src/web/format.ts.'
  ])
  expect(report.violations.every((violation) => violation.exception === undefined)).toBe(true)
})
