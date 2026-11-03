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

/**
 * The sentences of the kernel: what `PendingFiles` refuses. Every module that plans with it
 * says these too, and takes them into its own sentences.
 */
export const KERNEL_SENTENCES = {
  'already-exists': (v: { path: string }): string => `${v.path} already exists.`,
  'no-longer-exists': (v: { path: string }): string => `${v.path} no longer exists.`
} satisfies Sentences

export type KernelSaid = SaidBy<typeof KERNEL_SENTENCES>

/**
 * Why a file of the suite that is written in YAML cannot be read, as the rest of a sentence
 * about the file: `.arch/components.yml` and `.arch/rules.yml` alike. The modules that read
 * such a file take these into their own sentences, so that a code means one thing everywhere.
 */
export const YAML_SENTENCES = {
  'not-yaml': (v: { message: string }): string => `it is not valid YAML: ${v.message}`,
  'top-not-map': (): string => 'its top level must be a map'
} satisfies Sentences
