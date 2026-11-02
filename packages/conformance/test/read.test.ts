import { describe, expect, it } from 'vitest'
import { readRules, wordingOf } from '../src'
import { yaml } from './repository'

const said = (text: string) =>
  readRules(text).problems.map(
    (problem) => `${problem.line}: ${problem.kind}: ${wordingOf(problem)}`
  )

describe('reading .arch/rules.yml (docs/conformance-format.md, section 1)', () => {
  it('has no Rules where the file is not there, or says nothing', () => {
    expect(readRules(undefined)).toMatchObject({ present: false, rules: [], problems: [] })
    for (const text of ['', '# nothing yet\n', 'rules:\n', 'rules: []\nexceptions:\n']) {
      expect(readRules(text)).toMatchObject({ present: true, rules: [], problems: [] })
    }
  })

  it('reads a Rule of each kind, with its defaults', () => {
    const file = readRules(
      yaml(
        'rules:',
        '  - id: a',
        '    why: One.',
        '    kind: must-not-depend',
        '    from: ui/**',
        '    to: [persistence, legacy]',
        '  - id: b',
        '    why: Two.',
        '    kind: may-only-depend',
        '    from: [kernel]',
        '    to: []',
        '    tests: included',
        '    type-only: ignored',
        '  - id: c',
        '    why: Three.',
        '    kind: layers',
        '    mode: strict',
        '    layers:',
        '      - app',
        '      - [cli, mcp]',
        '  - id: d',
        '    why: Four.',
        '    kind: no-cycles',
        "    among: '*'",
        '  - id: e',
        '    why: Five.',
        '    kind: threshold',
        '    metric: instability',
        '    max: 0.5',
        '    of: kernel'
      )
    )
    expect(file.problems).toEqual([])
    expect(file.rules.map(({ names, ...rule }) => ({ ...rule, names: names.length }))).toEqual([
      {
        id: 'a',
        why: 'One.',
        line: 2,
        tests: false,
        ignoreTypeOnly: false,
        kind: 'must-not-depend',
        from: ['ui/**'],
        to: ['persistence', 'legacy'],
        names: 3
      },
      {
        id: 'b',
        why: 'Two.',
        line: 7,
        tests: true,
        ignoreTypeOnly: true,
        kind: 'may-only-depend',
        from: ['kernel'],
        to: [],
        names: 1
      },
      {
        id: 'c',
        why: 'Three.',
        line: 14,
        tests: false,
        ignoreTypeOnly: false,
        kind: 'layers',
        layers: [['app'], ['cli', 'mcp']],
        mode: 'strict',
        names: 3
      },
      {
        id: 'd',
        why: 'Four.',
        line: 21,
        tests: false,
        ignoreTypeOnly: false,
        kind: 'no-cycles',
        scope: 'among',
        components: ['*'],
        names: 1
      },
      {
        id: 'e',
        why: 'Five.',
        line: 25,
        tests: false,
        ignoreTypeOnly: false,
        kind: 'threshold',
        metric: 'instability',
        max: 0.5,
        of: ['kernel'],
        names: 1
      }
    ])
    // Where each name stands, for the Problem of a Component that is not declared.
    expect(file.rules[0]!.names).toEqual([
      { pattern: 'ui/**', key: 'from', line: 5 },
      { pattern: 'persistence', key: 'to', line: 6 },
      { pattern: 'legacy', key: 'to', line: 6 }
    ])
  })

  it('reads tolerantly: flow style, quotes, comments, and keys it does not know', () => {
    const file = readRules(
      yaml(
        'version: 7 # a key of a later version',
        'rules: [{ id: "a", why: One., kind: must-not-depend, from: x, to: y, colour: red }]',
        'exceptions:',
        "  - { rule: a, from: x, to: y, reason: 'Accepted.', note: kept }"
      )
    )
    expect(file.problems).toEqual([])
    expect(file.rules).toMatchObject([{ id: 'a', from: ['x'], to: ['y'] }])
    expect(file.exceptions).toEqual([
      { line: 4, rule: 'a', from: 'x', to: 'y', reason: 'Accepted.' }
    ])
  })

  it('reads Exceptions of every kind, and applied Patterns', () => {
    const file = readRules(
      yaml(
        'exceptions:',
        '  - rule: a',
        '    cycle: [x, y]',
        '    reason: R.',
        '    justified-by: docs/adr/0001-x',
        '  - rule: b',
        '    component: kernel',
        '    reason: R.',
        'patterns:',
        '  - id: shop-hexagon',
        '    pattern: hexagonal',
        '    roles:',
        '      domain: [billing]',
        '      adapters: web'
      )
    )
    expect(file.problems).toEqual([])
    expect(file.exceptions).toEqual([
      {
        line: 2,
        rule: 'a',
        cycle: ['x', 'y'],
        reason: 'R.',
        justifiedBy: { adr: 'docs/adr/0001-x', line: 5 }
      },
      { line: 6, rule: 'b', component: 'kernel', reason: 'R.' }
    ])
    expect(file.patterns).toEqual([
      {
        line: 10,
        id: 'shop-hexagon',
        pattern: 'hexagonal',
        roles: [
          { role: 'domain', components: ['billing'] },
          { role: 'adapters', components: ['web'] }
        ],
        names: [
          { pattern: 'billing', key: 'roles of domain', line: 13 },
          { pattern: 'web', key: 'roles of adapters', line: 14 }
        ]
      }
    ])
  })
})

describe('the Problems of the file (docs/conformance-format.md, section 5)', () => {
  it('cannot read what is not YAML, has no map at the top, or no list where one belongs', () => {
    expect(said('rules:\n  - id: a\n    why: "never closed\n')).toEqual([
      '4: unreadable-rules: .arch/rules.yml cannot be read: it is not valid YAML: Missing closing "quote at line 4, column 1.'
    ])
    expect(said('- a\n- b\n')).toEqual([
      '1: unreadable-rules: .arch/rules.yml cannot be read: its top level must be a map.'
    ])
    expect(said('# Rules\nrules:\n  id: a\n')).toEqual([
      '2: unreadable-rules: .arch/rules.yml cannot be read: "rules" must be a list.'
    ])
    expect(readRules('rules: x\n').rules).toEqual([])
  })

  it('cannot read a file with a key written twice at its top', () => {
    // The second list of Rules would go unchecked, and CI would stay green.
    expect(
      said(
        yaml(
          'rules:',
          '  - {id: a, why: W., kind: must-not-depend, from: x, to: y}',
          'exceptions: []',
          'rules:',
          '  - {id: b, why: W., kind: must-not-depend, from: y, to: x}'
        )
      )
    ).toEqual(['4: unreadable-rules: .arch/rules.yml cannot be read: "rules" is written twice.'])
  })

  it('names the key written twice in a Rule, an Exception or an applied Pattern', () => {
    // The review's probe: the first "to" names a Component that does not matter.
    expect(
      said(
        yaml(
          'rules:',
          '  - id: a-not-b',
          '    why: a is the core and must not use b.',
          '    kind: must-not-depend',
          '    from: a',
          '    to: c-does-not-matter',
          '    to: b',
          'exceptions:',
          '  - rule: a-not-b',
          '    from: a',
          '    from: x',
          '    to: b',
          '    reason: R.',
          'patterns:',
          '  - id: p',
          '    pattern: layered',
          '    roles:',
          '      top: a',
          '      top: b'
        )
      )
    ).toEqual([
      '7: invalid-rule: The Rule a-not-b cannot be checked: "to" is written twice.',
      '11: invalid-exception: An Exception from the Rule a-not-b cannot be read: "from" is written twice.',
      '19: invalid-applied-pattern: The applied Pattern p cannot be read: "top" is written twice.'
    ])
  })

  it('names a Rule without a kind, or with one it does not know, and goes on', () => {
    expect(
      said(
        yaml(
          'rules:',
          '  - id: a',
          '    why: W.',
          '  - id: b',
          '    why: W.',
          '    kind: only-uses-library',
          '  - id: c',
          '    why: W.',
          '    kind: no-cycles',
          '    inside: x'
        )
      )
    ).toEqual([
      "2: unknown-rule-kind: The Rule a has no kind. A Rule's kind is one of must-not-depend, may-only-depend, layers, no-cycles, threshold.",
      '6: unknown-rule-kind: The Rule b has the kind "only-uses-library", which the suite does not know. A Rule\'s kind is one of must-not-depend, may-only-depend, layers, no-cycles, threshold.'
    ])
    expect(
      readRules('rules:\n  - {id: c, why: W., kind: no-cycles, inside: x}\n').rules
    ).toHaveLength(1)
  })

  it('names the key of a Rule that is missing or has the wrong form', () => {
    const rule = (...lines: string[]) =>
      said(yaml('rules:', ...lines.map((line, i) => (i === 0 ? `  - ${line}` : `    ${line}`))))
    expect(rule('why: W.', 'kind: layers')).toEqual([
      '2: invalid-rule: A Rule cannot be checked: it has no "id".'
    ])
    expect(rule('id: Not_An_Id', 'why: W.')).toEqual([
      '2: invalid-rule: A Rule cannot be checked: "Not_An_Id" is not a valid Rule ID, which consists of lowercase letters, digits and dashes, and starts and ends with a letter or a digit.'
    ])
    expect(rule('id: a', 'kind: layers')).toEqual([
      '2: invalid-rule: The Rule a cannot be checked: it has no "why".'
    ])
    expect(rule('id: a', 'why: W.', 'kind: must-not-depend', 'from: x')).toEqual([
      '2: invalid-rule: The Rule a cannot be checked: it has no "to".'
    ])
    expect(rule('id: a', 'why: W.', 'kind: must-not-depend', 'from: {x: y}', 'to: z')).toEqual([
      '5: invalid-rule: The Rule a cannot be checked: "from" must be a Component ID or pattern, or a list of them.'
    ])
    expect(rule('id: a', 'why: W.', 'kind: layers', 'layers: [x]')).toEqual([
      '5: invalid-rule: The Rule a cannot be checked: "layers" must list at least two layers.'
    ])
    expect(rule('id: a', 'why: W.', 'kind: layers', 'layers: [x, y]', 'mode: loose')).toEqual([
      '6: invalid-rule: The Rule a cannot be checked: "mode" is "loose", which is none of relaxed, strict.'
    ])
    expect(rule('id: a', 'why: W.', 'kind: no-cycles', 'among: x', 'inside: y')).toEqual([
      '2: invalid-rule: The Rule a cannot be checked: it must have either "among" or "inside".'
    ])
    expect(
      rule('id: a', 'why: W.', 'kind: threshold', 'metric: complexity', 'max: 3', 'of: x')
    ).toEqual([
      '5: invalid-rule: The Rule a cannot be checked: "complexity" is no metric the suite knows; a metric is one of files, lines, efferent-coupling, afferent-coupling, instability, fan-out, fan-in, relational-cohesion, internal-share.'
    ])
    expect(
      rule('id: a', 'why: W.', 'kind: threshold', 'metric: lines', 'max: "2000"', 'of: x')
    ).toEqual(['6: invalid-rule: The Rule a cannot be checked: "max" must be a number.'])
    expect(rule('id: a', 'why: W.', 'kind: threshold', 'metric: lines', 'of: x')).toEqual([
      '2: invalid-rule: The Rule a cannot be checked: it must have "max", "min" or both.'
    ])
    expect(said('rules:\n  - just a text\n')).toEqual([
      '2: invalid-rule: A Rule cannot be checked: it must be a map of its keys.'
    ])
  })

  it('checks the first of two Rules with one ID, and not the second', () => {
    const file = readRules(
      yaml(
        'rules:',
        '  - {id: a, why: W., kind: must-not-depend, from: x, to: y}',
        '  - {id: a, why: W., kind: must-not-depend, from: y, to: x}'
      )
    )
    expect(file.rules.map((rule) => (rule.kind === 'must-not-depend' ? rule.from : []))).toEqual([
      ['x']
    ])
    expect(file.problems.map((problem) => `${problem.line}: ${wordingOf(problem)}`)).toEqual([
      '3: There is a Rule a already. The first one is checked, this one is not.'
    ])
  })

  it('names what is wrong with an Exception or an applied Pattern', () => {
    expect(
      said(
        yaml(
          'exceptions:',
          '  - rule: a',
          '    from: x',
          '    to: y',
          '  - from: x',
          '    reason: R.',
          'patterns:',
          '  - id: p',
          '    pattern: layered',
          '    roles: [x]'
        )
      )
    ).toEqual([
      '2: invalid-exception: An Exception from the Rule a cannot be read: it has no "reason".',
      '5: invalid-exception: An Exception from a Rule cannot be read: it has no "rule".',
      '8: invalid-applied-pattern: The applied Pattern p cannot be read: "roles" must be a map from each role to Component patterns.'
    ])
  })
})
