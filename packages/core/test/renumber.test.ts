import { describe, expect, it } from 'vitest'
import {
  applyChangeSet,
  memoryFileSystem,
  openRepository,
  planRenumber,
  type ChangeSet
} from '../src'
import { lines } from './fixtures'

/** A Decision Log in memory: file name → the whole file text. */
async function repository(adrs: Record<string, string>) {
  const fs = memoryFileSystem(
    Object.fromEntries(Object.entries(adrs).map(([name, text]) => [`docs/adr/${name}.md`, text]))
  )
  const log = (await openRepository(fs)).logs[0]!
  return { fs, log }
}

const adr = (...frontmatter: string[]) =>
  ['---', ...frontmatter, '---', '', '# Title', ''].join('\n')

/** Per file of a change set: where it moves, and which lines it loses and gains. */
function changes(changeSet: ChangeSet) {
  return Object.fromEntries(
    changeSet.files.map((file) => {
      const [old, now] = [lines(file.before), lines(file.after)]
      return [
        file.path.replace('docs/adr/', ''),
        {
          ...(file.renameTo !== undefined && { renameTo: file.renameTo.replace('docs/adr/', '') }),
          removed: old.filter((line) => !now.includes(line)),
          added: now.filter((line) => !old.includes(line))
        }
      ]
    })
  )
}

/** Two branches each added "0003"; one of them is named by others. */
const collided = {
  '0001-monolith': adr(
    'status: superseded',
    'superseded-by:',
    '  - 0002-services',
    '  - "0003-caching"   # the second attempt'
  ),
  '0002-services': adr('status: accepted', 'supersedes: [0001-monolith]'),
  '0003-caching': adr('status: accepted', 'supersedes: [0001-monolith]', 'tags: [performance]'),
  '0003-logging': adr('status: proposed', "depends-on: [ 0002-services , '0003-caching' ]"),
  '0004-tracing': adr('status: proposed', 'amends: 0003-caching', 'relates-to: [0003-logging]')
}

describe('Renumber', () => {
  it('renames the file to the next number and rewrites every mention of the old ID in place', async () => {
    const { fs, log } = await repository(collided)
    expect(log.problems).toEqual([
      { kind: 'duplicate-number', number: 3, adrs: ['0003-caching', '0003-logging'] }
    ])

    const plan = await planRenumber(fs, log, '0003-caching')
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.renamed).toEqual({ from: '0003-caching', to: '0005-caching' })
    expect(changes(plan.changeSet)).toEqual({
      '0001-monolith.md': {
        removed: ['  - "0003-caching"   # the second attempt\n'],
        added: ['  - "0005-caching"   # the second attempt\n']
      },
      '0003-logging.md': {
        removed: ["depends-on: [ 0002-services , '0003-caching' ]\n"],
        added: ["depends-on: [ 0002-services , '0005-caching' ]\n"]
      },
      '0004-tracing.md': {
        removed: ['amends: 0003-caching\n'],
        added: ['amends: 0005-caching\n']
      },
      '0003-caching.md': { renameTo: '0005-caching.md', removed: [], added: [] }
    })
  })

  it('leaves a log in which the number is free again and every Relation still holds', async () => {
    const { fs, log } = await repository(collided)
    const before = log.relations.map((relation) => ({
      ...relation,
      from: relation.from.replace('0003-caching', '0005-caching'),
      to: relation.to.replace('0003-caching', '0005-caching')
    }))

    const plan = await planRenumber(fs, log, '0003-caching')
    if (!plan.ok) throw new Error(plan.reason)
    const text = await fs.readText('docs/adr/0003-caching.md')
    expect(await applyChangeSet(fs, plan.changeSet)).toEqual({ applied: true })

    expect(await fs.readText('docs/adr/0003-caching.md')).toBeUndefined()
    expect(await fs.readText('docs/adr/0005-caching.md')).toBe(text)
    const after = (await openRepository(fs)).logs[0]!
    expect(after.problems).toEqual([])
    expect(after.adrs.map((candidate) => candidate.id)).toEqual([
      '0001-monolith',
      '0002-services',
      '0003-logging',
      '0004-tracing',
      '0005-caching'
    ])
    const sorted = (relations: typeof before) =>
      [...relations].sort((a, b) =>
        `${a.from} ${a.type} ${a.to}`.localeCompare(`${b.from} ${b.type} ${b.to}`)
      )
    expect(sorted([...after.relations])).toEqual(sorted(before))
  })

  it('moves whichever of the two the person chooses', async () => {
    const { fs, log } = await repository(collided)
    const plan = await planRenumber(fs, log, '0003-logging')
    if (!plan.ok) throw new Error(plan.reason)
    expect(changes(plan.changeSet)).toEqual({
      '0004-tracing.md': {
        removed: ['relates-to: [0003-logging]\n'],
        added: ['relates-to: [0005-logging]\n']
      },
      '0003-logging.md': { renameTo: '0005-logging.md', removed: [], added: [] }
    })
  })

  it('writes the new number as wide as the log writes its numbers', async () => {
    const { fs, log } = await repository({
      '00011-a': adr(),
      '00012-b': adr(),
      '00012-c': adr('relates-to: [00011-a]')
    })
    const plan = await planRenumber(fs, log, '00012-c')
    expect(plan.ok && plan.renamed).toEqual({ from: '00012-c', to: '00013-c' })
  })

  it('keeps the slug as it was written, whatever the tool would have made of it', async () => {
    const { fs, log } = await repository({ '0001-Über_Uns': adr(), '0001-b': adr() })
    const plan = await planRenumber(fs, log, '0001-Über_Uns')
    expect(plan.ok && plan.renamed?.to).toBe('0002-Über_Uns')
  })

  it('does not touch the text of an ADR, and says which texts mention the old ID', async () => {
    const { fs, log } = await repository({
      '0001-a': adr() + 'See [caching](0002-caching.md).\n',
      '0002-caching': adr() + 'This is 0002-caching.\n',
      '0002-logging': adr('relates-to: [0002-caching]')
    })
    const plan = await planRenumber(fs, log, '0002-caching')
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.changeSet.files.map((file) => file.path)).toEqual([
      'docs/adr/0002-logging.md',
      'docs/adr/0002-caching.md'
    ])
    expect(plan.warnings).toEqual([
      '0001-a mentions 0002-caching in its text.',
      '0002-caching mentions 0002-caching in its text.'
    ])
  })

  it('is only for an ADR that shares its number, in a log that has numbers', async () => {
    const { fs, log } = await repository(collided)
    expect(await planRenumber(fs, log, '0002-services')).toEqual({
      ok: false,
      reason:
        'Renumber is for an ADR that shares its number with another one. 0002-services has its number to itself, and its ID stays as it is.'
    })
    expect(await planRenumber(fs, log, '0404-missing')).toEqual({
      ok: false,
      reason: 'There is no ADR 0404-missing in this Decision Log.'
    })

    const dated = await repository({ '20260919-a': adr(), '20260919-b': adr() })
    expect(await planRenumber(dated.fs, dated.log, '20260919-a')).toEqual({
      ok: false,
      reason: 'Only an ADR of a sequential Decision Log has a number.'
    })
  })

  it('is refused when it could not tell what it would leave behind', async () => {
    const itself = await repository({ '0001-a': adr('relates-to: [0001-a]'), '0001-b': adr() })
    expect(await planRenumber(itself.fs, itself.log, '0001-a')).toEqual({
      ok: false,
      reason: '0001-a names itself in relates-to. Remove that before it is renumbered.'
    })

    const unreadable = await repository({
      '0001-a': adr(),
      '0001-b': adr(),
      '0002-c': '---\nsupersedes: [0001-a\n---\n# Broken\n'
    })
    expect(await planRenumber(unreadable.fs, unreadable.log, '0001-a')).toEqual({
      ok: false,
      reason:
        'The frontmatter of 0002-c cannot be read, and the file mentions 0001-a. Fix it before 0001-a is renumbered.'
    })
    const other = await planRenumber(unreadable.fs, unreadable.log, '0001-b')
    expect(other.ok && other.renamed).toEqual({ from: '0001-b', to: '0003-b' })
  })

  it('can move an ADR whose own frontmatter cannot be read: nothing is written into it', async () => {
    const { fs, log } = await repository({
      '0001-a': '---\nstatus: [\n---\n# A\n',
      '0001-b': adr()
    })
    const plan = await planRenumber(fs, log, '0001-a')
    expect(plan.ok && changes(plan.changeSet)).toEqual({
      '0001-a.md': { renameTo: '0002-a.md', removed: [], added: [] }
    })
  })
})

describe('a change set with a rename', () => {
  it('is not applied when the file changed, or when something took the new name', async () => {
    const changed = await repository(collided)
    const plan = await planRenumber(changed.fs, changed.log, '0003-caching')
    if (!plan.ok) throw new Error(plan.reason)
    await changed.fs.writeText('docs/adr/0003-caching.md', adr('status: deprecated'))
    expect(await applyChangeSet(changed.fs, plan.changeSet)).toEqual({
      applied: false,
      conflicts: ['docs/adr/0003-caching.md']
    })

    const taken = await repository(collided)
    const again = await planRenumber(taken.fs, taken.log, '0003-caching')
    if (!again.ok) throw new Error(again.reason)
    await taken.fs.writeText('docs/adr/0005-caching.md', 'Somebody else was faster.\n')
    expect(await applyChangeSet(taken.fs, again.changeSet)).toEqual({
      applied: false,
      conflicts: ['docs/adr/0005-caching.md']
    })
    expect(await taken.fs.readText('docs/adr/0005-caching.md')).toBe('Somebody else was faster.\n')
    expect(await taken.fs.readText('docs/adr/0001-monolith.md')).toBe(collided['0001-monolith'])
  })

  it('writes what changed in the renamed file to its new place', async () => {
    const fs = memoryFileSystem({ 'a.md': 'old\n', 'b.md': 'stays\n' })
    const changeSet: ChangeSet = {
      files: [{ path: 'a.md', before: 'old\n', after: 'new\n', renameTo: 'c.md' }]
    }
    expect(await applyChangeSet(fs, changeSet)).toEqual({ applied: true })
    expect(await fs.readText('a.md')).toBeUndefined()
    expect(await fs.readText('c.md')).toBe('new\n')
    expect(await fs.readText('b.md')).toBe('stays\n')
  })
})
