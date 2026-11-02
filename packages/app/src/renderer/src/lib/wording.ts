import { STATUSES, type Adr, type Relation, type RelationType } from '@adr-tool/core'
import { language } from './language'
import { t } from './strings'
import { de } from './wording.de'
import { en, type Wording } from './wording.en'

/**
 * What is said about the domain, in the language of the window (wording.en.ts, wording.de.ts),
 * and what is said the same in every language: an ADR's prefix, the name of a Decision Log,
 * the parts of a text that are set in code.
 */
const said: Wording = language === 'de' ? de : en

export const STATUS_LABEL = said.status

/** The room a column of Statuses takes: the longest of the five names, and its mark. */
export const STATUS_WIDTH = `${Math.max(...STATUSES.map((status) => said.status[status].length)) + 2.5}ch`

/** What a Relation type is called where Relations are edited. */
export const RELATION_TYPE_LABEL = Object.fromEntries(
  Object.entries(said.relation).map(([type, sides]) => [type, sides.from])
) as Record<RelationType, string>

/** How a Relation of `type` reads from the ADR that carries it, or from the ADR it names. */
export const relationWord = (type: RelationType, side: 'from' | 'to'): string =>
  said.relation[type][side]

export function relationLabel(relation: Relation, side: 'from' | 'to'): string {
  const pending = relation.state === 'pending' ? said.pending[relation.type] : undefined
  return (pending ?? said.relation[relation.type])[side]
}

export const summarizeChange = said.summarizeChange
export const describeCorrection = said.describeCorrection
export const repairLabel = said.repairLabel
export const describeForeign = said.describeForeign
export const noRepairIn = said.noRepairIn
export const MIGRATE_LOG_HINT = said.migrateLogHint
export const IMPLIED_NOTE = said.impliedNote
export const NO_REPAIR = said.noRepair
export const describeProblem = said.describeProblem
export const describeCause = said.describeCause
export const describeConsequences = said.describeConsequences

/**
 * A text of strings.ts that names files sets them between backticks; the markup sets those
 * parts in code. So a sentence stays one sentence, and a translation can move the names.
 */
export function codeSpans(text: string): { text: string; code: boolean }[] {
  return text
    .split('`')
    .map((part, position) => ({ text: part, code: position % 2 === 1 }))
    .filter((part) => part.text !== '')
}

/** What a Decision Log is called: its path — and the one at the top of the repository has none. */
export function logName(path: string): string {
  return path === '' ? t.sidebar.root : path
}

/** What the list and the header show in front of an ADR: its number as written, or its date. */
export function prefixOf(adr: Pick<Adr, 'id' | 'number'>): string {
  const digits = /^\d+/.exec(adr.id)?.[0] ?? ''
  if (adr.number !== undefined || digits.length !== 8) return digits
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
}
