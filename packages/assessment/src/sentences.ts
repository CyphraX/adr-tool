/**
 * Everything `assessment` says in sentences — what is wrong with an Assessment, a Snapshot, a
 * Risk or a Technical Debt Item, why an operation is refused — as a code with the values of its
 * sentence, and the English sentence of each code (docs/plan-roadmap.md, part 12). The command
 * line and the MCP server say the English sentence; the window words the code in its own
 * language. A code stays; a sentence that says something else gets a new one.
 */
import {
  KERNEL_SENTENCES,
  Refusal,
  sentenceOf,
  type Said,
  type SaidBy,
  type Sentences
} from '@adr-tool/kernel'

/** What another sentence said, inside this one; a plain text is passed on as it is. */
const english = (said: Said | string): string =>
  typeof said === 'string'
    ? said
    : (SENTENCES as unknown as Record<string, (values: unknown) => string>)[said.code]!(said.values)

/** A list of names as a sentence has them: `a`, `a and b`, `a, b and c`. */
export function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** What is kept in each directory, as a sentence names it. */
const KEPT: Record<string, string> = {
  assessments: 'Assessment',
  risks: 'Risk',
  debt: 'Technical Debt Item'
}
const kept = (key: string): string => KEPT[key] ?? key

/** What a piece of evidence is, as a sentence names it before its name. */
const EVIDENCE: Record<string, string> = {
  violation: 'the Violation',
  metric: 'the metric',
  annotation: 'the Annotation',
  adr: 'the ADR',
  risk: 'the Risk',
  debt: 'the Technical Debt Item'
}
const evidence = (kind: string, name: string): string =>
  `${EVIDENCE[kind] ?? kind} ${name}`

// The values are types, not interfaces: a Said's values are a record of names, and only a type
// is one without saying so.

/** A file of the module, and what is wrong with it. */
type About = { readonly path: string; readonly detail: Said | string }
/** An entry of an Assessment's file. */
type OfEntry = { readonly path: string; readonly entry: string }
/** A Finding's evidence that points nowhere. */
type Cited = { readonly path: string; readonly finding: string; readonly target: string }

export const SENTENCES = {
  ...KERNEL_SENTENCES,

  // The Problems of Assessment (docs/assessment-format.md, section 7): a code is a Problem's kind.
  'invalid-directory-setting': (v: { path: string; key: string }): string =>
    `"${v.key}" in ${v.path} must be a relative path inside the repository. No ${kept(v.key)} is read until it is fixed.`,
  'unreadable-assessment': (v: About): string => `${v.path} cannot be read: ${english(v.detail)}.`,
  'unreadable-risk': (v: About): string => `${v.path} cannot be read: ${english(v.detail)}.`,
  'unreadable-debt-item': (v: About): string => `${v.path} cannot be read: ${english(v.detail)}.`,
  'invalid-frontmatter-value': (v: { path: string; key: string; detail: Said | string }): string =>
    `${v.path}: "${v.key}" ${english(v.detail)}.`,
  'assessment-without-date': (v: { path: string }): string =>
    `${v.path} has no date: "date" must say the day of the Assessment, as YYYY-MM-DD.`,
  'unreadable-entry': (v: { path: string; line: number; detail: Said | string }): string =>
    `${v.path}, line ${v.line}: the block of an entry cannot be read: ${english(v.detail)}.`,
  'entry-of-two-kinds': (v: { path: string; line: number }): string =>
    `${v.path}, line ${v.line}: a block is either a Quality Scenario or a Finding, and has both "scenario" and "finding".`,
  'entry-without-heading': (v: { path: string; line: number; entry: string }): string =>
    `${v.path}, line ${v.line}: the block of ${v.entry} does not follow a heading, which gives the entry its title.`,
  'invalid-entry-id': (v: { path: string; line: number; entry: string }): string =>
    `${v.path}, line ${v.line}: "${v.entry}" is no ID of an entry: letters, digits, ".", "_" and "-", beginning with a letter or a digit.`,
  'duplicate-entry': (v: { path: string; line: number; entry: string; of: string }): string =>
    `${v.path}, line ${v.line}: ${v.entry} is there twice among its ${v.of === 'finding' ? 'Findings' : 'Quality Scenarios'}. The first one counts.`,
  'missing-entry-key': (v: OfEntry & { key: string }): string =>
    `${v.path}: ${v.entry} has no "${v.key}", which a Quality Scenario needs.`,
  'invalid-entry-value': (v: OfEntry & { key: string; detail: Said | string }): string =>
    `${v.path}: ${v.entry}: "${v.key}" ${english(v.detail)}.`,
  'unknown-quality-attribute': (v: OfEntry & { value: string }): string =>
    `${v.path}: ${v.entry} is about "${v.value}", which is no characteristic of ISO/IEC 25010, nor one of its sub-characteristics.`,
  'invalid-evidence': (v: OfEntry & { line: number; detail: Said | string }): string =>
    `${v.path}, line ${v.line}: a piece of evidence of ${v.entry} ${english(v.detail)}.`,
  'unreadable-snapshot': (v: About): string => `${v.path} cannot be read: ${english(v.detail)}.`,
  'snapshot-without-assessment': (v: { path: string; assessment: string }): string =>
    `${v.path} is the Snapshot of ${v.assessment}, and there is no Assessment ${v.assessment}.`,
  'names-no-component': (v: { path: string; key: string; component: string }): string =>
    `${v.path} names ${v.component} in "${v.key}", which is not a declared Component.`,
  'unknown-previous-assessment': (v: { path: string; previous: string }): string =>
    `${v.path} follows ${v.previous}, which is no Assessment of this repository.`,
  'finding-unknown-scenario': (v: { path: string; finding: string; scenario: string }): string =>
    `${v.path}: ${v.finding} concerns ${v.scenario}, which is no Quality Scenario of this Assessment.`,
  'violation-gone': (v: { path: string; finding: string; violation: string }): string =>
    `${v.path}: ${v.finding} cites the Violation ${v.violation}, which the code no longer has. Look at the Finding again: it may be resolved.`,
  'metric-not-in-snapshot': (v: {
    path: string
    finding: string
    metric: string
    subject: string
  }): string =>
    `${v.path}: ${v.finding} cites ${v.metric} of ${v.subject}, which its Snapshot does not hold.`,
  'metric-not-measured': (v: {
    path: string
    finding: string
    metric: string
    subject: string
  }): string => `${v.path}: ${v.finding} cites ${v.metric} of ${v.subject}, which the code does not have.`,
  'final-without-snapshot': (v: { path: string }): string =>
    `${v.path} is final and cites metric values, but has no Snapshot that keeps them: they read differently with every commit.`,
  'finding-unknown-annotation': (v: Cited): string =>
    `${v.path}: ${v.finding} cites ${v.target}, which is no Annotation of this repository.`,
  'finding-unknown-adr': (v: Cited): string =>
    `${v.path}: ${v.finding} cites ${v.target}, which is no ADR of this repository.`,
  'finding-ambiguous-adr': (v: Cited & { candidates: readonly string[] }): string =>
    `${v.path}: ${v.finding} cites ${v.target}, which several Decision Logs have: ${listed(v.candidates)}. Name it with its log.`,
  'finding-unknown-risk': (v: Cited): string =>
    `${v.path}: ${v.finding} cites ${v.target}, which is no Risk of this repository.`,
  'finding-unknown-debt-item': (v: Cited): string =>
    `${v.path}: ${v.finding} cites ${v.target}, which is no Technical Debt Item of this repository.`,

  // Why a file or a block cannot be read: the rest of a sentence about it.
  'frontmatter-left-open': (): string => 'its frontmatter is never closed',
  'frontmatter-not-valid-yaml': (v: { message: string }): string =>
    `its frontmatter is not valid YAML: ${v.message}`,
  'frontmatter-no-mapping': (): string => 'its frontmatter must be a mapping',
  'block-not-valid-yaml': (v: { message: string }): string => `it is not valid YAML: ${v.message}`,
  'block-never-closed': (): string => 'its fence is never closed',
  'snapshot-not-valid-yaml': (v: { message: string }): string =>
    `it is not valid YAML: ${v.message}`,
  'snapshot-no-mapping': (): string => 'its top level must be a mapping',
  'snapshot-commit-name': (): string =>
    'its "commit" must name the commit by its full name of 40 or 64 hexadecimal digits',
  'snapshot-day': (): string => 'its "date" must be a date of the form YYYY-MM-DD',
  'snapshot-numbers': (v: { key: string }): string => `its "${v.key}" must map names to numbers`,

  // Why a value is wrong: the rest of a sentence about its key.
  'must-be-text': (): string => 'must be a text',
  'must-be-day': (): string => 'must be a date of the form YYYY-MM-DD',
  'must-be-texts': (): string => 'must be a list of texts',
  'must-be-component-ids': (): string => 'must be a list of Component IDs',
  'must-be-status': (): string => 'must be draft or final',
  'must-be-risk-state': (): string => 'must be open, mitigated, accepted or closed',
  'must-be-debt-state': (): string => 'must be open, scheduled or paid-off',
  'must-be-assessment-id': (): string => 'must be the ID of an Assessment',
  'must-be-scenario-ids': (): string => 'must be a list of IDs of Quality Scenarios',
  'must-be-evidence-list': (): string => 'must be a list of evidence',
  'must-be-level': (): string => 'must be H, M or L',
  'must-be-rating': (): string => 'must be met, partly-met or not-met',

  // What is wrong with a piece of evidence: the rest of a sentence about it.
  'evidence-not-a-mapping': (): string => 'is no mapping',
  'evidence-of-no-kind': (): string =>
    'names none of violation, metric, annotation, adr, risk and debt',
  'evidence-of-two-kinds': (): string => 'names more than one of violation, metric, annotation, adr, risk and debt',
  'evidence-needs-key': (v: { key: string }): string => `needs "${v.key}" as a text`,
  'evidence-needs-members': (): string =>
    'needs "cycle" as a list of the members of the Cycle, two at least',
  'evidence-needs-subject': (): string =>
    'needs what it is about: "from" and "to", "cycle", "component", or "file" and "name"',
  'evidence-needs-metric-subject': (): string =>
    'needs what the metric is of: "component", or "file" and "name"',

  // Why an operation is refused.
  'directory-unavailable': (v: { key: string; detail: Said | string }): string =>
    `No ${kept(v.key)} can be written: ${english(v.detail)}`,
  'no-assessment': (v: { id: string }): string => `There is no Assessment ${v.id}.`,
  'no-risk': (v: { id: string }): string => `There is no Risk ${v.id}.`,
  'no-debt-item': (v: { id: string }): string => `There is no Technical Debt Item ${v.id}.`,
  'no-scenario': (v: { assessment: string; id: string }): string =>
    `${v.assessment} has no Quality Scenario ${v.id}.`,
  'no-finding': (v: { assessment: string; id: string }): string =>
    `${v.assessment} has no Finding ${v.id}.`,
  'file-needs-fixing': (v: { path: string }): string =>
    `${v.path} cannot be read. A person has to fix it before the suite writes into it.`,
  'entry-needs-fixing': (v: { path: string; id: string }): string =>
    `The block of ${v.id} in ${v.path} cannot be read. A person has to fix it before the suite writes into it.`,
  'assessment-final': (v: { id: string }): string =>
    `${v.id} is final: its record is complete. A person may still change it in an editor.`,
  'final-already': (v: { id: string }): string => `${v.id} is final already.`,
  'title-without-slug': (v: { title: string }): string =>
    `The title "${v.title}" leaves no name for the file: it needs a letter or a digit.`,
  'date-not-a-day': (v: { date: string }): string =>
    `"${v.date}" is not a date of the form YYYY-MM-DD.`,
  'assessment-needs-author': (): string => 'An Assessment needs the name of an author.',
  'component-not-known': (v: { component: string }): string =>
    `${v.component} is not a declared Component.`,
  'components-need-declaration': (): string =>
    "Components can be named only once they are declared: the Draft's IDs are no names to write down.",
  'no-assessment-to-follow': (): string =>
    'There is no Assessment with a date that a new one could follow.',
  'entry-id-invalid': (v: { id: string }): string =>
    `"${v.id}" is no ID of an entry: letters, digits, ".", "_" and "-", beginning with a letter or a digit.`,
  'entry-id-taken': (v: { assessment: string; id: string }): string =>
    `${v.assessment} has an entry ${v.id} already.`,
  'entry-needs-title': (): string => 'An entry needs a title, which is its heading.',
  'scenario-needs-key': (v: { key: string }): string =>
    `A Quality Scenario needs a "${v.key}".`,
  'not-a-quality-attribute': (v: { value: string }): string =>
    `"${v.value}" is no characteristic of ISO/IEC 25010, nor one of its sub-characteristics.`,
  'not-a-level': (v: { value: string }): string => `"${v.value}" is none of H, M and L.`,
  'not-a-rating': (v: { value: string }): string =>
    `"${v.value}" is none of met, partly-met and not-met.`,
  'rating-unchanged': (v: { id: string }): string =>
    `${v.id} is rated so already: there is nothing to change.`,
  'evidence-there-already': (v: { finding: string; kind: string; name: string }): string =>
    `${v.finding} cites ${evidence(v.kind, v.name)} already.`,
  'evidence-not-there': (v: { kind: string; name: string }): string =>
    `${evidence(v.kind, v.name)} is not there, so a Finding cannot cite it.`,
  'evidence-incomplete': (v: { kind: string }): string =>
    `The evidence is not complete: ${EVIDENCE[v.kind] ?? v.kind} needs every key its kind names.`,
  'snapshot-without-values': (): string =>
    'There are no metric values to freeze: the Components have to be declared, and to hold Source Files.',
  'state-unchanged': (v: { id: string; state: string }): string => `${v.id} is ${v.state} already.`,
  'not-a-risk-state': (v: { state: string }): string =>
    `"${v.state}" is no state of a Risk: open, mitigated, accepted or closed.`,
  'not-a-debt-state': (v: { state: string }): string =>
    `"${v.state}" is no state of a Technical Debt Item: open, scheduled or paid-off.`,
  'value-by-hand': (v: { path: string; key: string }): string =>
    `"${v.key}" of ${v.path} is written in a way the suite cannot change where it stands. Change it in an editor.`,
  'cannot-rename-in-assessments': (v: { path: string; id: string }): string =>
    `${v.path} may name ${v.id} where the suite cannot rewrite it: it cannot be read, or the ID is written in a way a splice cannot serve. Change it in an editor first.`,
  'has-no-repair': (): string => 'This Problem has no Repair: the suite cannot know what was meant.',
  'problem-no-longer-there': (): string => 'The Problem is no longer there: there is nothing to repair.'
} satisfies Sentences

/** What `assessment` may say: one of its codes, with the values of its sentence. */
export type AssessmentSaid = SaidBy<typeof SENTENCES>

/** The English sentence of what `assessment` said. */
export const englishOf = (said: AssessmentSaid): string => sentenceOf(SENTENCES, said)

/** Refuse an operation right away: its plan is the reason, in English and as a code. */
export function refuse(said: AssessmentSaid): never {
  throw new Refusal(englishOf(said), said)
}
