import { describe, expect, it } from 'vitest'
import {
  applyChangeSet,
  memoryFileSystem,
  openRepository,
  planEditMetadata,
  planRenameTraces,
  planRepair,
  repairsOf,
  type ChangeSet,
  type Plan
} from '../src'
import { lines } from './fixtures'

/**
 * The first Trace (docs/file-format.md, sections 3 and 5): an ADR names the Components it
 * affects in `affects`, by their Component IDs. `core` knows nothing of Structure; whoever
 * opens the repository hands in the IDs that are declared.
 */

const COMPONENTS = ['kernel', 'core', 'core/metadata', 'core/lifecycle', 'app']

/** Decision Logs in memory: path below the repository root → the whole file text. */
function files(adrs: Record<string, string>) {
  return memoryFileSystem(
    Object.fromEntries(
      Object.entries(adrs).map(([name, text]) => [
        name.includes('/') ? `${name}.md` : `docs/adr/${name}.md`,
        text
      ])
    )
  )
}

/** `null`: nobody says which Components are declared. */
async function repository(
  adrs: Record<string, string>,
  components: readonly string[] | null = COMPONENTS
) {
  const fs = files(adrs)
  const repository = await openRepository(fs, components ? { components } : {})
  return { fs, repository, log: repository.logs[0]! }
}

const adr = (...frontmatter: string[]) =>
  ['---', ...frontmatter, '---', '', '# Title', ''].join('\n')

/** Per file of a change set: which lines it loses and gains. */
function changes(plan: Plan): Record<string, { removed: string[]; added: string[] }> {
  if (!plan.ok) throw new Error(plan.reason)
  return changesOf(plan.changeSet)
}

function changesOf(changeSet: ChangeSet) {
  return Object.fromEntries(
    changeSet.files.map((file) => {
      const [old, now] = [lines(file.before), lines(file.after)]
      return [
        file.path.replace(/\.md$/, ''),
        {
          removed: old.filter((line) => !now.includes(line)),
          added: now.filter((line) => !old.includes(line))
        }
      ]
    })
  )
}

describe('affects', () => {
  it('is read like the other lists: flow or block, a single value as a list of one, each item once', async () => {
    const { log } = await repository({
      '0001-a': adr('affects: [core, app, core]'),
      '0002-b': adr('affects:', '  - "core/metadata"', '  - kernel   # the port'),
      '0003-c': adr('affects: app'),
      '0004-d': adr('status: proposed')
    })
    expect(log.adrs.map((one) => one.metadata.affects)).toEqual([
      ['core', 'app'],
      ['core/metadata', 'kernel'],
      ['app'],
      []
    ])
    expect(log.adrs[0]!.metadata.present).toContain('affects')
    expect(log.problems).toEqual([])
  })

  it('that is not a list is invalid Metadata', async () => {
    const { log } = await repository({ '0001-a': adr('affects: {core: yes}') })
    expect(log.adrs[0]!.metadata.affects).toEqual([])
    expect(log.problems).toEqual([
      { kind: 'invalid-metadata', adr: '0001-a', key: 'affects', detail: 'Expected a list' }
    ])
  })
})

describe('a Trace to a Component that is not declared', () => {
  const broken = {
    '0001-a': adr('status: accepted', 'affects: [core, "core/storage", app]   # storage is gone'),
    '0002-b': adr('status: proposed', 'affects:', '  - core/metadata', '  - ui')
  }

  it('is a Problem of the ADR, whatever its Status', async () => {
    const { log } = await repository(broken)
    expect(log.problems).toEqual([
      { kind: 'unknown-component', adr: '0001-a', component: 'core/storage' },
      { kind: 'unknown-component', adr: '0002-b', component: 'ui' }
    ])
  })

  it('is not checked when nobody says which Components are declared', async () => {
    const { log } = await repository(broken, null)
    expect(log.problems).toEqual([])
  })

  it('is checked against an empty declaration as well', async () => {
    const { log } = await repository({ '0001-a': adr('affects: [core]') }, [])
    expect(log.problems).toEqual([{ kind: 'unknown-component', adr: '0001-a', component: 'core' }])
  })

  it('is repaired by taking the item out where it stands, and the key with the last one', async () => {
    const { fs, log } = await repository(broken)
    const [first, second] = log.problems
    expect(repairsOf(log, first!)).toEqual([
      { kind: 'remove-item', adr: '0001-a', key: 'affects', item: 'core/storage' }
    ])
    expect(changes(await planRepair(fs, log, repairsOf(log, first!)[0]!))).toEqual({
      'docs/adr/0001-a': {
        removed: ['affects: [core, "core/storage", app]   # storage is gone\n'],
        added: ['affects: [core, app]   # storage is gone\n']
      }
    })
    expect(changes(await planRepair(fs, log, repairsOf(log, second!)[0]!))).toEqual({
      'docs/adr/0002-b': { removed: ['  - ui\n'], added: [] }
    })

    const alone = await repository({ '0001-a': adr('tags: [x]', 'affects: [ui]') })
    const repair = repairsOf(alone.log, alone.log.problems[0]!)[0]!
    expect(changes(await planRepair(alone.fs, alone.log, repair))).toEqual({
      'docs/adr/0001-a': { removed: ['affects: [ui]\n'], added: [] }
    })
  })

  it('has no Repair once the Component is declared again', async () => {
    const { fs, log } = await repository(broken)
    const repair = repairsOf(log, log.problems[0]!)[0]!
    const { log: later } = await repository(broken, [...COMPONENTS, 'core/storage', 'ui'])
    expect(await planRepair(fs, later, repair)).toEqual({
      ok: false,
      reason: 'This Problem is no longer there.'
    })
  })
})

describe('editing affects', () => {
  const files = {
    '0001-a': adr('status: accepted', 'tags: [api]', 'superseded-by: [0002-b]'),
    '0002-b': adr('status: accepted', 'supersedes: [0001-a]', 'affects: [core]')
  }

  it('adds and removes Components at any Status, a new key in its canonical place', async () => {
    const { fs, log } = await repository(files)
    expect(
      changes(await planEditMetadata(fs, log, '0001-a', { affects: ['app', 'core'] }, COMPONENTS))
    ).toEqual({
      'docs/adr/0001-a': { removed: [], added: ['affects: [app, core]\n'] }
    })
    const plan = await planEditMetadata(fs, log, '0001-a', { affects: ['kernel'] }, COMPONENTS)
    if (!plan.ok) throw new Error(plan.reason)
    // After relates-to, before the Back-references.
    expect(lines(plan.changeSet.files[0]!.after).slice(0, 5)).toEqual([
      '---\n',
      'status: accepted\n',
      'tags: [api]\n',
      'affects: [kernel]\n',
      'superseded-by: [0002-b]\n'
    ])
    expect(changes(await planEditMetadata(fs, log, '0002-b', { affects: [] }, COMPONENTS))).toEqual(
      { 'docs/adr/0002-b': { removed: ['affects: [core]\n'], added: [] } }
    )
  })

  it('only adds a Component that is declared', async () => {
    const { fs, log } = await repository(files)
    expect(await planEditMetadata(fs, log, '0001-a', { affects: ['ui'] }, COMPONENTS)).toEqual({
      ok: false,
      reason: 'There is no declared Component ui.'
    })
    expect(await planEditMetadata(fs, log, '0001-a', { affects: ['core'] })).toEqual({
      ok: false,
      reason: 'No Component is declared in this repository, so none can be named.'
    })
  })

  it('takes out what is there, declared or not, also without a declaration', async () => {
    const { fs, log } = await repository({ '0001-a': adr('affects: [ui, core]') }, null)
    expect(changes(await planEditMetadata(fs, log, '0001-a', { affects: ['core'] }))).toEqual({
      'docs/adr/0001-a': { removed: ['affects: [ui, core]\n'], added: ['affects: [core]\n'] }
    })
  })
})

describe('renaming a Component in the Traces', () => {
  const decisions = {
    '0001-a': adr('status: accepted', "affects: [kernel, 'core', app]   # three"),
    '0002-b': adr(
      'status: proposed',
      'affects:',
      '  - core/metadata',
      '  - "core/lifecycle"',
      '  - core-ui',
      'nav_order: 2'
    ),
    '0003-c': adr('status: accepted', 'affects: [app]'),
    'docs/decisions/0001-elsewhere': adr('affects: core')
  }

  it('rewrites the ID and every ID below it where it stands, in every Decision Log', async () => {
    const { fs, repository: opened } = await repository(decisions)
    expect(opened.logs.map((log) => log.path)).toEqual(['docs/adr', 'docs/decisions'])
    expect(changes(await planRenameTraces(fs, opened.logs, 'core', 'domain'))).toEqual({
      'docs/adr/0001-a': {
        removed: ["affects: [kernel, 'core', app]   # three\n"],
        added: ["affects: [kernel, 'domain', app]   # three\n"]
      },
      'docs/adr/0002-b': {
        removed: ['  - core/metadata\n', '  - "core/lifecycle"\n'],
        added: ['  - domain/metadata\n', '  - "domain/lifecycle"\n']
      },
      'docs/decisions/0001-elsewhere': {
        removed: ['affects: core\n'],
        added: ['affects: domain\n']
      }
    })
  })

  it('rewrites a Component below another, and nothing above or beside it', async () => {
    const { fs, repository: opened } = await repository(decisions)
    expect(changes(await planRenameTraces(fs, opened.logs, 'core/metadata', 'core/meta'))).toEqual({
      'docs/adr/0002-b': { removed: ['  - core/metadata\n'], added: ['  - core/meta\n'] }
    })
  })

  it('leaves Traces that hold the new ID already with that one item', async () => {
    const { fs, repository: opened } = await repository(
      { '0001-a': adr('affects: [core, domain]') },
      null
    )
    expect(changes(await planRenameTraces(fs, opened.logs, 'core', 'domain'))).toEqual({
      'docs/adr/0001-a': { removed: ['affects: [core, domain]\n'], added: ['affects: [domain]\n'] }
    })
  })

  it('plans nothing where no ADR names the Component, and writes no body', async () => {
    const { fs, repository: opened } = await repository({
      '0001-a': '---\naffects: [app]\n---\n# Title\n\nThe core stays as it is.\n'
    })
    const plan = await planRenameTraces(fs, opened.logs, 'core', 'domain')
    expect(plan).toEqual({ ok: true, changeSet: { files: [] } })
  })

  it('leaves a repository whose Traces all hold under the new IDs', async () => {
    const { fs, repository: opened } = await repository(decisions)
    const plan = await planRenameTraces(fs, opened.logs, 'core', 'domain')
    if (!plan.ok) throw new Error(plan.reason)
    expect(await applyChangeSet(fs, plan.changeSet)).toEqual({ applied: true })
    const renamed = COMPONENTS.map((id) => id.replace(/^core(?=\/|$)/, 'domain'))
    const after = await openRepository(fs, { components: [...renamed, 'core-ui'] })
    expect(after.logs.flatMap((log) => log.problems)).toEqual([])
  })

  it('is refused where it cannot tell what it would leave behind, or may not write', async () => {
    const unreadable = await repository({
      '0001-a': adr('affects: [core]'),
      '0002-b': '---\nstatus: [\naffects: [core]\n---\n# T\n'
    })
    expect(await planRenameTraces(unreadable.fs, unreadable.repository.logs, 'core', 'x')).toEqual({
      ok: false,
      reason:
        'The frontmatter of 0002-b cannot be read, and it has a list "affects". Fix it before core is renamed.'
    })

    // What the body says is no Trace, however it begins its lines.
    const body = await repository({
      '0001-a': adr('affects: [core]'),
      '0002-b': '---\nstatus: [\n---\n# T\n\naffects: the payment flow\n'
    })
    const planned = await planRenameTraces(body.fs, body.repository.logs, 'core', 'x')
    expect(planned.ok && planned.changeSet.files.map((file) => file.path)).toEqual([
      'docs/adr/0001-a.md'
    ])

    // MADR 3 keeps its Metadata in a frontmatter of its own; the tool reads it and never writes it.
    const foreign = await repository({
      '0001-use-x': [
        '---',
        'status: accepted',
        'deciders: [Kim Becker]',
        'affects: [core]',
        '---',
        '# Use X',
        '',
        '## Context and Problem Statement',
        '',
        'Text.',
        ''
      ].join('\n')
    })
    expect(foreign.log.adrs[0]!.foreign).toBe('madr')
    const refused = await planRenameTraces(foreign.fs, foreign.repository.logs, 'core', 'x')
    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.reason).toMatch(/^0001-use-x is written in the format of MADR\./)
    expect(!refused.ok && refused.reason).toMatch(/It names core in affects: migrate it first\.$/)
  })
})
