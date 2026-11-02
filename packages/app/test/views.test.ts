import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { memoryFileSystem, openRepository, type Adr } from '@adr-tool/core'
import { nodeFileSystem } from '../src/main/node-file-system'
import {
  boardOf,
  dashboardOf,
  dateOf,
  dayOf,
  moveOf,
  positionOn,
  timelineOf
} from '../src/renderer/src/lib/views'

// docs/plan-roadmap.md, part 11

const SHOWCASE = fileURLToPath(new URL('../../core/test/fixtures/showcase', import.meta.url))

async function showcase(): Promise<Adr[]> {
  const repository = await openRepository(nodeFileSystem(SHOWCASE))
  return [...repository.logs[0]!.adrs]
}

const adr = (front: string): string => `---\n${front}\n---\n\n# Title\n`

async function adrsOf(files: Record<string, string>): Promise<Adr[]> {
  const repository = await openRepository(memoryFileSystem(files))
  return [...repository.logs[0]!.adrs]
}

const ids = (adrs: readonly Adr[]): string[] => adrs.map((one) => one.id)

describe('days and dates', () => {
  it('reads a date as the day it stands for, and nothing else', () => {
    expect(dayOf('1970-01-02')).toBe(1)
    expect(dateOf(dayOf('2026-11-02')!)).toBe('2026-11-02')
    expect(dayOf('2026-02-31')).toBeUndefined()
    expect(dayOf('2026-2-3')).toBeUndefined()
    expect(dayOf(undefined)).toBeUndefined()
    // A year below 100 is that year, not one of the 1900s.
    expect(dayOf('0099-01-01')).not.toBe(dayOf('1999-01-01'))
    expect(dateOf(dayOf('0099-01-01')!)).toBe('0099-01-01')
  })
})

describe('the timeline (part 11)', () => {
  it('shows every ADR of the showcase by its dates, a proposed one running on to today', async () => {
    const adrs = await showcase()
    const timeline = timelineOf(adrs, '2026-11-02')
    expect(timeline.undated).toEqual([])
    // The same ADRs as the list, the earliest first.
    expect(ids(timeline.rows.map((row) => row.adr)).sort()).toEqual(ids(adrs).sort())
    expect(ids(timeline.rows.map((row) => row.adr)).slice(0, 3)).toEqual([
      '0001-modular-monolith',
      '0002-sqlite-for-everything',
      '0003-graphql-for-the-public-api'
    ])
    const replica = timeline.rows.find((row) => row.adr.id === '0007-read-replica-for-reports')!
    expect([dateOf(replica.start), dateOf(replica.end), replica.waiting]).toEqual([
      '2026-02-02',
      '2026-11-02',
      true
    ])
    const postgres = timeline.rows.find(
      (row) => row.adr.id === '0004-postgres-for-the-write-model'
    )!
    expect([dateOf(postgres.start), dateOf(postgres.end), postgres.status]).toEqual([
      '2025-05-05',
      '2025-05-12',
      'accepted'
    ])
    // From the first of the earliest month to the first of the month after today.
    expect([dateOf(timeline.from), dateOf(timeline.to)]).toEqual(['2025-01-01', '2026-12-01'])
    // 23 months: a line every quarter.
    expect(timeline.ticks.map(dateOf)).toEqual([
      '2025-01-01',
      '2025-04-01',
      '2025-07-01',
      '2025-10-01',
      '2026-01-01',
      '2026-04-01',
      '2026-07-01',
      '2026-10-01'
    ])
    expect(positionOn(timeline, timeline.from)).toBe(0)
    expect(positionOn(timeline, timeline.to)).toBe(1)
  })

  it('puts an ADR without dates aside, and one without a creation date at its decision', async () => {
    const adrs = await adrsOf({
      'docs/adr/0001-a.md': adr('status: accepted\ndecided: 2026-03-04'),
      'docs/adr/0002-b.md': adr('status: proposed'),
      'docs/adr/0003-c.md': adr('status: accepted\ncreated: 2026-03-01\ndecided: 2026-03-02')
    })
    const timeline = timelineOf(adrs, '2026-03-20')
    expect(ids(timeline.undated)).toEqual(['0002-b'])
    expect(timeline.rows.map((row) => [row.adr.id, dateOf(row.start), dateOf(row.end)])).toEqual([
      ['0003-c', '2026-03-01', '2026-03-02'],
      ['0001-a', '2026-03-04', '2026-03-04']
    ])
    // A short log has a line for every month.
    expect(timeline.ticks.map(dateOf)).toEqual(['2026-03-01'])
  })

  it('keeps to about ten lines over decades', async () => {
    const adrs = await adrsOf({
      'docs/adr/0001-a.md': adr('status: accepted\ndecided: 1925-03-04'),
      'docs/adr/0002-b.md': adr('status: accepted\ndecided: 2026-03-04')
    })
    const ticks = timelineOf(adrs, '2026-03-20').ticks.map(dateOf)
    expect(ticks.length).toBeLessThanOrEqual(11)
    expect(ticks.every((tick) => tick.endsWith('-01-01'))).toBe(true)
  })
})

describe('the board (part 11)', () => {
  it('has a column per Status with the ADRs the list shows under it', async () => {
    const adrs = await showcase()
    const board = boardOf(adrs)
    expect(board.map((column) => [column.status, ids(column.adrs)])).toEqual([
      ['proposed', ['0008-reporting-api-for-finance', '0007-read-replica-for-reports']],
      [
        'accepted',
        [
          '0005-extract-notification-service',
          '0004-postgres-for-the-write-model',
          '0001-modular-monolith'
        ]
      ],
      ['rejected', ['0003-graphql-for-the-public-api']],
      ['deprecated', ['0006-nightly-csv-export']],
      ['superseded', ['0002-sqlite-for-everything']]
    ])
  })

  it('moves a card by the operations of the tool, and by no others', async () => {
    const [accepted, , rejected, , , deprecated, proposed] = await showcase()
    expect(moveOf(proposed!, 'accepted')).toEqual({ kind: 'decide', decision: 'accept' })
    expect(moveOf(proposed!, 'rejected')).toEqual({ kind: 'decide', decision: 'reject' })
    expect(moveOf(proposed!, 'proposed')).toEqual({ kind: 'stay' })
    expect(moveOf(proposed!, 'deprecated')).toEqual({ kind: 'refused', why: 'undecided' })
    expect(moveOf(proposed!, 'superseded')).toEqual({ kind: 'refused', why: 'undecided' })
    expect(moveOf(accepted!, 'deprecated')).toEqual({ kind: 'decide', decision: 'deprecate' })
    expect(moveOf(accepted!, 'superseded')).toEqual({ kind: 'supersede' })
    expect(moveOf(accepted!, 'proposed')).toEqual({ kind: 'refused', why: 'decided' })
    expect(moveOf(deprecated!, 'superseded')).toEqual({ kind: 'supersede' })
    expect(moveOf(deprecated!, 'accepted')).toEqual({ kind: 'refused', why: 'decided' })
    expect(moveOf(rejected!, 'accepted')).toEqual({ kind: 'refused', why: 'rejected' })
  })

  it('moves nothing the tool does not write', async () => {
    const adrs = await adrsOf({
      'docs/adr/0001-broken.md': '---\nstatus: [proposed\n---\n\n# Broken\n',
      'docs/adr/0002-odd.md': adr('status: approved'),
      'docs/adr/0003-madr.md': '# Madr\n\n* Status: proposed\n'
    })
    const [broken, odd, madr] = adrs
    expect(moveOf(broken!, 'superseded')).toEqual({ kind: 'refused', why: 'unreadable' })
    expect(moveOf(odd!, 'accepted')).toEqual({ kind: 'refused', why: 'unknown' })
    expect(boardOf(adrs).at(-1)?.status).toBe('unknown')
    expect(madr!.foreign).toBeDefined()
    expect(moveOf(madr!, 'accepted')).toEqual({ kind: 'refused', why: 'foreign' })
    // One that cannot be migrated as it stands is not told to be migrated.
    const [stuck] = await adrsOf({
      'docs/adr/0001-old.md': '# 1. Old\n\nDate: 2026-01-01\n\n## Status\n\nSuperseded by 2\n'
    })
    expect(stuck!.noMigration).toBeDefined()
    expect(moveOf(stuck!, 'accepted')).toEqual({ kind: 'refused', why: 'unmigratable' })
  })
})

describe('the dashboard (part 11)', () => {
  it('counts the showcase as the sidebar does, and says how long proposals wait', async () => {
    const dashboard = dashboardOf(await showcase(), '2026-11-02')
    expect(dashboard.total).toBe(8)
    expect(dashboard.counts).toEqual({
      proposed: 2,
      accepted: 3,
      rejected: 1,
      deprecated: 1,
      superseded: 1,
      unknown: 0
    })
    expect(dashboard.waiting.map((one) => [one.adr.id, one.days])).toEqual([
      ['0007-read-replica-for-reports', 273],
      ['0008-reporting-api-for-finance', 231]
    ])
    expect(dashboard.medianWait).toBe(252)
    expect(ids(dashboard.recent)).toEqual([
      '0005-extract-notification-service',
      '0004-postgres-for-the-write-model',
      '0006-nightly-csv-export',
      '0003-graphql-for-the-public-api',
      '0002-sqlite-for-everything'
    ])
    expect(dashboard.components).toEqual([])
    expect(dashboard.acceptedWithoutComponent).toBe(3)
  })

  it('lists the Components the ADRs affect, the most named first', async () => {
    const dashboard = dashboardOf(
      await adrsOf({
        'docs/adr/0001-a.md': adr('status: accepted\naffects: [core, app]'),
        'docs/adr/0002-b.md': adr('status: proposed\naffects: [core]'),
        'docs/adr/0003-c.md': adr('status: accepted')
      }),
      '2026-11-02'
    )
    expect(dashboard.components.map((use) => [use.id, ids(use.adrs)])).toEqual([
      ['core', ['0002-b', '0001-a']],
      ['app', ['0001-a']]
    ])
    expect(dashboard.acceptedWithoutComponent).toBe(1)
    // A proposal without a date of creation waits too, for a time nobody can tell.
    expect(dashboard.waiting.map((one) => one.days)).toEqual([undefined])
    expect(dashboard.medianWait).toBeUndefined()
  })
})
