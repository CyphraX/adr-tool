import { describe, expect, it } from 'vitest'
import { applyChangeSet, applyEdits, memoryFileSystem } from '@adr-tool/kernel'
import { planRenameInRules, readRules, RULES_PATH } from '../src'
import { renameInRules } from '../src/rename'
import { yaml } from './repository'

const before = yaml(
  '# The Rules of the shop',
  'rules:',
  '  - id: billing-not-web',
  '    why: Billing is the domain.',
  '    kind: must-not-depend',
  '    from: billing/**   # and its children',
  '    to: [\'web\', "billing-web", web/format]',
  '  - id: layered',
  '    why: Top down.',
  '    kind: layers',
  '    layers:',
  '      - web',
  '      - [billing, shipping]',
  '  - id: no-cycles-inside',
  '    why: W.',
  '    kind: no-cycles',
  '    inside: billing',
  '  - id: among',
  '    why: W.',
  '    kind: no-cycles',
  "    among: '*'",
  '  - id: small',
  '    why: W.',
  '    kind: threshold',
  '    metric: files',
  '    max: 9',
  '    of: [bill*, billing/invoices]',
  'exceptions:',
  '  - rule: billing-not-web',
  '    from: billing',
  '    to: web',
  '    reason: billing is accepted here.',
  '  - rule: no-cycles-inside',
  '    cycle: [billing/a.ts, billing/b.ts]',
  '    reason: R.',
  '  - rule: among',
  '    cycle: [billing, web]',
  '    reason: R.',
  'patterns:',
  '  - id: p',
  '    pattern: layered',
  '    roles:',
  '      middle: [billing]'
)

describe('Rename of a Component in .arch/rules.yml (docs/conformance-format.md, section 7)', () => {
  it('rewrites every ID and pattern that names the Component where it stands, and nothing else', () => {
    const after = applyEdits(before, renameInRules(before, 'billing', 'invoicing'))
    expect(after).toBe(
      before
        .replace('from: billing/**   #', 'from: invoicing/**   #')
        .replace('- [billing, shipping]', '- [invoicing, shipping]')
        .replace('inside: billing', 'inside: invoicing')
        .replace('of: [bill*, billing/invoices]', 'of: [bill*, invoicing/invoices]')
        .replace('    from: billing\n    to: web', '    from: invoicing\n    to: web')
        .replace('cycle: [billing, web]', 'cycle: [invoicing, web]')
        .replace('middle: [billing]', 'middle: [invoicing]')
    )
    // Not a pattern that may match it without naming it, not another Component that begins
    // alike, not the paths of a Cycle inside a Component, not a reason.
    expect(after).toContain('"billing-web"')
    expect(after).toContain('[bill*,')
    expect(after).toContain('cycle: [billing/a.ts, billing/b.ts]')
    expect(after).toContain('reason: billing is accepted here.')
  })

  it('keeps the quoting of a value, and renames a Component below the one renamed', () => {
    const after = applyEdits(before, renameInRules(before, 'web', 'site'))
    expect(after).toContain('to: [\'site\', "billing-web", site/format]')
    expect(after).toContain('      - site\n')
    const nested = applyEdits(before, renameInRules(before, 'billing/invoices', 'billing/bills'))
    expect(nested).toContain('of: [bill*, billing/bills]')
    expect(readRules(nested).problems).toEqual([])
  })

  it('plans a change set, or none where the file is not there or names nothing', async () => {
    const fs = memoryFileSystem({ [RULES_PATH]: before })
    const planned = await planRenameInRules(fs, 'shipping', 'delivery')
    if (!planned.ok) throw new Error(planned.reason)
    expect(planned.changeSet.files).toHaveLength(1)
    await applyChangeSet(fs, planned.changeSet)
    expect(await fs.readText(RULES_PATH)).toBe(before.replace('shipping]', 'delivery]'))

    const untouched = await planRenameInRules(fs, 'nothing', 'else')
    expect(untouched.ok && untouched.changeSet.files).toEqual([])
    const absent = await planRenameInRules(memoryFileSystem({}), 'billing', 'invoicing')
    expect(absent.ok && absent.changeSet.files).toEqual([])
  })

  it('is refused where the file cannot be read, or a value is written in a way a splice cannot serve', async () => {
    const unreadable = await planRenameInRules(
      memoryFileSystem({ [RULES_PATH]: 'rules: [x\n' }),
      'billing',
      'invoicing'
    )
    expect(unreadable).toEqual({
      ok: false,
      reason:
        '.arch/rules.yml cannot be read, so the Rules that name the Component cannot be renamed with it. Fix the file first.',
      said: { code: 'rename-unreadable-rules', values: { path: '.arch/rules.yml' } }
    })
    const aliased = yaml(
      'rules:',
      '  - id: a',
      '    why: W.',
      '    kind: must-not-depend',
      '    from: &core billing',
      '    to: *core'
    )
    const refused = await planRenameInRules(
      memoryFileSystem({ [RULES_PATH]: aliased }),
      'billing',
      'x'
    )
    expect(refused.ok === false && refused.said?.code).toBe('cannot-rename-in-rules')
  })
})
