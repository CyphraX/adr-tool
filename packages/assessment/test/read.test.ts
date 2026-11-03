import { describe, expect, it } from 'vitest'
import { memoryFileSystem, readConfig } from '@adr-tool/kernel'
import {
  isFileId,
  openAssessments,
  qualityAttributeOf,
  readAssessment,
  readLocations,
  readRegisterEntry,
  readSnapshot,
  wordingOf
} from '../src'

const DIR = 'docs/architecture/assessments'

/** An Assessment as a person writes one, with everything the format lets them do. */
const BY_HAND = [
  '---',
  'date: 2026-11-03',
  'authors: Aylin Demir',
  'scope:',
  '  - cart',
  '  - web # the page',
  'previous: 20260512-a-first-look',
  'nav_order: 2',
  '---',
  '',
  '# The shop',
  '',
  'Some words first.',
  '',
  '```yaml',
  'not: an entry',
  '```',
  '',
  '## Was wir wissen wollen',
  '',
  '#### Fast totals',
  '',
  '~~~ yml',
  'scenario: S1',
  'attribute: performance-efficiency',
  'stimulus: >',
  '  adds a product',
  '  to a large cart',
  'response: "the total"',
  'measure: within 100 ms',
  'importance: H',
  'owner: Lena # a key of others',
  '~~~',
  '',
  'Why it is rated so.',
  '',
  '##### A deeper heading belongs to the text',
  '',
  'More.',
  '',
  '#### Slow pages',
  '',
  '```yaml',
  'scenario: S2',
  'attribute: maintainability/capacity',
  'stimulus: x',
  'importance: X',
  'rating: excellent',
  '```',
  '',
  '## Was wir fanden',
  '',
  '### A finding',
  '',
  '```yaml',
  'finding: F1',
  'scenarios: S1',
  'evidence:',
  '  - metric: instability',
  '    component: cart',
  '  - violation: no-cycles',
  '    cycle: [web, cart]',
  '  - annotation: 20261102-x',
  '  - just a text',
  '  - risk: a',
  '    debt: b',
  '  - violation: web-through-cart',
  '    from: web',
  '```',
  '',
  'Text without a heading before its block:',
  '',
  '```yaml',
  'finding: F2',
  '```',
  '',
  '### Both',
  '',
  '```yaml',
  'scenario: S9',
  'finding: F9',
  '```',
  '',
  '### Bad ID',
  '',
  '```yaml',
  'finding: "F 3"',
  '```',
  '',
  '### Again',
  '',
  '```yaml',
  'finding: F1',
  '```',
  '',
  '### Broken',
  '',
  '```yaml',
  'finding: F4',
  'finding: F5',
  '```',
  '',
  '### Never closed',
  '',
  '```yaml',
  'finding: F6',
  ''
].join('\n')

describe('reading an Assessment', () => {
  it('reads its frontmatter, its title and its entries, wherever they stand', () => {
    const { assessment, problems } = readAssessment('20261103-the-shop', `${DIR}/x.md`, BY_HAND)
    expect(assessment).toMatchObject({
      title: 'The shop',
      date: '2026-11-03',
      status: 'draft',
      authors: ['Aylin Demir'],
      scope: ['cart', 'web'],
      previous: '20260512-a-first-look',
      writable: true
    })
    expect(assessment.scenarios[0]).toEqual({
      id: 'S1',
      title: 'Fast totals',
      line: 21,
      level: 4,
      text: 'Why it is rated so.\n\n##### A deeper heading belongs to the text\n\nMore.',
      attribute: { characteristic: 'performance-efficiency' },
      stimulus: 'adds a product to a large cart\n',
      response: 'the total',
      measure: 'within 100 ms',
      importance: 'H'
    })
    expect(assessment.scenarios[1]).toMatchObject({ id: 'S2', title: 'Slow pages' })
    expect(assessment.scenarios[1]!.attribute).toBeUndefined()
    expect(assessment.findings.map((finding) => finding.id)).toEqual(['F1'])
    expect(assessment.findings[0]).toMatchObject({
      scenarios: ['S1'],
      evidence: [
        { kind: 'metric', metric: 'instability', subject: { component: 'cart' }, line: 59 },
        {
          kind: 'violation',
          violation: { kind: 'cycle', rule: 'no-cycles', cycle: ['web', 'cart'] },
          line: 61
        },
        { kind: 'annotation', id: '20261102-x', line: 63 }
      ]
    })

    expect(problems.map((problem) => [problem.kind, 'line' in problem ? problem.line : 0])).toEqual(
      [
        ['entry-without-heading', 73],
        ['entry-of-two-kinds', 79],
        ['invalid-entry-id', 86],
        ['duplicate-entry', 92],
        ['unreadable-entry', 98],
        ['unreadable-entry', 105],
        ['missing-entry-key', 43],
        ['missing-entry-key', 43],
        ['unknown-quality-attribute', 45],
        ['invalid-entry-value', 47],
        ['invalid-entry-value', 48],
        ['invalid-evidence', 64],
        ['invalid-evidence', 65],
        ['invalid-evidence', 67]
      ]
    )
    expect(problems.map(wordingOf)).toEqual([
      `${DIR}/x.md, line 73: the block of F2 does not directly follow a heading of level 2 to 6, which gives the entry its title.`,
      `${DIR}/x.md, line 79: a block is either a Quality Scenario or a Finding, and has both "scenario" and "finding".`,
      `${DIR}/x.md, line 86: "F 3" is no ID of an entry: letters, digits, ".", "_" and "-", beginning with a letter or a digit.`,
      `${DIR}/x.md, line 92: F1 is there twice among its Findings. The first one counts.`,
      `${DIR}/x.md, line 98: the block of an entry cannot be read: it is not valid YAML: Map keys must be unique.`,
      `${DIR}/x.md, line 105: the block of an entry cannot be read: its fence is never closed.`,
      `${DIR}/x.md: S2 has no "response", which a Quality Scenario needs.`,
      `${DIR}/x.md: S2 has no "measure", which a Quality Scenario needs.`,
      `${DIR}/x.md: S2 is about "maintainability/capacity", which is no characteristic of ISO/IEC 25010, nor one of its sub-characteristics.`,
      `${DIR}/x.md: S2: "importance" must be H, M or L.`,
      `${DIR}/x.md: S2: "rating" must be met, partly-met or not-met.`,
      `${DIR}/x.md, line 64: a piece of evidence of F1 is no mapping.`,
      `${DIR}/x.md, line 65: a piece of evidence of F1 names more than one of violation, metric, annotation, adr, risk and debt.`,
      `${DIR}/x.md, line 67: a piece of evidence of F1 needs "to" as a text.`
    ])
  })

  it('reads what it can of a file whose frontmatter cannot be read, and writes nothing into it', () => {
    const open = readAssessment('x', `${DIR}/x.md`, '---\ndate: 2026-11-03\n\n# Never closed\n')
    expect(open.assessment).toMatchObject({ status: undefined, writable: false, scenarios: [] })
    expect(open.problems.map(wordingOf)).toEqual([
      `${DIR}/x.md cannot be read: its frontmatter is never closed.`
    ])
    const twice = readAssessment('x', `${DIR}/x.md`, '---\ndate: 1\ndate: 2\n---\n# Twice\n')
    expect(twice.assessment).toMatchObject({ title: 'Twice', writable: false })
    expect(twice.problems.map(wordingOf)).toEqual([
      `${DIR}/x.md cannot be read: its frontmatter is not valid YAML: Map keys must be unique.`
    ])
    const list = readAssessment('x', `${DIR}/x.md`, '---\n- a\n---\n')
    expect(list.problems.map(wordingOf)).toEqual([
      `${DIR}/x.md cannot be read: its frontmatter must be a mapping.`
    ])
  })

  it('reads a code block in a list item or a quote as text of the author, and stays in step after it', () => {
    const scenario = (id: string) => [
      '```yaml',
      `scenario: ${id}`,
      'attribute: security',
      'stimulus: s',
      'response: r',
      'measure: m',
      '```'
    ]
    const text = [
      '---',
      'date: 2026-11-03',
      '---',
      '',
      '## One',
      '',
      ...scenario('S1'),
      '',
      '- ```js',
      '  foo()',
      '  ```',
      '',
      '> ```yaml',
      '> scenario: S7',
      '> ```',
      '',
      '1. ```',
      '   ### Not a heading',
      'and the item ends here, its block with it',
      '',
      '### Two',
      '',
      ...scenario('S2'),
      ''
    ].join('\n')
    const { assessment, problems } = readAssessment('x', `${DIR}/x.md`, text)
    expect(problems).toEqual([])
    expect(assessment.scenarios.map((one) => [one.id, one.title])).toEqual([
      ['S1', 'One'],
      ['S2', 'Two']
    ])
  })

  it('reads nothing inside an HTML comment, and says when one hides the rest', () => {
    const block =
      '```yaml\nscenario: S2\nattribute: security\nstimulus: s\nresponse: r\nmeasure: m\n```'
    const closed = readAssessment(
      'x',
      `${DIR}/x.md`,
      `---\ndate: 2026-11-03\n---\n\n<!-- An entry set aside:\n\n## Two\n\n${block}\n-->\n\n## Three\n\n${block.replace('S2', 'S3')}\n`
    )
    expect(closed.problems).toEqual([])
    expect(closed.assessment.scenarios.map((one) => one.id)).toEqual(['S3'])
    expect(readAssessment('x', `${DIR}/x.md`, `<!--> # Read\n`).assessment.title).toBeUndefined()
    expect(readAssessment('x', `${DIR}/x.md`, `<!-->\n# Read\n`).assessment.title).toBe('Read')

    const open = readAssessment(
      'x',
      `${DIR}/x.md`,
      `---\ndate: 2026-11-03\n---\n\n<!-- never closed\n\n## Two\n\n${block}\n`
    )
    expect(open.assessment.scenarios).toEqual([])
    expect(open.problems.map(wordingOf)).toEqual([
      `${DIR}/x.md, line 10: the block of an entry cannot be read: it lies in an HTML comment that is never closed.`
    ])
  })

  it('gives an entry its title only from a heading of level 2 to 6', () => {
    const { problems } = readAssessment(
      'x',
      `${DIR}/x.md`,
      '# The title\n\n```yaml\nscenario: S1\nattribute: security\nstimulus: s\nresponse: r\nmeasure: m\n```\n'
    )
    expect(problems.map(wordingOf)).toContain(
      `${DIR}/x.md, line 3: the block of S1 does not directly follow a heading of level 2 to 6, which gives the entry its title.`
    )
  })

  it('reads a heading without its closing #s, and a long line in linear time', () => {
    const titled = (line: string) =>
      readAssessment('x', `${DIR}/x.md`, `${line}\n`).assessment.title
    expect(titled('# The shop ##')).toBe('The shop')
    expect(titled('# C#')).toBe('C#')
    expect(titled('# C# #')).toBe('C#')
    expect(titled('#  ###  ')).toBe('')
    expect(titled('# a\t#b')).toBe('a\t#b')
    // A repository is untrusted input: these took seconds with a regular expression that backtracks.
    for (const line of [
      `## a${' \t'.repeat(40_000)}#x`,
      `# a${' '.repeat(80_000)}#x`,
      `# ${'#'.repeat(80_000)}x`
    ]) {
      const started = performance.now()
      readAssessment('x', `${DIR}/x.md`, `---\ndate: 2026-11-03\n---\n\n${line}\n`)
      expect(performance.now() - started).toBeLessThan(1000)
    }
  })

  it('says what is wrong with a value, and reads the file without it', () => {
    const { assessment, problems } = readAssessment(
      'x',
      `${DIR}/x.md`,
      '---\nstatus: done\nauthors: {a: b}\ndate: 3 November\n---\n'
    )
    expect(assessment).toMatchObject({ status: undefined, authors: [], writable: true })
    expect(assessment.date).toBeUndefined()
    expect(problems.map(wordingOf)).toEqual([
      `${DIR}/x.md: "date" must be a date of the form YYYY-MM-DD.`,
      `${DIR}/x.md: "status" must be draft or final.`,
      `${DIR}/x.md: "authors" must be a list of texts.`
    ])
    expect(
      readAssessment('x', `${DIR}/x.md`, '# No frontmatter\n').problems.map(wordingOf)
    ).toEqual([
      `${DIR}/x.md has no date: "date" must say the day of the Assessment, as YYYY-MM-DD.`
    ])
  })

  it('knows the quality attributes of ISO/IEC 25010 and their sub-characteristics', () => {
    expect(qualityAttributeOf('maintainability')).toEqual({ characteristic: 'maintainability' })
    expect(qualityAttributeOf('security/non-repudiation')).toEqual({
      characteristic: 'security',
      subCharacteristic: 'non-repudiation'
    })
    for (const wrong of ['Maintainability', 'maintainability/', 'a/b/c', 'toString', '']) {
      expect(qualityAttributeOf(wrong)).toBeUndefined()
    }
  })
})

describe('reading a Risk and a Technical Debt Item', () => {
  it('reads its state, days, owner and Components, its title and its description', () => {
    const { entry, problems } = readRegisterEntry(
      'risks',
      'r',
      'r.md',
      '---\nstate: mitigated\ndate: 2026-11-03\nchanged: 2026-11-04\nowner: Lena\ncomponents: web\nx: y\n---\n\nBefore.\n\n# The title\n\nAfter.\n'
    )
    expect(problems).toEqual([])
    expect(entry).toEqual({
      register: 'risks',
      id: 'r',
      path: 'r.md',
      title: 'The title',
      description: 'Before.\n\nAfter.',
      state: 'mitigated',
      date: '2026-11-03',
      changed: '2026-11-04',
      owner: 'Lena',
      components: ['web'],
      writable: true
    })
  })

  it('reads a file without frontmatter as open, of nobody, about nothing', () => {
    const { entry, problems } = readRegisterEntry('debt', 'd', 'd.md', 'Just text.\n')
    expect(problems).toEqual([])
    expect(entry).toMatchObject({ state: 'open', components: [], description: 'Just text.' })
    expect(entry.title).toBeUndefined()
  })

  it('says which states each register has', () => {
    const risk = readRegisterEntry('risks', 'r', 'r.md', '---\nstate: paid-off\n---\n')
    expect(risk.entry.state).toBeUndefined()
    expect(risk.problems.map(wordingOf)).toEqual([
      'r.md: "state" must be open, mitigated, accepted or closed.'
    ])
    const debt = readRegisterEntry('debt', 'd', 'd.md', '---\nstate: mitigated\n---\n')
    expect(debt.problems.map(wordingOf)).toEqual([
      'd.md: "state" must be open, scheduled or paid-off.'
    ])
    const open = readRegisterEntry('debt', 'd', 'd.md', '---\nstate: [\n---\n')
    expect(open.entry.writable).toBe(false)
    expect(open.problems[0]!.kind).toBe('unreadable-debt-item')
  })
})

describe('reading a Snapshot', () => {
  it('reads its commit, its day and its numbers, a name a later version brings among them', () => {
    const text = [
      '# A comment',
      `commit: ${'a'.repeat(40)}`,
      'date: 2026-11-03',
      'components:',
      '  cart:',
      '    instability: 0.5',
      '    some-new-metric: 3',
      "  '*':",
      '    propagation-cost: 0.25',
      'source-files:',
      '  cart/Cart.java:',
      '    Cart.total():',
      '      complexity: 1',
      ''
    ].join('\n')
    expect(readSnapshot('s.yml', 'x', text)).toEqual({
      snapshot: {
        path: 's.yml',
        commit: 'a'.repeat(40),
        date: '2026-11-03',
        components: {
          cart: { instability: 0.5, 'some-new-metric': 3 },
          '*': { 'propagation-cost': 0.25 }
        },
        sourceFiles: { 'cart/Cart.java': { 'Cart.total()': { complexity: 1 } } }
      },
      problems: []
    })
  })

  it('says why one cannot be read', () => {
    const said = (text: string): string[] =>
      readSnapshot('s.yml', 'x', text).problems.map(wordingOf)
    expect(said('a: [')[0]).toMatch(/^s\.yml cannot be read: it is not valid YAML: /)
    expect(said('- a\n')).toEqual(['s.yml cannot be read: its top level must be a mapping.'])
    expect(said('commit: abc\n')).toEqual([
      's.yml cannot be read: its "commit" must name the commit by its full name of 40 or 64 hexadecimal digits.'
    ])
    expect(said('date: today\n')).toEqual([
      's.yml cannot be read: its "date" must be a date of the form YYYY-MM-DD.'
    ])
    expect(said('components:\n  cart:\n    instability: high\n')).toEqual([
      's.yml cannot be read: its "components" must map names to numbers.'
    ])
  })
})

describe('reading the directories of a repository', () => {
  it('takes the keys of .arch/config.yml, and the defaults without them', () => {
    const config = readConfig('assessments: design/assessments\nrisks: 123\n')
    expect(readLocations(config)).toEqual({
      directories: {
        assessments: 'design/assessments',
        risks: undefined,
        debt: 'docs/architecture/debt'
      },
      problems: [
        { kind: 'invalid-directory-setting', path: '.arch/config.yml', line: 2, key: 'risks' }
      ]
    })
    expect(wordingOf(readLocations(config).problems[0]!)).toBe(
      '"risks" in .arch/config.yml must be a relative path inside the repository. No Risk is read until it is fixed.'
    )
    expect(readLocations(readConfig('a: [')).directories).toEqual({
      assessments: undefined,
      risks: undefined,
      debt: undefined
    })
  })

  it('reads every Assessment with its Snapshot, ordered by date, and the registers by ID', async () => {
    const fs = memoryFileSystem({
      [`${DIR}/b.md`]: '---\ndate: 2026-05-12\n---\n',
      [`${DIR}/a.md`]: '---\ndate: 2026-11-03\n---\n',
      [`${DIR}/c.md`]: '# No date\n',
      [`${DIR}/a.snapshot.yml`]: 'components: {cart: {files: 3}}\n',
      [`${DIR}/b.snapshot.yml`]: 'components: [\n',
      [`${DIR}/gone.snapshot.yml`]: 'components: {}\n',
      [`${DIR}/README.md`]: '# The Assessments\n',
      [`${DIR}/notes.txt`]: 'not an entry\n',
      [`${DIR}/deeper/d.md`]: '---\ndate: 2026-01-01\n---\n',
      'docs/architecture/risks/z.md': '# Z\n',
      'docs/architecture/risks/y.md': '# Y\n',
      'docs/architecture/debt/x.md': '---\nstate: scheduled\n---\n'
    })
    const reading = await openAssessments(fs)
    expect(reading.assessments.map((assessment) => assessment.id)).toEqual(['b', 'a', 'c'])
    expect(reading.assessments[1]!.snapshot).toMatchObject({ components: { cart: { files: 3 } } })
    expect(reading.assessments[0]!.snapshot).toBeUndefined()
    expect(reading.risks.map((risk) => risk.id)).toEqual(['y', 'z'])
    expect(reading.debtItems.map((item) => item.state)).toEqual(['scheduled'])
    expect(reading.problems.map((problem) => problem.kind)).toEqual([
      'unreadable-snapshot',
      'assessment-without-date',
      'snapshot-without-assessment'
    ])
    expect(wordingOf(reading.problems[2]!)).toBe(
      `${DIR}/gone.snapshot.yml is the Snapshot of gone, and there is no Assessment gone.`
    )
  })

  it('takes a file name for an ID only where it is one part of a path on every system', () => {
    for (const id of ['20261103-a', 'a b', 'ä']) expect(isFileId(id)).toBe(true)
    for (const id of ['a\\b', 'a.', 'a ', 'README', 'readme', '']) expect(isFileId(id)).toBe(false)
  })
})
