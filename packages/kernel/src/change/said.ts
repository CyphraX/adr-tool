/**
 * What an operation or a check says — why it refuses, what it warns of, what is wrong with a
 * file — as a code and the values of its sentence (docs/plan-roadmap.md, part 12). The module
 * that says it keeps the English sentence beside it, for the command line and for agents; a
 * window in another language words the code itself. A code stays; a new sentence gets a new one.
 */
export interface Said {
  readonly code: string
  readonly values: Readonly<Record<string, string | number | readonly string[]>>
}

/** The sentences of a module, one per code: each takes the values of its sentence. */
export type Sentences = Readonly<Record<string, (values: never) => string>>

/** What a module may say: one of its codes with the values its sentence takes. */
export type SaidBy<S extends Sentences> = {
  readonly [Code in keyof S & string]: {
    readonly code: Code
    readonly values: Parameters<S[Code]>[0]
  }
}[keyof S & string]

/** The English sentence of what was said, by the module's own sentences. */
export function sentenceOf<S extends Sentences>(sentences: S, said: SaidBy<S>): string {
  return (sentences[said.code] as (values: unknown) => string)(said.values)
}
