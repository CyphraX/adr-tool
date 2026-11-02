import { STATUSES, type Adr, type Status } from '@adr-tool/core'

/**
 * What the timeline, the board and the dashboard of a Decision Log show (docs/plan-roadmap.md,
 * part 11). Each of them says what the list says, arranged otherwise: the same ADRs, with the
 * Status the list gives them. Nothing here writes; a move on the board is an operation of the
 * tool, planned and previewed as anywhere else.
 */

export type StatusKey = Status | 'unknown'

const statusOf = (adr: Pick<Adr, 'metadata'>): StatusKey => adr.metadata.status ?? 'unknown'

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** The day a `YYYY-MM-DD` date stands for, counted from 1970-01-01; `undefined` for anything else. */
export function dayOf(date: string | undefined): number | undefined {
  const match = date === undefined ? null : DATE.exec(date)
  if (!match) return undefined
  const [, year, month, day] = match.map(Number) as [number, number, number, number]
  const time = Date.UTC(year, month - 1, day)
  const back = new Date(time)
  // 2026-02-31 is no day.
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return undefined
  return time / 86_400_000
}

/** Today in the person's own time zone, as `YYYY-MM-DD`: the day a decision would record. */
export function localToday(now = new Date()): string {
  const two = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`
}

/** The date of a day, as `YYYY-MM-DD`. */
export const dateOf = (day: number): string => new Date(day * 86_400_000).toISOString().slice(0, 10)

// ---------------------------------------------------------------------------------------------
// The timeline

/** One ADR on the timeline: from the day it was written to the day it was decided. */
export interface TimelineRow {
  readonly adr: Adr
  readonly status: StatusKey
  /** The day the bar starts: when the ADR was created, or else when it was decided. */
  readonly start: number
  /** The day it ends: when it was decided; today while it is proposed. */
  readonly end: number
  /** Proposed and waiting: the bar runs on to today. */
  readonly waiting: boolean
}

export interface Timeline {
  /** The ADRs with a date, the earliest first. */
  readonly rows: readonly TimelineRow[]
  /** The ADRs with neither a date of creation nor of decision. */
  readonly undated: readonly Adr[]
  /** The first day of the first month shown. */
  readonly from: number
  /** The first day of the month after the last one shown. */
  readonly to: number
  /** The first day of each month that gets a line and a label. */
  readonly ticks: readonly number[]
}

/**
 * The ADRs of a Decision Log by the dates they were created and decided. A proposed ADR runs
 * on to `today`; one that names no date of creation stands at the day it was decided.
 */
export function timelineOf(adrs: readonly Adr[], today: string): Timeline {
  const now = dayOf(today) ?? Math.floor(Date.now() / 86_400_000)
  const rows: TimelineRow[] = []
  const undated: Adr[] = []
  for (const adr of adrs) {
    const created = dayOf(adr.metadata.created)
    const decided = dayOf(adr.metadata.decided)
    const status = statusOf(adr)
    const start = created ?? decided
    if (start === undefined) {
      undated.push(adr)
      continue
    }
    const waiting = status === 'proposed' && decided === undefined
    const end = Math.max(start, waiting ? now : (decided ?? start))
    rows.push({ adr, status, start, end, waiting })
  }
  rows.sort((a, b) => a.start - b.start || order(a.adr, b.adr))

  const first = rows.length > 0 ? Math.min(...rows.map((row) => row.start)) : now
  const last = rows.length > 0 ? Math.max(...rows.map((row) => row.end)) : now
  const from = monthStart(first)
  const to = monthStart(last, 1)
  return { rows, undated, from, to, ticks: ticksBetween(from, to) }
}

/** Where a day lies between the start and the end of the timeline, from 0 to 1. */
export const positionOn = (timeline: Pick<Timeline, 'from' | 'to'>, day: number): number =>
  timeline.to > timeline.from ? (day - timeline.from) / (timeline.to - timeline.from) : 0

/** The first day of the month `day` is in, or of a month `add` months later. */
function monthStart(day: number, add = 0): number {
  const date = new Date(day * 86_400_000)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + add, 1) / 86_400_000
}

/** Every month while that leaves room for a label; every quarter, or every year, beyond that. */
function ticksBetween(from: number, to: number): number[] {
  const months = Math.round((to - from) / 30.44)
  const step = months <= 18 ? 1 : months <= 60 ? 3 : 12
  const ticks: number[] = []
  for (let tick = from; tick < to; tick = monthStart(tick, 1)) {
    const month = new Date(tick * 86_400_000).getUTCMonth()
    if (month % step === 0) ticks.push(tick)
  }
  return ticks
}

/** By number, and by ID where there is none (a log of dated names). */
function order(a: Adr, b: Adr): number {
  return (a.number ?? 0) - (b.number ?? 0) || a.id.localeCompare(b.id)
}

// ---------------------------------------------------------------------------------------------
// The board

export interface BoardColumn {
  readonly status: StatusKey
  /** Newest first, as in the list. */
  readonly adrs: readonly Adr[]
}

/** One column per Status, in the order of the sidebar; one for an unreadable Status if needed. */
export function boardOf(adrs: readonly Adr[]): BoardColumn[] {
  const keys: StatusKey[] = [...STATUSES]
  if (adrs.some((adr) => statusOf(adr) === 'unknown')) keys.push('unknown')
  return keys.map((status) => ({
    status,
    adrs: adrs.filter((adr) => statusOf(adr) === status).toReversed()
  }))
}

/** Why a card cannot go to a column. Each has its sentence in the strings of the window. */
export type Refusal =
  /** Written in a foreign format, which the tool reads and never writes. */
  | 'foreign'
  /** Its frontmatter cannot be read. */
  | 'unreadable'
  /** Its Status is none of the five values. */
  | 'unknown'
  /** A proposed ADR is accepted or rejected first. */
  | 'undecided'
  /** A decision is not taken back; it is superseded or deprecated. */
  | 'decided'
  /** A rejected ADR stays rejected. */
  | 'rejected'
  /** Nothing ends a superseded ADR's life again. */
  | 'superseded'

/** What moving a card from its column to another one does. */
export type Move =
  | { readonly kind: 'stay' }
  | { readonly kind: 'decide'; readonly decision: 'accept' | 'reject' | 'deprecate' }
  /** A new ADR that supersedes this one: the card moves once that one is accepted. */
  | { readonly kind: 'supersede' }
  | { readonly kind: 'refused'; readonly why: Refusal }

/**
 * The operation a move on the board stands for: the moves the detail of an ADR offers, and no
 * other. `superseded` is never set by hand; it follows when an ADR that supersedes is accepted.
 */
export function moveOf(
  adr: Pick<Adr, 'metadata' | 'foreign' | 'metadataWritable'>,
  to: StatusKey
): Move {
  const from = statusOf(adr)
  if (from === to) return { kind: 'stay' }
  if (adr.foreign) return { kind: 'refused', why: 'foreign' }
  if (!adr.metadataWritable) return { kind: 'refused', why: 'unreadable' }
  switch (from) {
    case 'unknown':
      return { kind: 'refused', why: 'unknown' }
    case 'proposed':
      if (to === 'accepted') return { kind: 'decide', decision: 'accept' }
      if (to === 'rejected') return { kind: 'decide', decision: 'reject' }
      return { kind: 'refused', why: 'undecided' }
    case 'accepted':
      if (to === 'deprecated') return { kind: 'decide', decision: 'deprecate' }
      if (to === 'superseded') return { kind: 'supersede' }
      return { kind: 'refused', why: 'decided' }
    case 'deprecated':
      if (to === 'superseded') return { kind: 'supersede' }
      return { kind: 'refused', why: 'decided' }
    case 'rejected':
      return { kind: 'refused', why: 'rejected' }
    case 'superseded':
      return { kind: 'refused', why: 'superseded' }
  }
}

// ---------------------------------------------------------------------------------------------
// The dashboard

export interface Waiting {
  readonly adr: Adr
  /** Days since it was created; `undefined` when it names no date of creation. */
  readonly days: number | undefined
}

export interface ComponentUse {
  /** The Component ID, as `affects` names it. */
  readonly id: string
  /** The ADRs that name it, newest first. */
  readonly adrs: readonly Adr[]
}

export interface Dashboard {
  readonly total: number
  readonly counts: Readonly<Record<StatusKey, number>>
  /** The proposed ADRs, the one waiting longest first; those without a date last. */
  readonly waiting: readonly Waiting[]
  /** The middle of the days the dated proposed ADRs have waited; `undefined` without one. */
  readonly medianWait: number | undefined
  /** The most recent decisions, at most five, the latest first. */
  readonly recent: readonly Adr[]
  /** The Components the ADRs name in `affects`, the most named first. */
  readonly components: readonly ComponentUse[]
  /** The accepted ADRs that name no Component. */
  readonly acceptedWithoutComponent: number
}

/** The figures of a Decision Log, on `today`. */
export function dashboardOf(adrs: readonly Adr[], today: string): Dashboard {
  const now = dayOf(today) ?? Math.floor(Date.now() / 86_400_000)
  const counts = Object.fromEntries(
    [...STATUSES, 'unknown'].map((status) => [status, 0])
  ) as Record<StatusKey, number>
  for (const adr of adrs) counts[statusOf(adr)]++

  const waiting = adrs
    .filter((adr) => statusOf(adr) === 'proposed')
    .map((adr): Waiting => {
      const created = dayOf(adr.metadata.created)
      return { adr, days: created === undefined ? undefined : Math.max(0, now - created) }
    })
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1) || order(a.adr, b.adr))
  const days = waiting
    .flatMap((one) => (one.days === undefined ? [] : [one.days]))
    .sort((a, b) => a - b)
  const middle = days.length / 2
  const medianWait =
    days.length === 0
      ? undefined
      : days.length % 2 === 1
        ? days[Math.floor(middle)]
        : Math.round((days[middle - 1]! + days[middle]!) / 2)

  const recent = adrs
    .filter((adr) => dayOf(adr.metadata.decided) !== undefined)
    .sort((a, b) => dayOf(b.metadata.decided)! - dayOf(a.metadata.decided)! || order(b, a))
    .slice(0, 5)

  const byComponent = new Map<string, Adr[]>()
  for (const adr of adrs.toReversed()) {
    for (const id of new Set(adr.metadata.affects)) {
      byComponent.set(id, [...(byComponent.get(id) ?? []), adr])
    }
  }
  const components = [...byComponent]
    .map(([id, named]) => ({ id, adrs: named }))
    .sort((a, b) => b.adrs.length - a.adrs.length || a.id.localeCompare(b.id))
  const acceptedWithoutComponent = adrs.filter(
    (adr) => statusOf(adr) === 'accepted' && adr.metadata.affects.length === 0
  ).length

  return {
    total: adrs.length,
    counts,
    waiting,
    medianWait,
    recent,
    components,
    acceptedWithoutComponent
  }
}
