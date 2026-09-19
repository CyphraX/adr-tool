import { describe, expect, it } from 'vitest'
import { groupProblems, memoryFileSystem, openRepository, type DecisionLog } from '../src'

/** A Decision Log in memory: file name → the whole text of the file. */
async function log(files: Record<string, string>): Promise<DecisionLog> {
  const repository = await openRepository(
    memoryFileSystem(
      Object.fromEntries(Object.entries(files).map(([name, text]) => [`docs/adr/${name}.md`, text]))
    )
  )
  return repository.logs[0]!
}

const adr = (...lines: string[]): string => ['---', ...lines, '---', '', '# Title', ''].join('\n')

/** Frontmatter that is not valid YAML: nothing of it can be read. */
const broken = (...lines: string[]): string => adr('status: [accepted', ...lines)

describe('Problems grouped by their root cause', () => {
  it('leaves the Problems of a log in which every file can be read as they are', async () => {
    const read = await log({
      '0001-a': adr('status: accepted', 'depends-on: [0009-gone]'),
      '0002-b': adr('status: Accepted')
    })
    expect(groupProblems(read)).toEqual(
      read.problems.map((problem) => ({ problem, consequences: [] }))
    )
    expect(read.problems).toHaveLength(2)
  })

  it('puts what an unreadable ADR causes on the ADR it supersedes under that ADR', async () => {
    const read = await log({
      '0001-old': adr('status: superseded', 'superseded-by: [0002-new]'),
      '0002-new': broken('supersedes: [0001-old]')
    })
    const groups = groupProblems(read)
    expect(groups.map((group) => group.problem.kind)).toEqual(['invalid-frontmatter'])
    expect(groups[0]!.consequences).toEqual([
      {
        kind: 'unfounded-back-reference',
        adr: '0001-old',
        key: 'superseded-by',
        source: '0002-new'
      },
      { kind: 'superseded-without-successor', adr: '0001-old' }
    ])
  })

  it('puts what is reported on the unreadable ADR itself under it too', async () => {
    const read = await log({
      '0001-old': adr('status: [superseded', 'superseded-by: [0002-new]'),
      '0002-new': adr('status: accepted', 'supersedes: [0001-old]')
    })
    const groups = groupProblems(read)
    expect(groups.map((group) => group.problem.kind)).toEqual(['invalid-frontmatter'])
    expect(groups[0]!.consequences.map((problem) => problem.kind)).toEqual([
      'missing-back-reference',
      'not-marked-superseded'
    ])
  })

  it('handles an unterminated frontmatter the same way', async () => {
    const read = await log({
      '0001-base': adr('status: accepted', 'amended-by: [0002-more]'),
      '0002-more': '---\nstatus: accepted\namends: [0001-base]\n\n# Title\n'
    })
    const groups = groupProblems(read)
    expect(groups.map((group) => group.problem.kind)).toEqual(['unterminated-frontmatter'])
    expect(groups[0]!.consequences.map((problem) => problem.kind)).toEqual([
      'unfounded-back-reference'
    ])
  })

  it('keeps a Problem that would be there anyway on its own', async () => {
    const read = await log({
      '0001-a': adr('status: superseded'),
      '0002-b': broken(),
      '0002-c': adr('status: accepted', 'superseded-by: [0007-gone]')
    })
    const groups = groupProblems(read)
    expect(groups.map((group) => [group.problem.kind, group.consequences.length])).toEqual([
      ['invalid-frontmatter', 0],
      // The file name carries the number, readable frontmatter or not.
      ['unknown-target', 0],
      ['superseded-without-successor', 0],
      ['duplicate-number', 0]
    ])
  })

  it('names a consequence of two unreadable ADRs under the first of them only', async () => {
    const read = await log({
      '0001-old': adr('status: superseded', 'superseded-by: [0002-new, 0003-newer]'),
      '0002-new': broken(),
      '0003-newer': broken()
    })
    const groups = groupProblems(read)
    expect(
      groups.map(({ problem, consequences }) => [
        'adr' in problem && problem.adr,
        consequences.length
      ])
    ).toEqual([
      ['0002-new', 2],
      ['0003-newer', 1]
    ])
  })
})
