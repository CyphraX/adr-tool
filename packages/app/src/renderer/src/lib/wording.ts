import {
  FOREIGN_FORMAT_NAMES,
  nextPrefix,
  type Adr,
  type Correction,
  type DecisionLog,
  type FileChange,
  type ForeignFormat,
  type ForeignSign,
  type Relation,
  type RelationType,
  type Repair,
  type Status
} from '@adr-tool/core'
import { t } from './strings'

export const STATUS_LABEL: Record<Status | 'unknown', string> = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  rejected: 'Rejected',
  deprecated: 'Deprecated',
  superseded: 'Superseded',
  unknown: 'Unknown status'
}

/** How a Relation reads from the ADR that carries it, and from the ADR it points to. */
const RELATION_WORDING: Record<RelationType, { from: string; to: string }> = {
  supersedes: { from: 'Supersedes', to: 'Superseded by' },
  amends: { from: 'Amends', to: 'Amended by' },
  'depends-on': { from: 'Depends on', to: 'Needed by' },
  'relates-to': { from: 'Relates to', to: 'Related from' }
}

/** What a Relation type is called where Relations are edited. */
export const RELATION_TYPE_LABEL: Record<RelationType, string> = {
  supersedes: RELATION_WORDING.supersedes.from,
  amends: RELATION_WORDING.amends.from,
  'depends-on': RELATION_WORDING['depends-on'].from,
  'relates-to': RELATION_WORDING['relates-to'].from
}

/** A Relation of a proposed ADR has not happened yet, and one of a rejected ADR never will. */
const PENDING_WORDING: Partial<Record<RelationType, { from: string; to: string }>> = {
  supersedes: { from: 'Proposes to supersede', to: 'Supersede proposed by' },
  amends: { from: 'Proposes to amend', to: 'Amendment proposed by' }
}

export function relationLabel(relation: Relation, side: 'from' | 'to'): string {
  const pending = relation.state === 'pending' ? PENDING_WORDING[relation.type] : undefined
  return (pending ?? RELATION_WORDING[relation.type])[side]
}

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

const count = (files: number): string => (files === 1 ? 'one file' : `${files} files`)

/** What a change does to how many files, in one sentence: "This renames one file and changes 3 files." */
export function summarizeChange(files: readonly FileChange[]): string {
  const renamed = files.filter((file) => file.renameTo !== undefined).length
  const created = files.filter((file) => file.creates).length
  const changed = files.filter(
    (file) => !file.creates && file.renameTo === undefined && file.after !== file.before
  ).length
  const parts = [
    ...(renamed > 0 ? [`renames ${count(renamed)}`] : []),
    ...(created > 0 ? [`creates ${count(created)}`] : []),
    ...(changed > 0 ? [`changes ${count(changed)}`] : [])
  ]
  if (parts.length === 0) return 'This changes nothing.'
  const last = parts.pop()
  const sentence = parts.length > 0 ? `${parts.join(', ')} and ${last}` : last
  const untouched =
    changed > 0 ? ` Nothing else in ${changed === 1 ? 'it' : 'them'} is touched.` : ''
  return `This ${sentence}.${untouched}`
}

/** What a Decision Log is called: its path — and the one at the top of the repository has none. */
export function logName(path: string): string {
  return path === '' ? t.sidebar.root : path
}

/** What a Correction records: its day, and who corrected what when the file says so. */
export function describeCorrection(correction: Correction): string {
  const { date, author, note } = correction
  return `${date}${author ? ` by ${author}` : ''}${note ? `: ${note}` : ''}`
}

/** What the list and the header show in front of an ADR: its number as written, or its date. */
export function prefixOf(adr: Adr): string {
  const digits = /^\d+/.exec(adr.id)?.[0] ?? ''
  if (adr.number !== undefined || digits.length !== 8) return digits
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
}

/** What a Repair is called on its button: what it writes, in a few words. */
export function repairLabel(repair: Repair, log: DecisionLog): string {
  switch (repair.kind) {
    case 'lowercase-status':
      return 'Write it in lowercase'
    case 'remove-item':
      return `Remove ${repair.item} from ${repair.key}`
    case 'add-back-reference':
      return `Add ${repair.item} to ${repair.key}`
    case 'set-status':
      return `Set the Status to ${repair.status}`
    case 'renumber':
      return `Renumber to ${nextPrefix(log, '')}`
  }
}

/** What told the tool that a file is in a foreign format (docs/file-format.md, section 8). */
const FOREIGN_SIGN: Record<ForeignSign, string> = {
  'status-section': 'no frontmatter, and a Status section in its text',
  'successor-in-status': 'a Status that names a successor',
  deciders: '"deciders" for the decision-makers',
  'listed-status': 'its Status in the list under the title',
  'listed-deciders': 'its Deciders in the list under the title'
}

/** What the tool takes from a file of a foreign format. */
const FOREIGN_READING: Record<ForeignFormat, string> = {
  'adr-tools':
    'Its Status, its Relations and Back-references and the day it was created are taken from there.',
  madr: 'That is read as MADR means it.',
  'madr-2':
    "What its list under the title says — Status, Deciders, log4brains' Tags — is taken from there, unless the frontmatter says it already, and its Relations from the links of its Links section."
}

/** `a`, `a and b`, `a, b and c`. */
const listed = (parts: readonly string[]): string =>
  parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`

/** On the button that migrates every foreign ADR of the Decision Log in view. */
export const MIGRATE_LOG_HINT =
  "ADRs in a foreign format, which the tool reads and never writes. Migration rewrites them into the tool's own format, and shows the change first."

/** Next to a Relation that only the other ADR's file records. */
export const IMPLIED_NOTE = 'recorded in that file, not in this one'

/** In the header of an ADR that is written in a foreign format. */
export function describeForeign(adr: Adr): string {
  if (!adr.foreign) return ''
  const signs = listed((adr.foreignSigns ?? []).map((sign) => FOREIGN_SIGN[sign]))
  const read = `Read as a file of ${FOREIGN_FORMAT_NAMES[adr.foreign]}${signs ? `: ${signs}` : ''}. ${FOREIGN_READING[adr.foreign]} The tool never writes this format.`
  return adr.noMigration === undefined
    ? `${read} Migration rewrites the file into the tool's own, and shows the change first.`
    : `${read} This one ${adr.noMigration}`
}

/** Under a Problem without a Repair, when it is reported on an ADR in a foreign format. */
export function noRepairIn(adr: Adr): string {
  if (!adr.foreign) return NO_REPAIR
  const never = `The tool reads the format of ${FOREIGN_FORMAT_NAMES[adr.foreign]} and never writes it.`
  return adr.noMigration === undefined
    ? `${never} Migrate the ADR and look again: a Problem that has a Repair is offered one then. What the tool cannot know — a Status that is none of the five — is put right by hand, before or afterwards.`
    : `${never} Fix the file in an editor; the view follows.`
}

/** Under a Problem that has no Repair. */
export const NO_REPAIR =
  'The tool cannot know what was meant here. Fix the frontmatter of the file in an editor; the view follows.'

// What a Problem says is the same in the window and on the command line: `core` words it.
export { describeCause, describeConsequences, describeProblem } from '@adr-tool/core'
