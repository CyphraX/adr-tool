/**
 * Everything `structure` says in sentences — why an operation is refused, what is wrong with
 * `.arch/components.yml`, why a Source File cannot be read — as a code with the values of its
 * sentence, and the English sentence of each code (docs/plan-roadmap.md, part 12). The window
 * words the code in its own language. A code stays; a sentence that says something else gets a
 * new one.
 */
import {
  KERNEL_SENTENCES,
  Refusal,
  YAML_SENTENCES,
  sentenceOf,
  type Said,
  type SaidBy,
  type Sentences
} from '@adr-tool/kernel'

/** What makes a segment of a Component ID, in a sentence. */
export const SEGMENT_RULE =
  'A segment consists of lowercase letters, digits and dashes, and starts and ends with a letter or a digit.'

/** What another sentence said, inside this one; a plain text is passed on as it is. */
const english = (said: Said | string): string =>
  typeof said === 'string'
    ? said
    : (SENTENCES as unknown as Record<string, (values: unknown) => string>)[said.code]!(said.values)

// The values are types, not interfaces: a Said's values are a record of names, and only a type
// is one without saying so.

/** A pattern of a Component, where it is written. */
type Pattern = { readonly pattern: string; readonly key: string; readonly component: string }

export const SENTENCES = {
  ...KERNEL_SENTENCES,
  ...YAML_SENTENCES,

  // Adopt, Repair and Rename.
  'declared-already': (): string => 'The Components of this repository are declared already.',
  'nothing-to-adopt': (): string => 'There is nothing to adopt: the Draft has no Components.',
  'adopt-over-unreadable': (v: { path: string }): string =>
    `${v.path} is there and cannot be read. Adopting would overwrite what a person wrote; fix the file first.`,
  'no-repair': (): string => 'This Problem has no Repair: the suite cannot know what was meant.',
  'not-a-segment': (v: { segment: string }): string =>
    `"${v.segment}" is not a valid segment of a Component ID. ${SEGMENT_RULE}`,
  'rename-needs-declaration': (): string =>
    'Only a declared Component can be renamed. Adopt the Draft first.',
  'not-declared': (v: { path: string; id: string }): string =>
    `${v.path} declares no Component ${v.id}. Look at the file again.`,
  'segment-unchanged': (v: { id: string }): string => `${v.id} has that segment already.`,
  'component-exists': (v: { id: string }): string => `There is a Component ${v.id} already.`,
  'declared-by-now': (v: { path: string }): string =>
    `${v.path} declares Components by now. Look at the file again.`,
  'cannot-add-components': (v: { path: string }): string =>
    `${v.path} is written in a way the suite cannot add Components to. Add them in an editor, or remove the file and adopt again.`,
  'no-pattern-list': (v: { component: string; key: string }): string =>
    `${v.component} has no list "${v.key}" any more. Look at the file again.`,
  'pattern-gone': (v: Pattern): string =>
    `"${v.pattern}" is no longer in ${v.key} of ${v.component}.`,
  'cannot-rename-in': (v: { path: string; id: string }): string =>
    `${v.path} is written in a way the suite cannot rename ${v.id} in. Change the segment in an editor.`,
  'pattern-by-hand': (): string =>
    'The list is written in a way the suite cannot take an item out of. Remove the pattern in an editor.',

  // The Problems of Structure (docs/structure-format.md, section 6): a code is a Problem's kind.
  'unreadable-declaration': (v: { path: string; detail: Said | string }): string =>
    `${v.path} cannot be read: ${english(v.detail)}`,
  'invalid-segment': (v: { segment: string; component: string }): string =>
    `"${v.segment}" in ${v.component} is not a valid segment of a Component ID. ${SEGMENT_RULE}`,
  'duplicate-component': (v: { component: string }): string =>
    `${v.component} is declared twice. The first declaration is read.`,
  'dead-pattern': (v: Pattern): string =>
    `The pattern "${v.pattern}" in ${v.key} of ${v.component} matches no Source File.`,
  'pattern-outside-repository': (v: Pattern): string =>
    `The pattern "${v.pattern}" in ${v.key} of ${v.component} is absolute or leaves the repository. It matches nothing.`,
  'overlapping-components': (v: {
    first: string
    second: string
    files: readonly string[]
  }): string => {
    const count = v.files.length
    return `${v.first} and ${v.second} both claim ${count === 1 ? v.files[0] : `${count} Source Files`}. Until one of them gives way, ${count === 1 ? 'the file is' : 'these files are'} treated as Unassigned.`
  },
  'empty-component': (v: { component: string }): string =>
    `${v.component} has neither paths nor components.`,

  // Why the declaration cannot be read: the rest of a sentence about the file. `not-yaml` and
  // `top-not-map` are the kernel's (YAML_SENTENCES).
  'components-not-map': (): string => '"components" must be a map of Components',
  'component-not-map': (v: { id: string }): string => `${v.id} must be a map of its keys`,
  'children-not-map': (v: { id: string }): string =>
    `"components" of ${v.id} must be a map of Components`,
  'key-not-text': (v: { key: string; id: string }): string =>
    `"${v.key}" of ${v.id} must be a text`,
  'key-not-patterns': (v: { key: string; id: string }): string =>
    `"${v.key}" of ${v.id} must be a list of patterns`,

  // Why a Java file cannot be read. What the TypeScript compiler says is its own text.
  'java-missing': (v: { what: string }): string => `Missing ${v.what}.`,
  'java-unreadable': (): string => 'Syntax that cannot be read.',
  // Why a Python or a Go file cannot be read, as for Java.
  'python-missing': (v: { what: string }): string => `Missing ${v.what}.`,
  'python-unreadable': (): string => 'Syntax that cannot be read.',
  'go-missing': (v: { what: string }): string => `Missing ${v.what}.`,
  'go-unreadable': (): string => 'Syntax that cannot be read.'
} satisfies Sentences

/** What `structure` may say: one of its codes, with the values of its sentence. */
export type StructureSaid = SaidBy<typeof SENTENCES>

/** The English sentence of what `structure` said. */
export const englishOf = (said: StructureSaid): string => sentenceOf(SENTENCES, said)

/** Refuse an operation: its plan is the reason, in English and as a code. */
export function refusal(said: StructureSaid): Refusal {
  return new Refusal(englishOf(said), said)
}

/** Refuse an operation right away. */
export function refuse(said: StructureSaid): never {
  throw refusal(said)
}

/** A detail of a Problem or of a file that cannot be read, in English and as a code. */
export const detailed = (said: StructureSaid): { detail: string; said: StructureSaid } => ({
  detail: englishOf(said),
  said
})
