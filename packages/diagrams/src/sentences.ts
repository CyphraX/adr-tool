/**
 * Everything `diagrams` says in sentences — what is wrong with a Diagram or with
 * `.arch/config.yml`, what a Drift is, why an operation is refused — as a code with the values
 * of its sentence, and the English sentence of each code (docs/plan-roadmap.md, part 12). The
 * window words the code in its own language. A code stays; a sentence that says something else
 * gets a new one.
 */
import {
  KERNEL_SENTENCES,
  Refusal,
  sentenceOf,
  type Said,
  type SaidBy,
  type Sentences
} from '@adr-tool/kernel'

/** What makes the ID of an External System or of the repository, in a sentence. */
export const ELEMENT_ID_RULE =
  'An element ID consists of lowercase letters, digits and dashes, and starts and ends with a letter or a digit.'

/** The view levels, as a sentence lists them (docs/diagrams-format.md, section 3). */
export const LEVELS_IN_A_SENTENCE = 'system-context, container and component'

/** What another sentence said, inside this one; a plain text is passed on as it is. */
const english = (said: Said | string): string =>
  typeof said === 'string'
    ? said
    : (SENTENCES as unknown as Record<string, (values: unknown) => string>)[said.code]!(said.values)

/** A view level as a sentence names the Diagram that has it. */
const VIEW: Record<string, string> = {
  'system-context': 'a system context',
  container: 'a container view',
  component: 'a component view'
}
const viewOf = (level: string): string => VIEW[level] ?? `a Diagram of the level "${level}"`

// The values are types, not interfaces: a Said's values are a record of names, and only a type
// is one without saying so.

/** How many Source File Dependencies stand behind something. */
const dependenciesIn = (count: number): string =>
  count === 1 ? 'one Source File Dependency' : `${count} Source File Dependencies`

/** The two ends of a connection. */
type Ends = { readonly from: string; readonly to: string }

export const SENTENCES = {
  ...KERNEL_SENTENCES,

  // The Problems of Diagrams (docs/diagrams-format.md, section 5): a code is a Problem's kind.
  'unreadable-config': (v: { path: string; detail: Said | string }): string =>
    `${v.path} cannot be read: ${english(v.detail)}. No Diagram is looked for until it is fixed.`,
  'invalid-diagrams-directory': (v: { path: string }): string =>
    `"diagrams" in ${v.path} must be a relative path inside the repository. No Diagram is looked for until it is fixed.`,
  'unreadable-diagram': (v: { path: string; detail: Said | string }): string =>
    `${v.path} cannot be read: ${english(v.detail)}.`,
  'no-level': (): string => `The Diagram has no level. A level is one of ${LEVELS_IN_A_SENTENCE}.`,
  'unknown-level': (v: { level: string }): string =>
    `The Diagram has the level "${v.level}", which the suite does not know. A level is one of ${LEVELS_IN_A_SENTENCE}.`,
  'no-scope': (): string =>
    'The Diagram is a component view and has no scope: it does not say which Component it looks into.',
  'scope-without-component-level': (v: { level: string }): string =>
    `The Diagram is ${viewOf(v.level)} and has a scope, which only a component view has. The scope is not read.`,
  'invalid-element-id': (v: { id: string }): string =>
    `"${v.id}" is not a valid element ID. ${ELEMENT_ID_RULE}`,
  'duplicate-element': (v: { id: string }): string =>
    `${v.id} is shown twice. The first one is read.`,
  'self-connection': (v: { id: string }): string =>
    `The connection from ${v.id} to ${v.id} is not drawn: an element does not use itself.`,
  'unknown-element': (v: Ends & { id: string }): string =>
    `The connection from ${v.from} to ${v.to} names ${v.id}, which is not an element of the Diagram. It is not drawn.`,
  'duplicate-connection': (v: Ends): string =>
    `The Diagram connects ${v.from} to ${v.to} twice. The first connection is read.`,
  'component-gone': (v: { component: string }): string =>
    `The Diagram shows ${v.component}, which is not a declared Component.`,
  'unknown-scope': (v: { component: string }): string =>
    `The Diagram looks into ${v.component}, which is not a declared Component.`,
  'component-does-not-fit': (v: { component: string; level: string; scope: string }): string =>
    v.level === 'system-context'
      ? `${v.component} does not belong in a system context, which shows the repository as one box and no Component.`
      : v.level === 'container'
        ? `${v.component} does not belong in a container view, which shows the Components at the top of the hierarchy.`
        : `${v.component} does not belong in the component view of ${v.scope}, which shows the parts of ${v.scope} and the Components beside it and beside what contains it.`,
  'repository-does-not-fit': (v: { id: string }): string =>
    `The repository ${v.id} stands for every Component, and only a system context shows it.`,

  // Why `.arch/config.yml` cannot be read: the rest of a sentence about the file.
  'config-not-yaml': (v: { message: string }): string => `it is not valid YAML: ${v.message}`,
  'config-not-map': (): string => 'its top level must be a map',

  // Why a Diagram cannot be read: the rest of a sentence about the file.
  'diagram-not-yaml': (v: { message: string }): string => `it is not valid YAML: ${v.message}`,
  'diagram-not-map': (): string => 'its top level must be a map',
  'diagram-key-not-text': (v: { key: string; line: number }): string =>
    `"${v.key}" on line ${v.line} must be a text`,
  'diagram-key-not-list': (v: { key: string; line: number }): string =>
    `"${v.key}" on line ${v.line} must be a list`,
  'diagram-item-not-map': (v: { key: string; line: number }): string =>
    `the item of "${v.key}" on line ${v.line} must be a map`,
  'element-without-kind': (v: { line: number }): string =>
    `the element on line ${v.line} says none of component, external and repository`,
  'element-of-two-kinds': (v: { line: number }): string =>
    `the element on line ${v.line} says more than one of component, external and repository`,
  'element-without-position': (v: { line: number }): string =>
    `the element on line ${v.line} has no position "at"`,
  'position-not-a-point': (v: { line: number }): string =>
    `"at" on line ${v.line} must be two numbers, [x, y]`,
  'size-not-positive': (v: { line: number }): string =>
    `"size" on line ${v.line} must be two positive numbers, [width, height]`,
  'connection-without-end': (v: { key: string; line: number }): string =>
    `the connection on line ${v.line} has no "${v.key}"`,

  // Drift (docs/diagrams-format.md, section 4): a code is a Drift's kind.
  'connection-not-in-code': (v: Ends): string =>
    `The Diagram connects ${v.from} to ${v.to}, but no Source File of ${v.from} depends on one of ${v.to}.`,
  'dependency-not-in-diagram': (v: Ends & { count: number }): string =>
    `${v.from} depends on ${v.to} in the code, through ${dependenciesIn(v.count)}, and the Diagram does not connect them.`,
  'scope-dependency-not-in-diagram': (v: Ends & { scope: string; count: number }): string =>
    v.from === v.scope
      ? `${v.scope}'s own files depend on ${v.to} in the code, through ${dependenciesIn(v.count)}, and the Diagram connects no part of ${v.scope} to ${v.to}.`
      : `${v.from} depends on ${v.scope}'s own files in the code, through ${dependenciesIn(v.count)}, and the Diagram connects ${v.from} to no part of ${v.scope}.`,

  // The Repair and the export.
  'no-diagram-repair': (): string =>
    'This Problem has no Repair: the suite cannot know what was meant.',
  'no-longer-shows': (v: { path: string; component: string }): string =>
    `${v.path} no longer shows ${v.component}. Look at the file again.`,
  'cannot-remove-element': (v: { path: string; component: string }): string =>
    `${v.path} is written in a way the suite cannot take ${v.component} out of. Remove it and its connections in an editor.`
} satisfies Sentences

/** What `diagrams` may say: one of its codes, with the values of its sentence. */
export type DiagramsSaid = SaidBy<typeof SENTENCES>

/** The English sentence of what `diagrams` said. */
export const englishOf = (said: DiagramsSaid): string => sentenceOf(SENTENCES, said)

/** Refuse an operation: its plan is the reason, in English and as a code. */
export function refusal(said: DiagramsSaid): Refusal {
  return new Refusal(englishOf(said), said)
}

/** Refuse an operation right away. */
export function refuse(said: DiagramsSaid): never {
  throw refusal(said)
}
