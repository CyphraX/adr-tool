import { describe, expect, it } from 'vitest'
import {
  applyChangeSet,
  listTemplates,
  memoryFileSystem,
  openRepository,
  planAccept,
  planCreate,
  type DecisionLog
} from '../src'
import { nextPrefix, slugify } from '../src/log/new-id'

const today = '2026-09-19'
const adr = (...frontmatter: string[]) =>
  ['---', ...frontmatter, '---', '', '# Title', ''].join('\n')

async function repository(files: Record<string, string>) {
  const fs = memoryFileSystem(files)
  const log = (await openRepository(fs)).logs[0]!
  return { fs, log }
}

describe('slugify', () => {
  it('makes a file name out of a title', () => {
    expect(slugify('Postgres for the write model')).toBe('postgres-for-the-write-model')
    expect(slugify('  Use REST, not GraphQL!  ')).toBe('use-rest-not-graphql')
    expect(slugify('API v2: what changes?')).toBe('api-v2-what-changes')
  })

  it('writes German umlauts out and drops other accents', () => {
    expect(slugify('Größe der Übersicht ändern')).toBe('groesse-der-uebersicht-aendern')
    expect(slugify('Café résumé à la carte')).toBe('cafe-resume-a-la-carte')
  })

  it('stays within 60 characters and does not end in half a word', () => {
    const slug = slugify(
      'A very long title that keeps going and going until nobody wants to read the file name'
    )
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug).toBe('a-very-long-title-that-keeps-going-and-going-until-nobody')
  })

  it('is empty when the title has nothing to build on', () => {
    expect(slugify('  ?!  ')).toBe('')
  })
})

describe('nextPrefix', () => {
  const log = (naming: DecisionLog['naming'], ...ids: string[]) => ({
    naming,
    adrs: ids.map((id) => ({ id, number: naming === 'sequential' ? parseInt(id) : undefined }))
  })

  it('is the highest number plus one, four digits wide', () => {
    expect(nextPrefix(log('sequential') as never, today)).toBe('0001')
    expect(nextPrefix(log('sequential', '0001-a', '0007-b', '0003-c') as never, today)).toBe('0008')
  })

  it('keeps the width a log already uses', () => {
    expect(nextPrefix(log('sequential', '00012-a') as never, today)).toBe('00013')
    expect(nextPrefix(log('sequential', '9999-a') as never, today)).toBe('10000')
  })

  it("is today's date in a date log", () => {
    expect(nextPrefix(log('date', '20260101-a') as never, today)).toBe('20260919')
  })
})

describe('Templates', () => {
  it('are the built-in ones when the repository has none, with minimal preselected', async () => {
    expect(await listTemplates(memoryFileSystem({}))).toEqual({
      templates: [
        { name: 'minimal', source: 'built-in' },
        { name: 'nygard', source: 'built-in' },
        { name: 'madr', source: 'built-in' }
      ],
      defaultName: 'minimal'
    })
  })

  it('come from the repository first; one of them can replace a built-in one and be the default', async () => {
    const fs = memoryFileSystem({
      '.adr/config.yml': 'templates:\n  default: team\n',
      '.adr/templates/team.md': '# {{title}}\n',
      '.adr/templates/madr.md': '# {{title}} (our MADR)\n',
      '.adr/templates/notes.txt': 'not a Template'
    })
    expect(await listTemplates(fs)).toEqual({
      templates: [
        { name: 'madr', source: 'repository' },
        { name: 'team', source: 'repository' },
        { name: 'minimal', source: 'built-in' },
        { name: 'nygard', source: 'built-in' }
      ],
      defaultName: 'team'
    })
  })

  it('fall back to minimal when the configured default does not exist', async () => {
    const fs = memoryFileSystem({ '.adr/config.yml': 'templates:\n  default: gone\n' })
    expect((await listTemplates(fs)).defaultName).toBe('minimal')
  })
})

describe('creating an ADR', () => {
  it('writes a proposed ADR with the next number, the Metadata and the body of the Template', async () => {
    const { fs, log } = await repository({ 'docs/adr/0007-earlier.md': adr('status: accepted') })
    const plan = await planCreate(fs, log, {
      title: 'Größere Übersicht',
      template: 'nygard',
      today
    })
    if (!plan.ok) throw new Error(plan.reason)

    expect(plan.created).toEqual({
      id: '0008-groessere-uebersicht',
      path: 'docs/adr/0008-groessere-uebersicht.md'
    })
    expect(plan.changeSet.files).toHaveLength(1)
    expect(plan.changeSet.files[0]).toMatchObject({ before: '', creates: true })
    expect(plan.changeSet.files[0]!.after.split('\n').slice(0, 8)).toEqual([
      '---',
      'status: proposed',
      'created: 2026-09-19',
      '---',
      '',
      '# Größere Übersicht',
      '',
      '## Context'
    ])
    expect(plan.changeSet.files[0]!.after.endsWith('this decision?\n')).toBe(true)
  })

  it("fills the placeholders of a repository's own Template", async () => {
    const { fs, log } = await repository({
      'docs/adr/0001-a.md': adr(),
      '.adr/templates/team.md': '# {{title}}\n\nADR {{number}}, written on {{date}}.\n\n\n'
    })
    const plan = await planCreate(fs, log, { title: 'Caching', template: 'team', today })
    expect(plan.ok && plan.changeSet.files[0]!.after).toBe(
      '---\nstatus: proposed\ncreated: 2026-09-19\n---\n\n# Caching\n\nADR 0002, written on 2026-09-19.\n'
    )
  })

  it('uses the line ending most ADRs of the log use', async () => {
    const crlf = adr('status: accepted').replaceAll('\n', '\r\n')
    const { fs, log } = await repository({
      'docs/adr/0001-a.md': crlf,
      'docs/adr/0002-b.md': crlf,
      'docs/adr/0003-c.md': adr('status: accepted')
    })
    const plan = await planCreate(fs, log, { title: 'New', template: 'minimal', today })
    if (!plan.ok) throw new Error(plan.reason)
    const text = plan.changeSet.files[0]!.after
    expect(text.startsWith('---\r\nstatus: proposed\r\n')).toBe(true)
    expect(text.replaceAll('\r\n', '')).not.toContain('\n')
  })

  it('names files of a date log by date, and refuses the same slug on the same day', async () => {
    const { fs, log } = await repository({ 'docs/adr/20260919-caching.md': adr() })
    const other = await planCreate(fs, log, { title: 'Logging', template: 'minimal', today })
    expect(other.ok && other.created?.id).toBe('20260919-logging')
    expect(await planCreate(fs, log, { title: 'Caching', template: 'minimal', today })).toEqual({
      ok: false,
      reason: '20260919-caching already exists in this Decision Log.'
    })
  })

  it('can start the first Decision Log of a repository', async () => {
    const fs = memoryFileSystem({ 'README.md': '# A repository\n' })
    const empty: DecisionLog = {
      path: 'docs/adr',
      naming: 'sequential',
      adrs: [],
      relations: [],
      problems: []
    }
    const plan = await planCreate(fs, empty, {
      title: 'First decision',
      template: 'minimal',
      today
    })
    if (!plan.ok) throw new Error(plan.reason)
    await applyChangeSet(fs, plan.changeSet)

    const repository = await openRepository(fs)
    expect(repository.discoveredBy).toBe('default')
    expect(repository.logs[0]!.adrs.map((adr) => [adr.id, adr.title, adr.metadata.status])).toEqual(
      [['0001-first-decision', 'First decision', 'proposed']]
    )
  })

  it('is refused for a title without letters, an unknown Template, or one with frontmatter', async () => {
    const { fs, log } = await repository({
      'docs/adr/0001-a.md': adr(),
      '.adr/templates/bad.md': '---\nstatus: accepted\n---\n# {{title}}\n'
    })
    const reason = async (title: string, template: string) => {
      const plan = await planCreate(fs, log, { title, template, today })
      return plan.ok ? 'planned' : plan.reason
    }
    expect(await reason(' ?! ', 'minimal')).toBe('The title needs at least one letter or digit.')
    expect(await reason('Fine', 'unknown')).toBe('There is no Template called "unknown".')
    expect(await reason('Fine', 'bad')).toMatch(/^The Template "bad" starts with frontmatter/)
  })

  it('does not write over a file that appeared after the plan was made', async () => {
    const { fs, log } = await repository({ 'docs/adr/0001-a.md': adr() })
    const plan = await planCreate(fs, log, { title: 'Race', template: 'minimal', today })
    if (!plan.ok) throw new Error(plan.reason)
    await fs.writeText('docs/adr/0002-race.md', 'Somebody else was faster.\n')
    expect(await applyChangeSet(fs, plan.changeSet)).toEqual({
      applied: false,
      conflicts: ['docs/adr/0002-race.md']
    })
    expect(await fs.readText('docs/adr/0002-race.md')).toBe('Somebody else was faster.\n')
  })
})

describe('creating an ADR that supersedes or amends another', () => {
  it('carries the Relation, leaves the target alone, and takes effect when it is accepted', async () => {
    const { fs, log } = await repository({
      'docs/adr/0001-sqlite.md': adr('status: accepted'),
      'docs/adr/0002-monolith.md': adr('status: accepted')
    })
    const plan = await planCreate(fs, log, {
      title: 'Postgres',
      template: 'minimal',
      today,
      relation: { type: 'supersedes', target: '0001-sqlite' }
    })
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.changeSet.files.map((file) => file.path)).toEqual(['docs/adr/0003-postgres.md'])
    expect(plan.changeSet.files[0]!.after).toContain('\nsupersedes: [0001-sqlite]\n')
    await applyChangeSet(fs, plan.changeSet)

    const proposed = (await openRepository(fs)).logs[0]!
    expect(proposed.problems).toEqual([])
    expect(proposed.relations).toEqual([
      { type: 'supersedes', from: '0003-postgres', to: '0001-sqlite', state: 'pending' }
    ])
    expect(proposed.adrs[0]!.metadata.status).toBe('accepted')

    const accept = await planAccept(fs, proposed, '0003-postgres', { today })
    if (!accept.ok) throw new Error(accept.reason)
    await applyChangeSet(fs, accept.changeSet)
    const accepted = (await openRepository(fs)).logs[0]!
    expect(accepted.problems).toEqual([])
    expect(accepted.adrs[0]!.metadata).toMatchObject({
      status: 'superseded',
      backReferences: { 'superseded-by': ['0003-postgres'] }
    })
  })

  it('is refused when the target cannot be superseded or amended', async () => {
    const { fs, log } = await repository({
      'docs/adr/0001-proposed.md': adr('status: proposed'),
      'docs/adr/0002-deprecated.md': adr('status: deprecated')
    })
    const reason = async (type: 'supersedes' | 'amends', target: string) => {
      const plan = await planCreate(fs, log, {
        title: 'New',
        template: 'minimal',
        today,
        relation: { type, target }
      })
      return plan.ok ? 'planned' : plan.reason
    }
    expect(await reason('supersedes', '0001-proposed')).toBe(
      'Only an accepted or deprecated ADR can be superseded. 0001-proposed is proposed.'
    )
    expect(await reason('supersedes', '0002-deprecated')).toBe('planned')
    expect(await reason('amends', '0002-deprecated')).toBe(
      'Only an accepted ADR can be amended. 0002-deprecated is deprecated.'
    )
    expect(await reason('amends', '0404-missing')).toBe(
      'There is no ADR 0404-missing in this Decision Log.'
    )
  })
})
