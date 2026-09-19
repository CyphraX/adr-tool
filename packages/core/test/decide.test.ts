import { describe, expect, it } from 'vitest'
import { applyChangeSet, memoryFileSystem, openRepository, type Plan } from '../src'
import { planAccept, planDeprecate, planReject } from '../src/lifecycle/decide'
import { lines } from './fixtures'

const today = { today: '2026-09-19' }

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

/** Which lines each file of a plan loses and gains. */
function changes(plan: Plan): Record<string, { removed: string[]; added: string[] }> {
  if (!plan.ok) throw new Error(plan.reason)
  return Object.fromEntries(
    plan.changeSet.files.map((file) => {
      const [old, now] = [lines(file.before), lines(file.after)]
      return [
        file.path.replace('docs/adr/', ''),
        {
          removed: old.filter((line) => !now.includes(line)),
          added: now.filter((line) => !old.includes(line))
        }
      ]
    })
  )
}

describe('Accept', () => {
  it('sets the Status and the decision date, and touches nothing else', async () => {
    const { fs, log } = await repository({
      '0001-a': adr('status: proposed', 'created: 2026-09-01', 'tags: [x]   # keep me')
    })
    expect(changes(await planAccept(fs, log, '0001-a', today))).toEqual({
      '0001-a.md': {
        removed: ['status: proposed\n'],
        added: ['status: accepted\n', 'decided: 2026-09-19\n']
      }
    })
  })

  it('takes effect on what the ADR supersedes and amends, each in its own file', async () => {
    const { fs, log } = await repository({
      '0001-old': adr('status: accepted'),
      '0002-base': adr('status: accepted', 'amended-by: [0009-earlier]').replaceAll('\n', '\r\n'),
      '0003-new': adr('status: proposed', 'supersedes: [0001-old]', 'amends: [0002-base]'),
      '0009-earlier': adr('status: accepted', 'amends: [0002-base]')
    })
    expect(changes(await planAccept(fs, log, '0003-new', today))).toEqual({
      '0003-new.md': {
        removed: ['status: proposed\n'],
        added: ['status: accepted\n', 'decided: 2026-09-19\n']
      },
      '0001-old.md': {
        removed: ['status: accepted\n'],
        added: ['status: superseded\n', 'superseded-by: [0003-new]\n']
      },
      // A CRLF file keeps its line endings, and the list it already has is extended in place.
      '0002-base.md': {
        removed: ['amended-by: [0009-earlier]\r\n'],
        added: ['amended-by: [0009-earlier, 0003-new]\r\n']
      }
    })
  })

  it('gives a target without any Metadata its frontmatter in one piece', async () => {
    const { fs, log } = await repository({
      '0001-old': '# Old decision\n\nText.\n',
      '0002-new': adr('status: proposed', 'supersedes: [0001-old]')
    })
    const plan = await planAccept(fs, log, '0002-new', today)
    if (!plan.ok) throw new Error(plan.reason)
    const old = plan.changeSet.files.find((file) => file.path.endsWith('0001-old.md'))!
    expect(old.after).toBe(
      '---\nstatus: superseded\nsuperseded-by: [0002-new]\n---\n# Old decision\n\nText.\n'
    )
  })

  it('leaves the log consistent once applied', async () => {
    const { fs, log } = await repository({
      '0001-old': adr('status: deprecated'),
      '0002-new': adr('status: proposed', 'supersedes: [0001-old]', 'depends-on: [0404-unknown]')
    })
    const plan = await planAccept(fs, log, '0002-new', today)
    if (!plan.ok) throw new Error(plan.reason)
    expect(await applyChangeSet(fs, plan.changeSet)).toEqual({ applied: true })

    const after = (await openRepository(fs)).logs[0]!
    expect(after.adrs.map((adr) => adr.metadata.status)).toEqual(['superseded', 'accepted'])
    // The unknown `depends-on` target was a Problem before and does not stand in the way.
    expect(after.problems).toEqual(log.problems)
  })

  it('is refused with a reason when it cannot be done completely', async () => {
    const { fs, log } = await repository({
      '0001-accepted': adr('status: accepted'),
      '0002-rejected': adr('status: rejected', 'decided: 2026-01-01'),
      '0003-broken': '---\nstatus: [unclosed\n---\n# Broken\n',
      '0004-to-unknown': adr('status: proposed', 'supersedes: [0404-unknown]'),
      '0005-to-rejected': adr('status: proposed', 'supersedes: [0002-rejected]'),
      '0006-to-broken': adr('status: proposed', 'amends: [0003-broken]'),
      '0007-on-hold': adr('status: on hold')
    })
    const reason = async (id: string) => {
      const plan = await planAccept(fs, log, id, today)
      return plan.ok ? 'planned' : plan.reason
    }
    expect(await reason('0001-accepted')).toBe(
      'Only a proposed ADR can be accepted. 0001-accepted is accepted.'
    )
    expect(await reason('0007-on-hold')).toBe(
      'Only a proposed ADR can be accepted. 0007-on-hold is "on hold".'
    )
    expect(await reason('0004-to-unknown')).toBe(
      '0004-to-unknown supersedes 0404-unknown, which is not in this Decision Log.'
    )
    expect(await reason('0005-to-rejected')).toBe(
      'Only an accepted or deprecated ADR can be superseded. 0002-rejected is rejected.'
    )
    expect(await reason('0006-to-broken')).toMatch(/^The frontmatter of 0003-broken cannot be read/)
    expect(await reason('0099-missing')).toBe('There is no ADR 0099-missing in this Decision Log.')
  })
})

describe('Reject', () => {
  it('records the decision and leaves the targets of its Relations alone', async () => {
    const { fs, log } = await repository({
      '0001-old': adr('status: accepted'),
      '0002-new': adr('status: proposed', 'supersedes: [0001-old]')
    })
    expect(changes(await planReject(fs, log, '0002-new', today))).toEqual({
      '0002-new.md': {
        removed: ['status: proposed\n'],
        added: ['status: rejected\n', 'decided: 2026-09-19\n']
      }
    })
  })
})

describe('Deprecate', () => {
  it('changes the Status of an accepted ADR and keeps its decision date', async () => {
    const { fs, log } = await repository({
      '0001-a': adr('status: accepted', 'decided: 2026-01-01'),
      '0002-b': adr('status: proposed')
    })
    expect(changes(await planDeprecate(fs, log, '0001-a'))).toEqual({
      '0001-a.md': { removed: ['status: accepted\n'], added: ['status: deprecated\n'] }
    })
    expect(await planDeprecate(fs, log, '0002-b')).toEqual({
      ok: false,
      reason: 'Only an accepted ADR can be deprecated. 0002-b is proposed.'
    })
  })

  it('writes the Status that an ADR without Metadata only has by default', async () => {
    const { fs, log } = await repository({ '0001-a': '# No frontmatter\n' })
    const plan = await planDeprecate(fs, log, '0001-a')
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.changeSet.files[0]!.after).toBe('---\nstatus: deprecated\n---\n# No frontmatter\n')
  })
})

describe('applyChangeSet', () => {
  it('writes nothing when a file changed after the plan was made', async () => {
    const { fs, log } = await repository({
      '0001-old': adr('status: accepted'),
      '0002-new': adr('status: proposed', 'supersedes: [0001-old]')
    })
    const plan = await planAccept(fs, log, '0002-new', today)
    if (!plan.ok) throw new Error(plan.reason)

    const edited = adr('status: accepted', 'tags: [edited-elsewhere]')
    await fs.writeText('docs/adr/0001-old.md', edited)

    expect(await applyChangeSet(fs, plan.changeSet)).toEqual({
      applied: false,
      conflicts: ['docs/adr/0001-old.md']
    })
    expect(await fs.readText('docs/adr/0001-old.md')).toBe(edited)
    expect(await fs.readText('docs/adr/0002-new.md')).toBe(
      adr('status: proposed', 'supersedes: [0001-old]')
    )
  })
})
