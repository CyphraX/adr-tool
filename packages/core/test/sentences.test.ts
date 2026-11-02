import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SENTENCES,
  englishOf,
  memoryFileSystem,
  openRepository,
  planAccept,
  planCreate,
  planDeprecate,
  planEditBody,
  planEditMetadata,
  planMigration,
  planReject,
  planRenameTraces,
  planRenumber,
  planRepair,
  sentenceOf,
  type CoreSaid,
  type Plan,
  type Problem
} from '../src'
import { firstLog } from '../src/log/first'

// What `core` says has a code beside its English sentence (docs/plan-roadmap.md, part 12): the
// window words the code, the command line and the MCP server keep the sentence.

const TODAY = { today: '2026-11-02' }

async function repository(files: Record<string, string>, components?: string[]) {
  const fs = memoryFileSystem(
    Object.fromEntries(
      Object.entries(files).map(([name, text]) => [
        name.includes('/') ? name : `docs/adr/${name}.md`,
        text
      ])
    )
  )
  const opened = await openRepository(fs, components ? { components } : {})
  return { fs, log: opened.logs[0]!, repository: opened }
}

const adr = (...frontmatter: string[]) =>
  ['---', ...frontmatter, '---', '', '# Title', ''].join('\n')

/** A refusal: its reason is the English sentence of its code. */
function refused(plan: Plan): CoreSaid {
  if (plan.ok) throw new Error('planned, not refused')
  expect(plan.said, plan.reason).toBeDefined()
  expect(sentenceOf(SENTENCES, plan.said as CoreSaid)).toBe(plan.reason)
  return plan.said as CoreSaid
}

/** The warnings of a plan: each is the English sentence of the code in the same place. */
function warned(plan: Plan): string[] {
  if (!plan.ok) throw new Error(plan.reason)
  const warnings = plan.warnings ?? []
  expect(plan.warned ?? []).toHaveLength(warnings.length)
  warnings.forEach((warning, position) => {
    expect(englishOf(plan.warned![position] as CoreSaid)).toBe(warning)
  })
  return (plan.warned ?? []).map((said) => said.code)
}

describe('a refusal of core', () => {
  it('carries the code of its reason, whose English is the reason', async () => {
    const { fs, log } = await repository({
      '0001-a': adr('status: accepted'),
      '0002-b': adr('status: On hold'),
      '0003-c': adr('status: proposed', 'supersedes: [0002-b]'),
      '0004-d': '---\nstatus: [\n---\n# D\n',
      '0005-e': adr('status: accepted', 'tags: [\n  a, # first\n  b\n]')
    })

    expect(refused(await planAccept(fs, log, '0001-a', TODAY))).toEqual({
      code: 'accept-needs-proposed',
      values: { adr: '0001-a', is: 'accepted' }
    })
    expect(refused(await planReject(fs, log, '0002-b', TODAY))).toEqual({
      code: 'reject-needs-proposed',
      values: { adr: '0002-b', is: '"On hold"' }
    })
    expect(refused(await planAccept(fs, log, '0003-c', TODAY))).toEqual({
      code: 'supersede-needs-decided',
      values: { adr: '0002-b', is: '"On hold"' }
    })
    expect(refused(await planDeprecate(fs, log, '0009-gone')).code).toBe('no-adr')
    expect(refused(await planDeprecate(fs, log, '0004-d')).code).toBe('frontmatter-unreadable')

    const edit = (id: string, change: Parameters<typeof planEditMetadata>[3]) =>
      planEditMetadata(fs, log, id, change, ['core'])
    expect(refused(await edit('0003-c', { relations: { 'depends-on': ['0003-c'] } })).code).toBe(
      'relation-to-itself'
    )
    expect(refused(await edit('0001-a', { tags: [' '] })).code).toBe('tag-one-line')
    expect(refused(await edit('0001-a', { decisionMakers: [''] })).code).toBe(
      'decision-maker-one-line'
    )
    expect(refused(await edit('0001-a', { affects: ['ui'] })).code).toBe('component-not-declared')
    expect(refused(await edit('0001-a', { relations: { supersedes: ['0002-b'] } })).code).toBe(
      'relations-fixed'
    )
    expect(refused(await edit('0005-e', { tags: ['b'] }))).toEqual({
      code: 'item-by-hand',
      values: { key: 'tags', item: 'a' }
    })

    const create = (title: string, template = 'minimal') =>
      planCreate(fs, log, { title, template, ...TODAY })
    expect(refused(await create('!!!')).code).toBe('title-needs-letter')
    expect(refused(await create('A', 'nonesuch'))).toEqual({
      code: 'no-template',
      values: { name: 'nonesuch' }
    })

    expect(refused(await planRenumber(fs, log, '0001-a')).code).toBe('number-not-shared')
    expect(refused(await planRenameTraces(fs, [log], 'core', 'core')).code).toBe(
      'rename-needs-two-ids'
    )
    expect(
      refused(await planEditBody(fs, log, '0001-a', { base: 'other', body: 'x', ...TODAY })).code
    ).toBe('changed-since-edit')
    expect(
      refused(
        await planRepair(fs, log, { kind: 'remove-item', adr: '0001-a', key: 'tags', item: 'x' })
      ).code
    ).toBe('problem-gone')
    expect(refused(await planMigration(fs, log)).code).toBe('nothing-foreign')
  })

  it('of a foreign file says why it has no Migration, as a code within its code', async () => {
    const { fs, log } = await repository({
      '0001-a': '# 1. A\n\n## Status\n\nSuperseded by ADR 2\n',
      '0002-b': '# 2. B\n\n## Status\n\nAccepted\n'
    })
    const [first] = log.adrs
    expect(first!.noMigrationSaid).toEqual({ code: 'successor-in-status-text', values: {} })
    expect(englishOf(first!.noMigrationSaid!)).toBe(first!.noMigration)

    expect(refused(await planDeprecate(fs, log, '0001-a'))).toEqual({
      code: 'foreign-format-no-migration',
      values: { adr: '0001-a', format: 'adr-tools', why: first!.noMigrationSaid }
    })
    expect(refused(await planDeprecate(fs, log, '0002-b'))).toEqual({
      code: 'foreign-format',
      values: { adr: '0002-b', format: 'adr-tools' }
    })
    const reason = refused(await planMigration(fs, log, '0001-a'))
    expect(reason).toEqual({
      code: 'no-migration',
      values: { adr: '0001-a', why: first!.noMigrationSaid }
    })
  })

  it('that sums up why nothing can be migrated holds each reason as a code', async () => {
    const { fs, log } = await repository({
      '0001-a': '# 1. A\n\n## Status\n\nSuperseded by ADR 2\n'
    })
    const said = refused(await planMigration(fs, log))
    expect(said.code).toBe('nothing-migrated')
    expect(said.values).toEqual({
      reasons: [
        { code: 'no-migration', values: { adr: '0001-a', why: log.adrs[0]!.noMigrationSaid } }
      ]
    })
  })

  it('of the configuration says what is wrong with it as a code', async () => {
    const first = await firstLog(memoryFileSystem({ '.adr-dir': '../elsewhere\n' }))
    if (!('said' in first)) throw new Error('found a log')
    expect(first.said).toEqual({
      code: 'configuration-first',
      values: { path: '.adr-dir', detail: { code: 'adr-dir-outside', values: {} } }
    })
    expect(englishOf(first.said)).toBe(first.reason)
  })
})

describe('the warnings of a plan', () => {
  it('stand beside their codes, in the same order', async () => {
    const { fs, log } = await repository({
      '0001-a': adr('status: accepted'),
      '0001-b': adr('status: accepted'),
      '0002-c': ['---', 'status: accepted', '---', '', '# Title', '', 'See 0001-b.', ''].join('\n'),
      '0003-d': adr('status: superseded')
    })
    expect(warned(await planRenumber(fs, log, '0001-b'))).toEqual(['mentioned-in-text'])
    expect(
      warned(
        await planEditBody(fs, log, '0001-a', {
          base: log.adrs[0]!.body,
          body: '\n# Title\n\nIt costs 20 euros, and many more words than the five or six of a typo were written here now.\n',
          ...TODAY
        })
      )
    ).toEqual(['number-changed', 'many-words-changed'])
    expect(
      warned(await planRepair(fs, log, { kind: 'set-status', adr: '0003-d', status: 'accepted' }))
    ).toEqual(['deprecate-again'])
  })

  it('of a Migration name what is left out with its code', async () => {
    const { fs, log } = await repository({
      '0001-a': '# 1. A\n\n## Status\n\nSuperseded by ADR 2\n',
      '0003-c': '# 3. C\n\n## Status\n\nRejected\n\nProposed\n'
    })
    expect(warned(await planMigration(fs, log))).toContain('no-migration')
  })
})

describe('the detail of a Problem', () => {
  it('has a code whose English is the detail', async () => {
    const { repository: opened } = await repository({
      '0001-a': adr('status: Acceptd', 'created: 2026-13-01', 'tags: {a: b}'),
      '0002-b': '---\n[unclosed\n---\n# B\n',
      '0003-c': '---\n- a list\n---\n# C\n',
      '0004-d': adr('status: proposed', 'decided: 2026-01-01', 'corrections: [x]')
    })
    const problems = opened.logs[0]!.problems.filter(
      (problem): problem is Extract<Problem, { detail: string }> => 'detail' in problem
    )
    expect(problems.map((problem) => problem.said?.code)).toEqual([
      'unknown-status',
      'not-a-date',
      'expected-list',
      'yaml-error',
      'frontmatter-not-mapping',
      'decided-while-proposed',
      'correction-needs-date'
    ])
    for (const problem of problems) expect(englishOf(problem.said!)).toBe(problem.detail)
  })

  it('of the configuration has a code too', async () => {
    for (const config of [
      'logs: x',
      '- a',
      'logs:\n  - path: ../x',
      'logs:\n  - path: a\n    naming: random',
      'logs: ['
    ]) {
      const { problems } = await openRepository(memoryFileSystem({ '.adr/config.yml': config }))
      const [problem] = problems
      if (problem?.kind !== 'invalid-configuration') throw new Error(config)
      expect(englishOf(problem.said!)).toBe(problem.detail)
    }
  })
})

describe('the sentences of core', () => {
  /** Every source file of core and of the kernel it hands on, but the table itself. */
  function sources(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return sources(path)
      return entry.name.endsWith('.ts') && entry.name !== 'sentences.ts'
        ? [readFileSync(path, 'utf8')]
        : []
    })
  }
  const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))
  const code = [...sources(here('../src')), ...sources(here('../../kernel/src'))].join('\n')

  it('have no code that nothing says', () => {
    // The compiler sees to it that every code said is in the table; this, that the table
    // holds nothing else. The kernel's codes are in its own table, said by PendingFiles.
    const kernel = readFileSync(here('../../kernel/src/change/said.ts'), 'utf8')
    for (const name of Object.keys(SENTENCES)) {
      expect(code.includes(`'${name}'`) || kernel.includes(`'${name}'`), name).toBe(true)
    }
  })

  it('leave nothing of their values unsaid', () => {
    const some = new Proxy({} as Record<string, unknown>, {
      get: (_, key: string) =>
        ({
          format: 'madr-2',
          type: 'supersedes',
          number: 7,
          added: 13,
          removed: 2,
          numbers: ['20', '200'],
          keeps: ['Proposed'],
          reasons: [{ code: 'title-needs-letter', values: {} }],
          why: { code: 'successor-in-status-text', values: {} },
          detail: { code: 'expected-list', values: {} }
        })[key] ?? `<${key}>`
    })
    for (const [name, sentence] of Object.entries(SENTENCES)) {
      const said = (sentence as (values: unknown) => string)(some)
      expect(said, name).not.toMatch(/undefined|\[object Object\]|<(format|type|why|detail)>/)
    }
  })
})
