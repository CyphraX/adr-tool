import { describe, expect, it } from 'vitest'
import { applyChangeSet, applyEdits, memoryFileSystem } from '@adr-tool/kernel'
import {
  planAddException,
  planAddRule,
  planChangeRule,
  planConformanceRepair,
  planRemoveRule,
  readRules,
  repairOf,
  RULES_PATH,
  type RuleDraft
} from '../src'
import {
  addExceptionEdits,
  addRuleEdits,
  changeRuleEdits,
  narrowExceptionEdits,
  removeExceptionEdits,
  removeRuleEdits,
  renderRule
} from '../src/write'
import { checked, shop, yaml } from './repository'

const file = yaml(
  '# The Rules of the shop',
  'rules:',
  '  - id: billing-not-web',
  '    why: Billing is the domain.   # said in review',
  '    kind: must-not-depend',
  '    from: billing',
  '    to: [web]',
  '',
  '  - id: layered',
  '    why: Top down.',
  '    kind: layers',
  '    layers: [web, billing, persistence]',
  '    owner: lena',
  '',
  'exceptions:',
  '  - rule: billing-not-web',
  '    from: billing',
  '    to: web',
  '    reason: The invoice formats dates like the web.',
  '    justified-by: docs/adr/0001-invoices-format-dates-like-the-web'
)

const notWeb: RuleDraft = {
  id: 'persistence-alone',
  why: 'What is stored knows nothing of the domain: it is only stored.',
  kind: 'may-only-depend',
  from: ['persistence'],
  to: []
}

const after = (text: string, edits: ReturnType<typeof addRuleEdits>): string =>
  applyEdits(text, edits)

describe('a new Rule (docs/conformance-format.md, section 1, "How it is written")', () => {
  it('is appended to the end of rules in block style, as the items before it are spaced', () => {
    const written = after(file, addRuleEdits(file, notWeb))
    expect(written).toBe(
      file.replace(
        '    owner: lena\n',
        [
          '    owner: lena',
          '',
          '  - id: persistence-alone',
          '    why: "What is stored knows nothing of the domain: it is only stored."',
          '    kind: may-only-depend',
          '    from: persistence',
          '    to: []',
          ''
        ].join('\n')
      )
    )
    const read = readRules(written)
    expect(read.problems).toEqual([])
    expect(read.rules.map((rule) => rule.id)).toEqual([
      'billing-not-web',
      'layered',
      'persistence-alone'
    ])
  })

  it('writes every kind as the reader reads it back', () => {
    const drafts: RuleDraft[] = [
      { id: 'a', why: 'A.', kind: 'must-not-depend', from: ['ui/**'], to: ['persistence', 'db'] },
      {
        id: 'b',
        why: 'B.',
        kind: 'layers',
        layers: [['app'], ['cli', 'mcp'], ['kernel']],
        mode: 'strict'
      },
      { id: 'c', why: 'C.', kind: 'no-cycles', scope: 'among', components: ['*'] },
      { id: 'd', why: 'D.', kind: 'no-cycles', scope: 'inside', components: ['kernel', 'core/*'] },
      {
        id: 'e',
        why: 'E.',
        kind: 'threshold',
        metric: 'instability',
        max: 0.2,
        of: ['kernel'],
        tests: true
      },
      {
        id: 'f',
        why: 'F.',
        kind: 'may-only-depend',
        from: ['app'],
        to: ['**'],
        ignoreTypeOnly: true
      }
    ]
    let text = ''
    for (const draft of drafts) text = after(text, addRuleEdits(text, draft))
    expect(text).toBe(
      yaml(
        'rules:',
        '  - id: a',
        '    why: A.',
        '    kind: must-not-depend',
        '    from: ui/**',
        '    to: [persistence, db]',
        '  - id: b',
        '    why: B.',
        '    kind: layers',
        '    layers: [app, [cli, mcp], kernel]',
        '    mode: strict',
        '  - id: c',
        '    why: C.',
        '    kind: no-cycles',
        "    among: '*'",
        '  - id: d',
        '    why: D.',
        '    kind: no-cycles',
        '    inside: [kernel, core/*]',
        '  - id: e',
        '    why: E.',
        '    kind: threshold',
        '    metric: instability',
        '    max: 0.2',
        '    of: kernel',
        '    tests: included',
        '  - id: f',
        '    why: F.',
        '    kind: may-only-depend',
        '    from: app',
        "    to: ['**']",
        '    type-only: ignored'
      )
    )
    const read = readRules(text)
    expect(read.problems).toEqual([])
    expect(read.rules.map((rule) => ({ ...rule, line: 0, names: [] }))).toEqual(
      drafts.map((draft) => ({ tests: false, ignoreTypeOnly: false, ...draft, line: 0, names: [] }))
    )
  })

  it('takes the indentation of the list it joins, and its line breaks', () => {
    const flat = 'rules:\r\n- id: a\r\n  why: A.\r\n  kind: no-cycles\r\n  among: x\r\n'
    expect(after(flat, addRuleEdits(flat, notWeb))).toBe(
      flat +
        '- id: persistence-alone\r\n  why: "What is stored knows nothing of the domain: it is only stored."\r\n  kind: may-only-depend\r\n  from: persistence\r\n  to: []\r\n'
    )
  })

  it('starts the list where there is none, and the file where there is none', () => {
    expect(after('', addRuleEdits('', notWeb))).toBe(renderRule(notWeb))
    expect(renderRule(notWeb).startsWith('rules:\n  - id: persistence-alone\n')).toBe(true)
    const onlyExceptions = 'exceptions: []\n'
    expect(after(onlyExceptions, addRuleEdits(onlyExceptions, notWeb))).toBe(
      onlyExceptions + renderRule(notWeb)
    )
    const empty = '# Nothing yet\nrules: []   # to come\n'
    expect(after(empty, addRuleEdits(empty, notWeb))).toBe(
      '# Nothing yet\nrules:   # to come\n' + renderRule(notWeb).slice('rules:\n'.length)
    )
    const noBreak = 'rules:\n  - id: a\n    why: A.\n    kind: no-cycles\n    among: x'
    expect(readRules(after(noBreak, addRuleEdits(noBreak, notWeb))).rules).toHaveLength(2)
  })

  it('refuses an ID that is taken, and a Rule the reader would not read', () => {
    expect(() => addRuleEdits(file, { ...notWeb, id: 'layered' })).toThrow(
      'There is a Rule layered already.'
    )
    expect(() => addRuleEdits(file, { ...notWeb, id: 'Not An ID' })).toThrow(
      'A Rule cannot be checked: "Not An ID" is not a valid Rule ID'
    )
    expect(() => addRuleEdits(file, { ...notWeb, why: '  ' })).toThrow('it has no "why"')
    expect(() =>
      addRuleEdits(file, { id: 'x', why: 'X.', kind: 'layers', layers: [['a']], mode: 'relaxed' })
    ).toThrow('"layers" must list at least two layers')
  })

  it('refuses a file it cannot write without rewriting more, with a sentence', () => {
    const flow = '{rules: [{id: a, why: A., kind: no-cycles, among: x}]}\n'
    expect(() => addRuleEdits(flow, notWeb)).toThrow(
      `${RULES_PATH} is written in a way the suite cannot add a Rule to without rewriting more of it: its top level is written in braces. Change it in an editor.`
    )
    const flowList = 'rules: [{id: a, why: A., kind: no-cycles, among: x}]\n'
    expect(() => addRuleEdits(flowList, notWeb)).toThrow('"rules" is written in brackets')
    expect(() => addRuleEdits('rules: [\n', notWeb)).toThrow(
      `${RULES_PATH} cannot be read, so the suite cannot write into it. Fix the file first.`
    )
  })
})

describe('a changed Rule', () => {
  it('changes the lines of its keys and nothing else', () => {
    const changed: RuleDraft = {
      id: 'billing-not-web',
      why: 'Billing is the domain.',
      kind: 'must-not-depend',
      from: ['billing'],
      to: ['web', 'shipping']
    }
    expect(after(file, changeRuleEdits(file, 'billing-not-web', changed))).toBe(
      file.replace('    to: [web]', '    to: [web, shipping]')
    )
  })

  it('keeps foreign keys and values written as the draft says them already', () => {
    const changed: RuleDraft = {
      id: 'layered',
      why: 'Top down.',
      kind: 'layers',
      layers: [['web'], ['billing'], ['persistence']],
      mode: 'strict'
    }
    expect(after(file, changeRuleEdits(file, 'layered', changed))).toBe(
      file.replace('    owner: lena\n', '    owner: lena\n    mode: strict\n')
    )
    const relaxed = file.replace('    owner: lena\n', '    mode: relaxed\n    owner: lena\n')
    expect(changeRuleEdits(relaxed, 'layered', { ...changed, mode: 'relaxed' })).toEqual([])
  })

  it('takes out the keys a new kind does not have, and adds the ones it has', () => {
    const changed: RuleDraft = {
      id: 'billing-not-web',
      why: 'Billing is the domain.',
      kind: 'no-cycles',
      scope: 'among',
      components: ['billing', 'web']
    }
    const written = after(file, changeRuleEdits(file, 'billing-not-web', changed))
    expect(written).toBe(
      file.replace(
        '    kind: must-not-depend\n    from: billing\n    to: [web]\n',
        '    kind: no-cycles\n    among: [billing, web]\n'
      )
    )
  })

  it('keeps a block list a block list', () => {
    const block = yaml(
      'rules:',
      '  - id: a',
      '    why: A.',
      '    kind: must-not-depend',
      '    from: ui',
      '    to:',
      '      - db',
      '      - files'
    )
    const changed: RuleDraft = {
      id: 'a',
      why: 'A.',
      kind: 'must-not-depend',
      from: ['ui'],
      to: ['db', 'net']
    }
    expect(after(block, changeRuleEdits(block, 'a', changed))).toBe(
      block.replace('      - files', '      - net')
    )
  })

  it('renames the Rule in its Exceptions when its ID changes', async () => {
    const fs = memoryFileSystem({ [RULES_PATH]: file })
    const plan = await planChangeRule(fs, 'billing-not-web', {
      id: 'billing-apart',
      why: 'Billing is the domain.',
      kind: 'must-not-depend',
      from: ['billing'],
      to: ['web']
    })
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.changeSet.files[0]!.after).toBe(
      file
        .replace('  - id: billing-not-web', '  - id: billing-apart')
        .replace('  - rule: billing-not-web', '  - rule: billing-apart')
    )
  })

  it('refuses where a comment would be lost, a Rule that is gone, and a change that changes nothing', () => {
    const commented = yaml(
      'rules:',
      '  - id: a',
      '    why: A.',
      '    kind: must-not-depend',
      '    from: ui',
      '    to:',
      '      - db   # the database',
      '      - files'
    )
    const draft: RuleDraft = {
      id: 'a',
      why: 'A.',
      kind: 'must-not-depend',
      from: ['ui'],
      to: ['db']
    }
    expect(() => changeRuleEdits(commented, 'a', draft)).toThrow('a comment would be lost')
    expect(() => changeRuleEdits(file, 'gone', draft)).toThrow(
      `${RULES_PATH} has no Rule gone. Look at the file again.`
    )
    expect(() => changeRuleEdits(file, 'layered', { ...draft, id: 'billing-not-web' })).toThrow(
      'There is a Rule billing-not-web already.'
    )
    const anchored = file.replace('    from: billing\n', '    from: &b billing\n')
    expect(() => changeRuleEdits(anchored, 'billing-not-web', draft)).toThrow(
      'an anchor or an alias'
    )
  })
})

describe('a removed Rule', () => {
  it('takes its lines, and its Exceptions with them', async () => {
    const fs = memoryFileSystem({ [RULES_PATH]: file })
    const plan = await planRemoveRule(fs, 'billing-not-web')
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.changeSet.files[0]!.after).toBe(
      yaml(
        '# The Rules of the shop',
        'rules:',
        '  - id: layered',
        '    why: Top down.',
        '    kind: layers',
        '    layers: [web, billing, persistence]',
        '    owner: lena',
        '',
        'exceptions:'
      )
    )
  })

  it('leaves the spacing of the items as it was', () => {
    const three = yaml(
      'rules:',
      '  # The first',
      '  - id: a',
      '    why: A.',
      '    kind: no-cycles',
      '    among: x',
      '',
      '  - id: b',
      '    why: B.',
      '    kind: no-cycles',
      '    among: x',
      '',
      '  - id: c',
      '    why: C.',
      '    kind: no-cycles',
      '    among: x',
      '',
      'exceptions: []'
    )
    const without = (id: string): string => after(three, removeRuleEdits(three, id))
    expect(without('a')).toBe(three.replace(/ {2}# The first\n[^]*?\n\n(?= {2}- id: b)/, ''))
    expect(without('b')).toBe(three.replace(/ {2}- id: b\n[^]*?\n\n(?= {2}- id: c)/, ''))
    expect(without('c')).toBe(three.replace(/ {2}- id: c\n[^]*?\n\n(?=exceptions)/, ''))
  })
})

describe('Exceptions', () => {
  it('are appended to the list of Exceptions, which is started where there is none', () => {
    const accepted = {
      fingerprint: { kind: 'dependency' as const, rule: 'layered', from: 'persistence', to: 'web' },
      reason: 'The store renders a page while it is migrated.',
      justifiedBy: 'docs/adr/0002-a-store-that-renders'
    }
    expect(after(file, addExceptionEdits(file, accepted))).toBe(
      yaml(
        file.trimEnd(),
        '  - rule: layered',
        '    from: persistence',
        '    to: web',
        '    reason: The store renders a page while it is migrated.',
        '    justified-by: docs/adr/0002-a-store-that-renders'
      )
    )
    const rulesOnly = file.slice(0, file.indexOf('exceptions:'))
    expect(after(rulesOnly, addExceptionEdits(rulesOnly, accepted))).toBe(
      rulesOnly +
        yaml(
          'exceptions:',
          '  - rule: layered',
          '    from: persistence',
          '    to: web',
          '    reason: The store renders a page while it is migrated.',
          '    justified-by: docs/adr/0002-a-store-that-renders'
        )
    )
  })

  it('refuses one that names a fingerprint already accepted, or a Rule that is not there', () => {
    const fingerprint = {
      kind: 'dependency' as const,
      rule: 'billing-not-web',
      from: 'billing',
      to: 'web'
    }
    expect(() => addExceptionEdits(file, { fingerprint, reason: 'Again.' })).toThrow(
      'There is an Exception billing-not-web: billing -> web already.'
    )
    expect(() =>
      addExceptionEdits(file, { fingerprint: { ...fingerprint, rule: 'gone' }, reason: 'R.' })
    ).toThrow(`${RULES_PATH} has no Rule gone.`)
    expect(() =>
      addExceptionEdits(file, {
        fingerprint: { kind: 'component', rule: 'layered', component: 'web' },
        reason: 'R.'
      })
    ).toThrow('names its Violation by "from" and "to"')
    expect(() =>
      addExceptionEdits(file, { fingerprint: { ...fingerprint, to: 'shipping' }, reason: ' ' })
    ).toThrow('it has no "reason"')
  })

  it('refuses an ADR that is not there, when it is told which ADRs there are', async () => {
    const fs = memoryFileSystem({ [RULES_PATH]: file })
    const plan = await planAddException(
      fs,
      {
        fingerprint: { kind: 'dependency', rule: 'layered', from: 'persistence', to: 'web' },
        reason: 'R.',
        justifiedBy: 'docs/adr/0099-never-written'
      },
      { logs: ['docs/adr'], adrs: [{ log: 'docs/adr', id: '0001-x' }] }
    )
    expect(plan).toMatchObject({ ok: false, said: { code: 'unknown-justification' } })
  })

  it('go with the Repair of an Exception that matches nothing, and one that can be narrowed', async () => {
    const rules = yaml(
      'rules:',
      '  - id: features-apart',
      '    why: Features stand alone.',
      '    kind: no-cycles',
      "    among: 'features/*'",
      '  - id: billing-not-web',
      '    why: W.',
      '    kind: must-not-depend',
      '    from: billing',
      '    to: web',
      'exceptions:',
      '  - rule: features-apart',
      '    cycle: [features/a, features/b, web]',
      '    reason: Being untangled.',
      '  - rule: billing-not-web',
      '    from: web',
      '    to: billing',
      '    reason: Backwards.'
    )
    const report = await checked(shop, rules)
    const notes = report.notes.map((note) => repairOf(note))
    const problems = report.problems.map((problem) => repairOf(problem))
    expect(notes).toEqual([
      {
        kind: 'narrow-exception',
        line: 12,
        fingerprint: {
          kind: 'cycle',
          rule: 'features-apart',
          cycle: ['features/a', 'features/b', 'web']
        },
        members: ['features/a', 'features/b']
      }
    ])
    expect(problems).toEqual([
      {
        kind: 'remove-exception',
        line: 15,
        fingerprint: { kind: 'dependency', rule: 'billing-not-web', from: 'web', to: 'billing' }
      }
    ])

    const narrow = notes[0]!
    if (narrow.kind !== 'narrow-exception') throw new Error(narrow.kind)
    expect(after(rules, narrowExceptionEdits(rules, narrow))).toBe(
      rules.replace('[features/a, features/b, web]', '[features/a, features/b]')
    )
    expect(after(rules, removeExceptionEdits(rules, problems[0]!))).toBe(
      rules.replace(/ {2}- rule: billing-not-web\n[^]*$/, '')
    )
    const fs = memoryFileSystem({ ...shop, [RULES_PATH]: rules })
    const repaired = await planConformanceRepair(fs, problems[0]!)
    if (!repaired.ok) throw new Error(repaired.reason)
    expect(await applyChangeSet(fs, repaired.changeSet)).toEqual({ applied: true })
    expect((await checked(shop, await fs.readText(RULES_PATH))).problems).toEqual([])
    // Planned against a file that moved on, it says so rather than taking out another one.
    const moved = rules.replace('rules:\n', 'rules:\n\n')
    expect(() => removeExceptionEdits(moved, problems[0]!)).toThrow(
      `${RULES_PATH} has no Exception billing-not-web: web -> billing at line 15 any more. Look at the file again.`
    )
  })

  it('a duplicate Exception has its Repair too: the second goes', async () => {
    const rules = yaml(
      'rules:',
      '  - id: billing-not-web',
      '    why: W.',
      '    kind: must-not-depend',
      '    from: billing',
      '    to: web',
      'exceptions:',
      '  - rule: billing-not-web',
      '    from: billing',
      '    to: web',
      '    reason: First.',
      '  - rule: billing-not-web',
      '    from: billing',
      '    to: web',
      '    reason: Second.'
    )
    const report = await checked(shop, rules)
    const repair = repairOf(report.problems[0]!)
    expect(repair).toMatchObject({ kind: 'remove-exception', line: 12 })
    expect(after(rules, removeExceptionEdits(rules, repair!))).not.toContain('Second.')
  })
})

describe('planning a Rule', () => {
  it('creates the file where there is none, and warns of a Component that is not declared', async () => {
    const fs = memoryFileSystem({})
    const plan = await planAddRule(fs, notWeb, ['web', 'billing'])
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.changeSet.files).toEqual([
      { path: RULES_PATH, before: '', after: renderRule(notWeb), creates: true }
    ])
    expect(plan.warned).toEqual([
      {
        code: 'unknown-component',
        values: { by: 'rule', owner: 'persistence-alone', key: 'from', component: 'persistence' }
      }
    ])
  })

  it('refuses through the plan with the reason as a code', async () => {
    const fs = memoryFileSystem({ [RULES_PATH]: file })
    expect(await planAddRule(fs, { ...notWeb, id: 'layered' })).toMatchObject({
      ok: false,
      said: { code: 'rule-exists', values: { id: 'layered' } }
    })
    expect(await planRemoveRule(fs, 'gone')).toMatchObject({
      ok: false,
      said: { code: 'no-rule' }
    })
  })
})
