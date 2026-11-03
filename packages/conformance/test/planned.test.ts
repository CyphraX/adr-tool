import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import { analyseDependencies, openStructure } from '@adr-tool/structure'
import { checkPlannedImport, readRules } from '../src'
import { shop, yaml } from './repository'

const rules = yaml(
  'rules:',
  '  - id: billing-not-web',
  '    why: Billing is the domain.',
  '    kind: must-not-depend',
  '    from: billing',
  '    to: web',
  '  - id: persistence-alone',
  '    why: What is stored knows nothing of the domain.',
  '    kind: may-only-depend',
  '    from: persistence',
  '    to: []',
  '  - id: features-apart',
  '    why: Features stand alone.',
  '    kind: no-cycles',
  "    among: 'features/*'",
  'exceptions:',
  '  - rule: billing-not-web',
  '    from: billing',
  '    to: web',
  '    reason: The invoice formats dates like the web.'
)

async function planned(
  files: Record<string, string>,
  from: string,
  to: string,
  extra: readonly string[] = [],
  written = rules
) {
  const fs = memoryFileSystem(files)
  const paths = [...Object.keys(files), ...extra]
  const structure = await openStructure(fs, paths)
  const model = await analyseDependencies(fs, paths, structure.sourceFiles)
  return checkPlannedImport(readRules(written), structure, model, { from, to })
}

describe('a planned import (docs/mcp.md, list_violations)', () => {
  it('says which Rules an import would break before it is written, with their sentences', async () => {
    const found = await planned(shop, 'src/persistence/db.ts', 'src/billing/invoice.ts')
    expect(found.exists).toBe(false)
    expect(found.violations.map((violation) => violation.fingerprint)).toEqual([
      {
        kind: 'dependency',
        rule: 'persistence-alone',
        from: 'persistence',
        to: 'billing'
      }
    ])
    expect(found.violations[0]!.said).toEqual({
      code: 'may-only-depend',
      values: { from: 'persistence', to: 'billing', allowed: [] }
    })
  })

  it('names a Violation an Exception accepts already, and an import that is there already', async () => {
    const found = await planned(shop, 'src/billing/tax.ts', 'src/web/format.ts')
    expect(found.violations).toHaveLength(1)
    expect(found.violations[0]!.exception?.reason).toBe('The invoice formats dates like the web.')
    const there = await planned(shop, 'src/billing/invoice.ts', 'src/web/format.ts')
    expect(there.exists).toBe(true)
    expect(there.violations).toHaveLength(1)
  })

  it('finds a Cycle that the import would close, and nothing for an import that breaks no Rule', async () => {
    const files = { ...shop, 'src/features/b/y.ts': 'export const y = 1\n' }
    const closing = await planned(files, 'src/features/b/y.ts', 'src/features/a/x.ts')
    expect(closing.violations.map((violation) => violation.fingerprint)).toEqual([
      { kind: 'cycle', rule: 'features-apart', cycle: ['features/a', 'features/b'] }
    ])
    const fine = await planned(shop, 'src/web/page.ts', 'src/web/format.ts')
    expect(fine.violations).toEqual([])
  })

  it('takes a file that is not written yet as the Component it will belong to', async () => {
    const found = await planned(shop, 'src/billing/report.ts', 'src/web/page.ts', [
      'src/billing/report.ts'
    ])
    expect(found.violations.map((violation) => violation.fingerprint)).toEqual([
      { kind: 'dependency', rule: 'billing-not-web', from: 'billing', to: 'web' }
    ])
  })

  it('names a threshold the import would cross, and not one that is crossed already', async () => {
    const thresholds = yaml(
      'rules:',
      '  - {id: few-uses, why: W., kind: threshold, metric: fan-out, max: 1, of: persistence}',
      '  - {id: web-small, why: W., kind: threshold, metric: fan-out, max: 1, of: web}'
    )
    const crossing = await planned(
      shop,
      'src/persistence/db.ts',
      'src/billing/invoice.ts',
      [],
      thresholds
    )
    expect(crossing.violations.map((violation) => violation.fingerprint)).toEqual([
      { kind: 'component', rule: 'few-uses', component: 'persistence' }
    ])
    const crossed = await planned(shop, 'src/web/page.ts', 'src/features/a/x.ts', [], thresholds)
    expect(crossed.violations).toEqual([])
  })
})
