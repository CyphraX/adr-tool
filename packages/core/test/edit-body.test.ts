import { describe, expect, it } from 'vitest'
import { applyChangeSet, memoryFileSystem, openRepository, planEditBody } from '../src'
import { correctionWarnings } from '../src/lifecycle/correction'
import { lines } from './fixtures'

const today = '2026-09-19'

async function repository(text: string) {
  const fs = memoryFileSystem({ 'docs/adr/0001-a.md': text })
  const log = (await openRepository(fs)).logs[0]!
  return { fs, log, adr: log.adrs[0]! }
}

/** Plan an edit of the only ADR and report which lines of its file go and come. */
async function edit(text: string, change: (body: string) => string, extra = {}) {
  const { fs, log, adr } = await repository(text)
  const body = change(adr.body.replaceAll('\r\n', '\n'))
  const plan = await planEditBody(fs, log, adr.id, { base: adr.body, body, today, ...extra })
  if (!plan.ok) throw new Error(plan.reason)
  const file = plan.changeSet.files[0]
  const [old, now] = [lines(file?.before ?? ''), lines(file?.after ?? '')]
  return {
    plan,
    removed: old.filter((line) => !now.includes(line)),
    added: now.filter((line) => !old.includes(line))
  }
}

const PROPOSED = '---\nstatus: proposed\ntags: [x]   # keep\n---\n\n# Title\n\nOne.\nTwo.\nThree.\n'
const ACCEPTED = PROPOSED.replace('proposed', 'accepted')

describe('editing the body of a proposed ADR', () => {
  it('writes only the lines that differ and records nothing', async () => {
    const { removed, added, plan } = await edit(PROPOSED, (body) =>
      body.replace('Two.', 'Two, reworded.')
    )
    expect(removed).toEqual(['Two.\n'])
    expect(added).toEqual(['Two, reworded.\n'])
    expect(plan.ok && plan.warnings).toBeUndefined()
  })

  it('keeps CRLF on every line of a CRLF file, the new ones included', async () => {
    const { removed, added } = await edit(PROPOSED.replaceAll('\n', '\r\n'), (body) =>
      body.replace('Two.', 'Two.\nTwo and a half.')
    )
    expect(removed).toEqual([])
    expect(added).toEqual(['Two and a half.\r\n'])
  })

  it('plans nothing when the text is what it was', async () => {
    const { plan } = await edit(PROPOSED, (body) => body)
    expect(plan.ok && plan.changeSet.files).toEqual([])
  })
})

describe('editing the body of an ADR that is no longer proposed', () => {
  it('is a Correction: the entry is appended, in the file line ending', async () => {
    const { removed, added } = await edit(
      ACCEPTED.replaceAll('\n', '\r\n'),
      (body) => body.replace('Thre.', 'Three.').replace('One.', 'One!'),
      { author: 'Kim Becker', note: 'Punctuation: fixed' }
    )
    expect(removed).toEqual(['One.\r\n'])
    expect(added).toEqual([
      'corrections:\r\n',
      '  - date: 2026-09-19\r\n',
      '    author: Kim Becker\r\n',
      '    note: "Punctuation: fixed"\r\n',
      'One!\r\n'
    ])
  })

  it('appends to the corrections that are there, with their indentation', async () => {
    const text = ACCEPTED.replace(
      '---\n\n',
      'corrections:\n    - date: 2026-01-01\n      note: Earlier\n---\n\n'
    )
    const { added } = await edit(text, (body) => body.replace('One.', 'One!'))
    expect(added).toEqual(['    - date: 2026-09-19\n', 'One!\n'])

    const { fs, log, adr } = await repository(text)
    const plan = await planEditBody(fs, log, adr.id, {
      base: adr.body,
      body: adr.body.replace('One.', 'One!'),
      today
    })
    if (!plan.ok) throw new Error(plan.reason)
    await applyChangeSet(fs, plan.changeSet)
    const after = (await openRepository(fs)).logs[0]!
    expect(after.problems).toEqual([])
    expect(after.adrs[0]!.metadata.corrections).toEqual([
      { date: '2026-01-01', note: 'Earlier' },
      { date: '2026-09-19' }
    ])
  })

  it('warns when the change looks like more than a Correction, and can still be done', async () => {
    const number = await edit(ACCEPTED, (body) => body.replace('One.', 'Under 20 ms.'))
    expect(number.plan.ok && number.plan.warnings).toEqual(['A number changed: 20.'])
    expect(number.added).toContain('Under 20 ms.\n')
  })
})

describe('an edit that started from something else than what is on disk', () => {
  it('is refused, so that nobody overwrites what they have not seen', async () => {
    const { fs, log, adr } = await repository(PROPOSED)
    await fs.writeText('docs/adr/0001-a.md', PROPOSED.replace('Three.', 'Three, edited elsewhere.'))
    expect(await planEditBody(fs, log, adr.id, { base: adr.body, body: 'Mine\n', today })).toEqual({
      ok: false,
      reason: '0001-a changed on disk after this edit began.'
    })
  })
})

describe('repairing a file whose frontmatter cannot be read', () => {
  it('edits the text and records nothing', async () => {
    const broken = '---\nstatus: accepted\n\n# Title\n\nThe closing fence is missing.\n'
    const { plan } = await edit(broken, (body) =>
      body.replace('status: accepted\n', 'status: accepted\n---\n')
    )
    expect(plan.ok && plan.changeSet.files[0]!.after).toBe(
      '---\nstatus: accepted\n---\n\n# Title\n\nThe closing fence is missing.\n'
    )
  })
})

describe('correctionWarnings', () => {
  it('finds nothing in a typo, a moved comma or a fixed link', () => {
    expect(correctionWarnings('We use Postgers.', 'We use Postgres.')).toEqual([])
    expect(correctionWarnings('See [wiki](http://old).', 'See [wiki](http://new).')).toEqual([])
  })

  it('points at changed numbers and at rewritten sentences', () => {
    expect(correctionWarnings('Answers in under 200 ms.', 'Answers in under 20 ms.')).toEqual([
      'A number changed: 200, 20.'
    ])
    const rewritten = correctionWarnings(
      'Short.',
      'Short. And now a whole new sentence explains at length what else we have decided to do here.'
    )
    expect(rewritten).toEqual(['More than a few words changed: 17 added, 0 removed.'])
  })
})
