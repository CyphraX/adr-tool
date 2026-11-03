/**
 * What an operation or a check says — why it refuses, what it warns of, what is wrong with a
 * file — as a code and the values of its sentence (docs/plan-roadmap.md, part 12). The module
 * that says it keeps the English sentence beside it, for the command line and for agents; a
 * window in another language words the code itself. A code stays; a new sentence gets a new one.
 */
export interface Said {
  readonly code: string
  readonly values: Readonly<Record<string, SaidValue>>
}

/**
 * A value of a sentence: a name, a number, a list of names — or what was said that the
 * sentence passes on, such as why one ADR of several cannot be migrated. Such a value is worded
 * in the language of the sentence around it. A plain text is somebody else's words, a
 * parser's say, and is passed on as it is.
 */
export type SaidValue = string | number | readonly string[] | Said | readonly Said[]

/** The sentences of a module, one per code: each takes the values of its sentence. */
export type Sentences = Readonly<Record<string, (values: never) => string>>

/** The values of a sentence that takes none. */
type NoValues = Readonly<Record<string, never>>

/** What a module may say: one of its codes with the values its sentence takes. */
export type SaidBy<S extends Sentences> = {
  readonly [Code in keyof S & string]: {
    readonly code: Code
    readonly values: Parameters<S[Code]> extends [] ? NoValues : Parameters<S[Code]>[0]
  }
}[keyof S & string]

/** The English sentence of what was said, by the module's own sentences. */
export function sentenceOf<S extends Sentences>(sentences: S, said: SaidBy<S>): string {
  return (sentences[said.code] as (values: unknown) => string)(said.values)
}

/** What another sentence of the kernel said, inside this one; one it does not say, by its code. */
const english = (said: Said): string =>
  (KERNEL_SENTENCES as unknown as Record<string, ((values: unknown) => string) | undefined>)[
    said.code
  ]?.(said.values) ?? said.code

/**
 * The sentences of the kernel: what `PendingFiles` refuses, and why `.arch/config.yml` cannot
 * be read. Every module says these too, and takes them into its own sentences.
 */
export const KERNEL_SENTENCES = {
  'already-exists': (v: { path: string }): string => `${v.path} already exists.`,
  'no-longer-exists': (v: { path: string }): string => `${v.path} no longer exists.`,

  // The Problem of `.arch/config.yml` (docs/configuration.md), and why: the rest of a sentence.
  'unreadable-config': (v: { path: string; detail: Said }): string =>
    `${v.path} cannot be read: ${english(v.detail)}. What its settings decide is not done until it is fixed.`,
  'config-not-yaml': (v: { message: string }): string => `it is not valid YAML: ${v.message}`,
  'config-not-map': (): string => 'its top level must be a map'
} satisfies Sentences

export type KernelSaid = SaidBy<typeof KERNEL_SENTENCES>
