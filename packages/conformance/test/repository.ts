import { memoryFileSystem } from '@adr-tool/kernel'
import { analyseDependencies, openStructure } from '@adr-tool/structure'
import { checkConformance, readRules, type Decisions } from '../src'

/**
 * A shop in memory with something to break for every kind of Rule: `billing` uses `web`, the
 * features use each other, `scripts` is Unassigned, a test reaches into `persistence`.
 */
export const shop: Record<string, string> = {
  '.arch/components.yml': [
    'components:',
    '  web:',
    '    paths: [src/web/**]',
    '  billing:',
    '    paths: [src/billing/**]',
    '    components:',
    '      invoices:',
    '        paths: [src/billing/invoices/**]',
    '  persistence:',
    '    paths: [src/persistence/**]',
    '  features:',
    '    components:',
    '      a:',
    '        paths: [src/features/a/**]',
    '      b:',
    '        paths: [src/features/b/**]',
    ''
  ].join('\n'),
  'src/web/page.ts': [
    "import { invoice } from '../billing/invoice'",
    "import { db } from '../persistence/db'",
    ''
  ].join('\n'),
  'src/web/format.ts': 'export const format = (d: Date) => d.toISOString()\n',
  'src/billing/invoice.ts': [
    '// The invoice',
    "import { format } from '../web/format'",
    "import { list } from './invoices/list'",
    ''
  ].join('\n'),
  'src/billing/tax.ts': "import { rate } from '../../scripts/rates'\n",
  'src/billing/invoices/list.ts': [
    "import { db } from '../../persistence/db'",
    "import type { Invoice } from '../invoice'",
    ''
  ].join('\n'),
  'src/billing/invoice.test.ts': "import { db } from '../persistence/db'\n",
  'src/persistence/db.ts': "import type { Page } from '../web/page'\n",
  'src/features/a/x.ts': "import { y } from '../b/y'\n",
  'src/features/b/y.ts': "import { x } from '../a/x'\n",
  'scripts/rates.ts': 'export const rate = 0.19\n',
  'scripts/seed.ts': "import { db } from '../src/persistence/db'\n"
}

/** The shop, or another repository, with these Rules, checked. */
export async function checked(
  files: Record<string, string>,
  rules?: string,
  decisions?: Decisions
) {
  const all = rules === undefined ? files : { ...files, '.arch/rules.yml': rules }
  const fs = memoryFileSystem(all)
  const paths = Object.keys(all)
  const structure = await openStructure(fs, paths)
  const analysis = await analyseDependencies(fs, paths, structure.sourceFiles)
  const file = readRules(all['.arch/rules.yml'])
  return checkConformance(file, structure, analysis, decisions)
}

/** The lines of a Rules file, joined. */
export const yaml = (...lines: string[]): string => [...lines, ''].join('\n')

/** The fingerprints of what a check found, on one line each. */
export const found = (report: Awaited<ReturnType<typeof checked>>) =>
  report.violations.map((violation) => {
    const { fingerprint } = violation
    const what =
      'from' in fingerprint
        ? `${fingerprint.from} -> ${fingerprint.to}`
        : 'cycle' in fingerprint
          ? fingerprint.cycle.join(' ')
          : 'name' in fingerprint
            ? `${fingerprint.name} in ${fingerprint.file}`
            : fingerprint.component
    return `${fingerprint.rule}: ${what}${violation.exception ? ' (accepted)' : ''}`
  })
