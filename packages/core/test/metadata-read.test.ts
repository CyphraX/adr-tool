import { describe, expect, it } from 'vitest'
import { readMetadata } from '../src/metadata/read'
import { viewSource } from '../src/text/source'
import { fixture } from './fixtures'

const read = (text: string) => readMetadata(viewSource(text), '0001-test')
const frontmatter = (...lines: string[]) => ['---', ...lines, '---', '', '# Title', ''].join('\n')

describe('readMetadata', () => {
  it('reads every key of the format', () => {
    const { metadata, problems } = read(
      frontmatter(
        'status: accepted',
        'created: 2026-03-02',
        'decided: 2026-03-09',
        'decision-makers: [Kim Becker, Alex Roth]',
        'tags: [persistence]',
        'supersedes: [0001-sqlite-for-everything]',
        'depends-on: [0002-event-sourced-orders]',
        'amended-by: [0009-postgres-for-read-model]',
        'corrections:',
        '  - date: 2026-09-19',
        '    author: Kim Becker',
        '    note: Spelling',
        'nav_order: 3'
      )
    )
    expect(problems).toEqual([])
    expect(metadata).toMatchObject({
      status: 'accepted',
      created: '2026-03-02',
      decided: '2026-03-09',
      decisionMakers: ['Kim Becker', 'Alex Roth'],
      tags: ['persistence'],
      relations: {
        supersedes: ['0001-sqlite-for-everything'],
        amends: [],
        'depends-on': ['0002-event-sourced-orders'],
        'relates-to': []
      },
      backReferences: { 'superseded-by': [], 'amended-by': ['0009-postgres-for-read-model'] },
      corrections: [{ date: '2026-09-19', author: 'Kim Becker', note: 'Spelling' }]
    })
    expect(metadata.present).toEqual([
      'status',
      'created',
      'decided',
      'decision-makers',
      'tags',
      'supersedes',
      'depends-on',
      'amended-by',
      'corrections'
    ])
  })

  it('takes a file without Metadata as an accepted ADR without Relations', () => {
    const { metadata, problems, writable } = read(fixture('own/0003-no-frontmatter.md'))
    expect(problems).toEqual([])
    expect(writable).toBe(true)
    expect(metadata.status).toBe('accepted')
    expect(metadata.present).toEqual([])
  })

  it('reads block lists, quoted values, a single value as a list of one, and empty values', () => {
    const { metadata, problems } = read(
      frontmatter(
        'status: "proposed"',
        "created: '2026-03-02'",
        'tags:',
        '  - a',
        '  - "b c"',
        'supersedes: 0001-only-one',
        'amends:',
        'relates-to: []'
      )
    )
    expect(problems).toEqual([])
    expect(metadata.status).toBe('proposed')
    expect(metadata.created).toBe('2026-03-02')
    expect(metadata.tags).toEqual(['a', 'b c'])
    expect(metadata.relations.supersedes).toEqual(['0001-only-one'])
    expect(metadata.relations.amends).toEqual([])
    expect(metadata.relations['relates-to']).toEqual([])
  })

  it('keeps values as the text their author wrote, whatever YAML makes of them', () => {
    const { metadata, problems } = read(frontmatter('tags: [2024, true, 0x10]'))
    expect(problems).toEqual([])
    expect(metadata.tags).toEqual(['2024', 'true', '0x10'])
  })

  it('reports a Status outside the five values and keeps it as written', () => {
    const { metadata, problems } = read(frontmatter('status: on hold'))
    expect(metadata.status).toBeUndefined()
    expect(metadata.rawStatus).toBe('on hold')
    expect(problems).toMatchObject([{ kind: 'invalid-metadata', key: 'status' }])
  })

  it('understands a Status in the wrong case, and says so', () => {
    const { metadata, problems } = read(frontmatter('status: Accepted'))
    expect(metadata.status).toBe('accepted')
    expect(problems).toEqual([
      { kind: 'status-not-lowercase', adr: '0001-test', written: 'Accepted' }
    ])
  })

  it('reports malformed dates, wrong types and a decision date on a proposed ADR', () => {
    const { metadata, problems } = read(
      frontmatter(
        'status: proposed',
        'created: 2026-02-30',
        'decided: 2026-03-09',
        'tags: { a: b }',
        'corrections:',
        '  - note: no date'
      )
    )
    expect(metadata.created).toBeUndefined()
    expect(metadata.tags).toEqual([])
    expect(metadata.corrections).toEqual([])
    expect(problems.map((problem) => 'key' in problem && problem.key).sort()).toEqual([
      'corrections',
      'created',
      'decided',
      'tags'
    ])
  })

  it('does not guess at frontmatter it cannot read, and marks the file as not writable', () => {
    const unterminated = read(fixture('own/0006-unterminated.md'))
    expect(unterminated.problems).toEqual([{ kind: 'unterminated-frontmatter', adr: '0001-test' }])
    expect(unterminated.writable).toBe(false)

    for (const lines of [['status: [unclosed'], ['status: a', 'status: b'], ['- a list']]) {
      const { problems, writable, metadata } = read(frontmatter(...lines))
      expect(problems).toMatchObject([{ kind: 'invalid-frontmatter' }])
      // One sentence that stands on its own; the library's quote of the source is left out.
      expect(problems[0]).toHaveProperty('detail', expect.stringMatching(/[^:\n]$/))
      expect(writable).toBe(false)
      expect(metadata.status).toBe('accepted')
    }
  })
})
