/**
 * Everything `core` says in sentences — why an operation is refused, what its plan warns of,
 * what is wrong with a file, why a foreign file has no Migration — as a code with the values of
 * its sentence, and the English sentence of each code (docs/plan-roadmap.md, part 12). The
 * command line and the MCP server say the English sentence; the window words the code in its
 * own language. A code stays; a sentence that says something else gets a new one.
 */
import {
  KERNEL_SENTENCES,
  Refusal,
  sentenceOf,
  type Said,
  type SaidBy,
  type Sentences
} from '@adr-tool/kernel'
import { FOREIGN_FORMAT_NAMES, type ForeignFormat } from './adr/formats'
import { STATUSES } from './status'

// The values are types, not interfaces: a Said's values are a record of names, and only a type
// is one without saying so.

/** An ADR written in a foreign format, and which one. */
type Foreign = { readonly adr: string; readonly format: ForeignFormat }

/** The start every refusal to write a foreign file shares. */
const foreign = (v: Foreign): string =>
  `${v.adr} is written in the format of ${FOREIGN_FORMAT_NAMES[v.format]}. The tool reads that format and never writes it.`

/** What keeps a section in the text, in a sentence: `"Proposed", "Clarifies […](…)"`. */
const quoted = (what: readonly string[]): string => what.map((one) => `"${one}"`).join(', ')

/** What another sentence said, inside this one; a plain text is passed on as it is. */
const english = (said: Said | string): string =>
  typeof said === 'string'
    ? said
    : (SENTENCES as unknown as Record<string, (values: unknown) => string>)[said.code]!(said.values)

/**
 * The ADR an operation cannot be done to, and its Status as the file has it: one of the five
 * values, or what is written there, in quotes.
 */
type Is = { readonly adr: string; readonly is: string }

export const SENTENCES = {
  ...KERNEL_SENTENCES,

  // Which ADR an operation is about.
  'no-adr': (v: { id: string }): string => `There is no ADR ${v.id} in this Decision Log.`,
  'no-adr-in-repository': (v: { id: string }): string =>
    `There is no ADR ${v.id} in this repository.`,
  'target-not-in-log': (v: {
    adr: string
    type: 'supersedes' | 'amends'
    target: string
  }): string => `${v.adr} ${v.type} ${v.target}, which is not in this Decision Log.`,
  'target-not-in-repository': (v: {
    adr: string
    type: 'supersedes' | 'amends'
    target: string
  }): string => `${v.adr} ${v.type} ${v.target}, which is not an ADR of this repository.`,
  'frontmatter-unreadable': (v: { adr: string }): string =>
    `The frontmatter of ${v.adr} cannot be read. Fix it before the tool writes to it.`,

  // A foreign format is read and never written (docs/file-format.md, section 8).
  'foreign-format': (v: Foreign): string => `${foreign(v)} Migrate it first.`,
  'foreign-format-no-migration': (v: Foreign & { why: Said }): string =>
    `${foreign(v)} It ${english(v.why)}`,
  'foreign-format-names-component': (v: Foreign & { component: string }): string =>
    `${foreign(v)} It names ${v.component} in affects: migrate it first.`,
  'foreign-format-names-number': (v: Foreign & { number: number }): string =>
    `${foreign(v)} It names its successor by the number ${v.number}, which would mean another ADR afterwards. Migrate it first.`,
  'foreign-format-mentions': (v: Foreign & { id: string }): string =>
    `${foreign(v)} It mentions ${v.id}: migrate it first, or renumber the other ADR.`,
  'foreign-format-mentions-elsewhere': (v: Foreign & { reference: string }): string =>
    `${foreign(v)} It mentions ${v.reference}: migrate it first.`,
  /** Why an ADR has no Migration: the rest of a sentence that begins with the ADR. */
  'successor-in-status-text': (): string =>
    'names its successor in its Status text, where adr-tools writes a link. As a `status` that would be read the way MADR means it, and say something else than it says now. Make it a link line by hand — Superseded by [2. Title](0002-title.md) — and it can be migrated.',

  // What a Status allows (docs/file-format.md, section 5).
  'accept-needs-proposed': (v: Is): string =>
    `Only a proposed ADR can be accepted. ${v.adr} is ${v.is}.`,
  'reject-needs-proposed': (v: Is): string =>
    `Only a proposed ADR can be rejected. ${v.adr} is ${v.is}.`,
  'deprecate-needs-accepted': (v: Is): string =>
    `Only an accepted ADR can be deprecated. ${v.adr} is ${v.is}.`,
  'supersede-needs-decided': (v: Is): string =>
    `Only an accepted or deprecated ADR can be superseded. ${v.adr} is ${v.is}.`,
  'amend-needs-accepted': (v: Is): string =>
    `Only an accepted ADR can be amended. ${v.adr} is ${v.is}.`,
  'relations-fixed': (v: Is): string =>
    `What an ADR supersedes or amends is fixed once it is no longer proposed. ${v.adr} is ${v.is}.`,

  // Editing the Metadata lists.
  'relation-to-itself': (v: { adr: string }): string =>
    `${v.adr} cannot have a Relation to itself.`,
  'no-components-declared': (): string =>
    'No Component is declared in this repository, so none can be named.',
  'component-not-declared': (v: { component: string }): string =>
    `There is no declared Component ${v.component}.`,
  'decision-maker-one-line': (): string =>
    'A decision-maker is one line of text and cannot be empty.',
  'tag-one-line': (): string => 'A tag is one line of text and cannot be empty.',

  // A new ADR.
  'title-needs-letter': (): string => 'The title needs at least one letter or digit.',
  'id-taken': (v: { id: string }): string => `${v.id} already exists in this Decision Log.`,
  'no-template': (v: { name: string }): string => `There is no Template called "${v.name}".`,
  'template-has-frontmatter': (v: { name: string; path: string }): string =>
    `The Template "${v.name}" starts with frontmatter. A Template shapes the body only; remove the frontmatter from ${v.path}.`,
  'successor-by-number': (v: { adr: string; number: number }): string =>
    `${v.adr} says it is superseded by the ADR with the number ${v.number}, which there was none of so far. The new ADR will be read as that successor.`,

  // Editing the body; a Correction.
  'changed-since-edit': (v: { adr: string }): string =>
    `${v.adr} changed on disk after this edit began.`,
  'number-changed': (v: { numbers: readonly string[] }): string =>
    `A number changed: ${v.numbers.join(', ')}.`,
  'many-words-changed': (v: { added: number; removed: number }): string =>
    `More than a few words changed: ${v.added} added, ${v.removed} removed.`,

  // The ADRs' half of a Component's Rename.
  'rename-needs-two-ids': (): string => 'A Rename needs an old and a new Component ID that differ.',
  'unreadable-has-affects': (v: { adr: string; component: string }): string =>
    `The frontmatter of ${v.adr} cannot be read, and it has a list "affects". Fix it before ${v.component} is renamed.`,

  // Renumber.
  'renumber-needs-sequential': (): string =>
    'Only an ADR of a sequential Decision Log has a number.',
  'number-not-shared': (v: { adr: string }): string =>
    `Renumber is for an ADR that shares its number with another one. ${v.adr} has its number to itself, and its ID stays as it is.`,
  'names-itself': (v: { adr: string; key: string }): string =>
    `${v.adr} names itself in ${v.key}. Remove that before it is renumbered.`,
  'unreadable-mentions': (v: { adr: string; mentioned: string; id: string }): string =>
    `The frontmatter of ${v.adr} cannot be read, and the file mentions ${v.mentioned}. Fix it before ${v.id} is renumbered.`,
  'heading-carries-number': (v: { adr: string; number: number }): string =>
    `The heading of ${v.adr} carries the number ${v.number}. It stays as it is, and is shown as part of the title from now on.`,
  'mentioned-in-text': (v: { adr: string; id: string }): string =>
    `${v.adr} mentions ${v.id} in its text.`,

  // Migration.
  'migrate-unreadable': (v: { adr: string }): string =>
    `The frontmatter of ${v.adr} cannot be read, so nobody can tell which format it is in. Fix it first.`,
  'own-format-already': (v: { adr: string }): string =>
    `${v.adr} is in the tool's own format already.`,
  'nothing-foreign': (): string => 'There is no ADR in a foreign format in this Decision Log.',
  'nothing-migrated': (v: { reasons: readonly Said[] }): string =>
    ['Nothing can be migrated.', ...v.reasons.map(english)].join(' '),
  'changed-on-disk': (v: { adr: string }): string => `${v.adr} changed on disk. Look at it again.`,
  'no-migration': (v: { adr: string; why: Said }): string => `${v.adr} ${english(v.why)}`,
  'successor-unreadable': (v: { adr: string; successor: string }): string =>
    `${v.adr} is superseded by ${v.successor}, whose frontmatter cannot be read. Fix that file first.`,
  'successor-foreign': (v: { adr: string; successor: string; format: ForeignFormat }): string =>
    `${v.adr} is superseded by ${v.successor}, which is written in the format of ${FOREIGN_FORMAT_NAMES[v.format]} itself. Migrate ${v.successor} first, or the whole Decision Log.`,
  'cannot-migrate': (v: { adr: string; why: Said | string }): string =>
    `${v.adr} cannot be migrated: ${english(v.why)}`,
  'waits-for-successor': (v: { adr: string; successor: string }): string =>
    `${v.adr} waits for its successor ${v.successor}.`,
  'status-section-stays': (v: { adr: string; keeps: readonly string[] }): string =>
    `The Status section of ${v.adr} stays in its text: the Metadata does not hold ${quoted(v.keeps)}.`,
  'successor-not-in-log': (v: { adr: string; successor: string }): string =>
    `${v.adr} names "${v.successor}" as its successor, which is no ADR of this Decision Log. It is written as it is, and stays a Problem.`,
  'listed-status-stays': (v: { adr: string; status: string }): string =>
    `The Status of ${v.adr} stays in the list under its title: the tool does not know "${v.status}".`,
  /** `item` is the name of the item as MADR 2 writes it: Status, Deciders, Tags. */
  'listed-twice': (v: { adr: string; item: string }): string =>
    `The list under the title of ${v.adr} says ${v.item} twice: both items stay in its text.`,
  'links-section-stays': (v: { adr: string; keeps: readonly string[] }): string =>
    `The Links section of ${v.adr} stays in its text: the Metadata does not hold ${quoted(v.keeps)}.`,

  // Repairs.
  'problem-gone': (): string => 'This Problem is no longer there.',
  'fix-frontmatter-first': (v: { adr: string }): string =>
    `Reported only because the frontmatter of ${v.adr} cannot be read. Fix that first.`,
  'fix-status-first': (v: { adr: string }): string =>
    `Reported only because the Status of ${v.adr} is none of the five values, which voids its Relations. Fix that first.`,
  'deprecate-again': (v: { adr: string }): string =>
    `${v.adr} becomes accepted. If it had been deprecated before it was marked as superseded, deprecate it again afterwards.`,
  'source-does-not-name': (v: { source: string; adr: string; type: string }): string =>
    `${v.source} does not name ${v.adr} in ${v.type}. If it should, cancel and add it to ${v.source} by hand: the Back-reference is right then.`,
  'source-still-proposed': (v: { source: string }): string =>
    `${v.source} is still proposed. When it is accepted, the Back-reference is written again.`,
  'source-rejected': (v: { source: string }): string =>
    `${v.source} was rejected: its Relations never take effect.`,

  // Metadata the tool must not write into; a person fixes it first.
  'not-single-value': (v: { key: string }): string => `"${v.key}" is not a single value`,
  'block-scalar': (v: { key: string }): string =>
    `"${v.key}" is written as a block of several lines, which the tool cannot change where it stands. Write it on one line in an editor.`,
  'not-a-list': (v: { key: string }): string => `"${v.key}" is not a list`,
  'empty-block-list': (v: { key: string }): string => `"${v.key}" is an empty block list`,
  'item-by-hand': (v: { key: string; item: string }): string =>
    `"${v.key}" is written in a way the tool cannot take an item out of. Remove "${v.item}" in an editor.`,
  'key-taken': (v: { key: string }): string => `"${v.key}" is there already`,
  'frontmatter-never-closed': (): string => 'The frontmatter is never closed',
  'frontmatter-not-yaml': (v: { message: string }): string =>
    `The frontmatter is not valid YAML: ${v.message}`,
  'frontmatter-not-mapping': (): string => 'The frontmatter is not a mapping',

  /** Where the first ADR would go, when the configuration cannot be used. */
  'configuration-first': (v: { path: string; detail: Said | string }): string =>
    `${`${v.path} cannot be used: ${english(v.detail)}`.replace(/\.?$/, '.')} Repair it first.`,

  // The details of Problems: `invalid-frontmatter`, `invalid-metadata`, `invalid-configuration`.
  /** What the YAML parser says, in its own words. */
  'yaml-error': (v: { message: string }): string => v.message,
  'expected-single-value': (): string => 'Expected a single value',
  'not-a-date': (v: { value: string }): string =>
    `"${v.value}" is not a date of the form YYYY-MM-DD`,
  'expected-list': (): string => 'Expected a list',
  'expected-single-values': (): string => 'Expected a list of single values',
  'expected-corrections': (): string => 'Expected a list of corrections',
  'correction-needs-date': (): string => 'Every correction needs a date of the form YYYY-MM-DD',
  'unknown-status': (v: { status: string }): string =>
    `"${v.status}" is not one of ${STATUSES.join(', ')}`,
  'decided-while-proposed': (): string => 'A proposed ADR has not been decided yet',
  'adr-dir-outside': (): string => 'The directory must be a relative path inside the repository',
  'expected-mapping': (): string => 'Expected a mapping',
  'repository-name': (): string =>
    '"name" must be made of letters, digits, ".", "_" and "-", and start with a letter or a digit',
  'logs-not-a-list': (): string => '"logs" must be a list',
  'log-needs-path': (): string =>
    'Every log needs a "path" that is relative and inside the repository',
  'naming-unknown': (v: { naming: string }): string =>
    `"naming" must be sequential or date, not "${v.naming}"`
} satisfies Sentences

/** What `core` may say: one of its codes, with the values of its sentence. */
export type CoreSaid = SaidBy<typeof SENTENCES>

/** The English sentence of what `core` said. */
export const englishOf = (said: CoreSaid): string => sentenceOf(SENTENCES, said)

/** Refuse an operation: its plan is the reason, in English and as a code. */
export function refuse(said: CoreSaid): never {
  throw new Refusal(englishOf(said), said)
}

/** The detail of a Problem, in English and as a code. */
export const detailed = (said: CoreSaid): { detail: string; said: CoreSaid } => ({
  detail: englishOf(said),
  said
})

/**
 * The warnings of a plan as it collects them: each as a code, and its English sentence in the
 * same place of `warnings` (`Plan.warned`).
 */
export class Warnings {
  private readonly said: CoreSaid[] = []

  push(...said: readonly CoreSaid[]): void {
    this.said.push(...said)
  }

  get length(): number {
    return this.said.length
  }

  /** What a plan carries of them: nothing when there are none. */
  outcome(): { warnings: string[]; warned: CoreSaid[] } | Record<string, never> {
    if (this.said.length === 0) return {}
    return { warnings: this.said.map(englishOf), warned: [...this.said] }
  }
}
