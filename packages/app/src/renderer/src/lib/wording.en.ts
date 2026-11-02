import {
  FOREIGN_FORMAT_NAMES,
  describeCause,
  describeConsequences,
  describeProblem,
  nextPrefix,
  type Adr,
  type Correction,
  type DecisionLog,
  type FileChange,
  type ForeignFormat,
  type ForeignSign,
  type Problem,
  type RelationType,
  type Repair,
  type Status
} from '@adr-tool/core'

/**
 * What is said about the domain in English: what a Status, a Relation, a Problem, a Repair, a
 * Correction or a change is called, and the sentences built from them. wording.de.ts says the
 * same in German; wording.ts gives the window the language it speaks.
 */

/** How a Relation reads from the ADR that carries it, and from the ADR it points to. */
type Sides = { from: string; to: string }

const count = (files: number): string => (files === 1 ? 'one file' : `${files} files`)

/** `a`, `a and b`, `a, b and c`. */
const listed = (parts: readonly string[]): string =>
  parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`

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

/** Under a Problem that has no Repair. */
const NO_REPAIR =
  'The tool cannot know what was meant here. Fix the frontmatter of the file in an editor; the view follows.'

export const en = {
  status: {
    proposed: 'Proposed',
    accepted: 'Accepted',
    rejected: 'Rejected',
    deprecated: 'Deprecated',
    superseded: 'Superseded',
    unknown: 'Unknown status'
  } satisfies Record<Status | 'unknown', string>,

  relation: {
    supersedes: { from: 'Supersedes', to: 'Superseded by' },
    amends: { from: 'Amends', to: 'Amended by' },
    'depends-on': { from: 'Depends on', to: 'Needed by' },
    'relates-to': { from: 'Relates to', to: 'Related from' }
  } satisfies Record<RelationType, Sides>,

  /** A Relation of a proposed ADR has not happened yet, and one of a rejected ADR never will. */
  pending: {
    supersedes: { from: 'Proposes to supersede', to: 'Supersede proposed by' },
    amends: { from: 'Proposes to amend', to: 'Amendment proposed by' }
  } as Partial<Record<RelationType, Sides>>,

  /** What a change does to how many files, in one sentence: "This renames one file and changes 3 files." */
  summarizeChange(files: readonly FileChange[]): string {
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
    const untouched =
      changed > 0 ? ` Nothing else in ${changed === 1 ? 'it' : 'them'} is touched.` : ''
    return `This ${listed(parts)}.${untouched}`
  },

  /** What a Correction records: its day, and who corrected what when the file says so. */
  describeCorrection({ date, author, note }: Correction): string {
    return `${date}${author ? ` by ${author}` : ''}${note ? `: ${note}` : ''}`
  },

  /** What a Repair is called on its button: what it writes, in a few words. */
  repairLabel(repair: Repair, log: DecisionLog): string {
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
  },

  /** On the button that migrates every foreign ADR of the Decision Log in view. */
  migrateLogHint:
    "ADRs in a foreign format, which the tool reads and never writes. Migration rewrites them into the tool's own format, and shows the change first.",

  /** Next to a Relation that only the other ADR's file records. */
  impliedNote: 'recorded in that file, not in this one',

  /** In the header of an ADR that is written in a foreign format. */
  describeForeign(adr: Adr): string {
    if (!adr.foreign) return ''
    const signs = listed((adr.foreignSigns ?? []).map((sign) => FOREIGN_SIGN[sign]))
    const read = `Read as a file of ${FOREIGN_FORMAT_NAMES[adr.foreign]}${signs ? `: ${signs}` : ''}. ${FOREIGN_READING[adr.foreign]} The tool never writes this format.`
    return adr.noMigration === undefined
      ? `${read} Migration rewrites the file into the tool's own, and shows the change first.`
      : `${read} This one ${adr.noMigration}`
  },

  /** Under a Problem without a Repair, when it is reported on an ADR in a foreign format. */
  noRepairIn(adr: Pick<Adr, 'foreign' | 'noMigration'>): string {
    if (!adr.foreign) return NO_REPAIR
    const never = `The tool reads the format of ${FOREIGN_FORMAT_NAMES[adr.foreign]} and never writes it.`
    return adr.noMigration === undefined
      ? `${never} Migrate the ADR and look again: a Problem that has a Repair is offered one then. What the tool cannot know — a Status that is none of the five — is put right by hand, before or afterwards.`
      : `${never} Fix the file in an editor; the view follows.`
  },

  noRepair: NO_REPAIR,

  // What a Problem says is the same in the window and on the command line: `core` words it.
  describeProblem: (problem: Problem): string => describeProblem(problem),
  describeCause: (root: Problem): string => describeCause(root),
  describeConsequences: (root: Problem): string => describeConsequences(root)
}

export type Wording = typeof en
