/**
 * Everything `review` says in sentences — what is wrong with an Annotation or a Reply, why an
 * operation is refused — as a code with the values of its sentence, and the English sentence of
 * each code (docs/plan-roadmap.md, part 12). The command line and the MCP server say the English
 * sentence; the window words the code in its own language. A code stays; a sentence that says
 * something else gets a new one.
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

// The values are types, not interfaces: a Said's values are a record of names, and only a type
// is one without saying so.

/** A file of the module, and what is wrong with it. */
type About = { readonly path: string; readonly detail: Said | string }

export const SENTENCES = {
  ...KERNEL_SENTENCES,

  // The Problems of Review (docs/review-format.md, section 6): a code is a Problem's kind.
  'unreadable-configuration': (v: About): string =>
    `${v.path} cannot be read: ${english(v.detail)}. No Annotation is read until it is fixed.`,
  'invalid-annotations-directory': (v: { path: string; value: string }): string =>
    `"annotations" in ${v.path} must be a relative path inside the repository, not "${v.value}". No Annotation is read until it is fixed.`,
  'unreadable-annotation': (v: About): string => `${v.path} cannot be read: ${english(v.detail)}.`,
  'invalid-type': (v: { path: string; value: string }): string =>
    `${v.path}: "type" must be note, question or concern, not "${v.value}".`,
  'invalid-state': (v: { path: string; value: string }): string =>
    `${v.path}: "state" must be open or resolved, not "${v.value}".`,
  'invalid-key': (v: { path: string; key: string; detail: Said | string }): string =>
    `${v.path}: "${v.key}" ${english(v.detail)}.`,
  'no-anchor': (v: { path: string }): string =>
    `${v.path} has no Anchor: "anchor" needs "path" and "lines".`,
  'invalid-anchor': (v: About): string => `${v.path}: the Anchor ${english(v.detail)}.`,
  'no-quote': (v: { path: string }): string =>
    `${v.path} does not begin its text with the quoted lines, as a fenced code block that is closed.`,
  'quote-does-not-match-lines': (v: {
    path: string
    quoted: number
    lines: string
    count: number
  }): string =>
    `${v.path} quotes ${v.quoted} ${v.quoted === 1 ? 'line' : 'lines'} for lines ${v.lines}, which are ${v.count}.`,
  'unknown-adr': (v: { path: string; adr: string }): string =>
    `${v.path} cites ${v.adr}, which is no ADR of this repository.`,
  'ambiguous-adr': (v: { path: string; adr: string; candidates: readonly string[] }): string =>
    `${v.path} cites ${v.adr}, which several Decision Logs have: ${listed(v.candidates)}. Name it with its log.`,
  orphaned: (v: { annotation: string; path: string; lines: string; file: string }): string =>
    v.file === 'gone'
      ? `${v.annotation} is orphaned: ${v.path} is gone, and no file it was renamed to has its quoted lines. Attach it again to the lines it is about.`
      : `${v.annotation} is orphaned: the quoted lines ${v.lines} of ${v.path} are no longer found in it. Attach it again to the lines it is about.`,
  'unreadable-reply': (v: About): string => `${v.path} cannot be read: ${english(v.detail)}.`,
  'replies-without-annotation': (v: { path: string; annotation: string }): string =>
    `${v.path} holds Replies to ${v.annotation}, and there is no Annotation ${v.annotation}.`,

  // Why a file cannot be read, or a value is wrong: the rest of a sentence about it.
  'config-not-yaml': (v: { message: string }): string => `it is not valid YAML: ${v.message}`,
  'config-not-mapping': (): string => 'its top level must be a mapping',
  'no-frontmatter': (): string => 'it has no frontmatter',
  'frontmatter-open': (): string => 'its frontmatter is never closed',
  'frontmatter-yaml': (v: { message: string }): string =>
    `its frontmatter is not valid YAML: ${v.message}`,
  'frontmatter-mapping': (): string => 'its frontmatter must be a mapping',
  'needs-text': (): string => 'must be a text',
  'needs-day': (): string => 'must be a date of the form YYYY-MM-DD',
  'needs-adr-list': (): string => 'must be a list of ADRs',
  'anchor-path': (): string => 'names a path that is absolute or leaves the repository',
  'anchor-lines': (): string => 'must give its lines as a number or a range such as 12-18',
  'anchor-commit': (): string =>
    'must name its commit by its full name of 40 or 64 hexadecimal digits',

  // Why an operation is refused.
  'annotations-unavailable': (v: { detail: Said | string }): string =>
    `The Annotations cannot be written: ${english(v.detail)}`,
  'no-annotation': (v: { id: string }): string => `There is no Annotation ${v.id}.`,
  'annotation-unreadable': (v: { path: string }): string =>
    `${v.path} cannot be read. A person has to fix it before the suite writes into it.`,
  'annotation-needs-author': (): string => 'An Annotation needs the name of its author.',
  'reply-needs-author': (): string => 'A Reply needs the name of its author.',
  'reply-needs-text': (): string => 'A Reply needs a text.',
  'not-a-day': (v: { date: string }): string => `"${v.date}" is not a date of the form YYYY-MM-DD.`,
  'no-source-file': (v: { path: string }): string => `${v.path} is no file of this repository.`,
  'no-lines': (v: { lines: string }): string =>
    `${v.lines} are no lines: give the first and the last, counted from 1.`,
  'lines-outside': (v: { path: string; lines: string; count: number }): string =>
    `${v.path} has ${v.count} ${v.count === 1 ? 'line' : 'lines'}; lines ${v.lines} are not in it.`,
  'carriage-return-in-lines': (v: { path: string; lines: string }): string =>
    `Lines ${v.lines} of ${v.path} hold a carriage return that ends no line, which quoted lines cannot keep.`,
  'resolved-already': (v: { id: string }): string => `${v.id} is resolved already.`,
  'open-already': (v: { id: string }): string => `${v.id} is open already.`,
  'cited-already': (v: { id: string; adr: string }): string => `${v.id} cites ${v.adr} already.`,
  'not-cited': (v: { id: string; adr: string }): string => `${v.id} does not cite ${v.adr}.`,
  'no-such-adr': (v: { adr: string }): string => `${v.adr} is no ADR of this repository.`,
  'adr-in-several-logs': (v: { adr: string; candidates: readonly string[] }): string =>
    `${v.adr} is in several Decision Logs: ${listed(v.candidates)}. Name it with its log.`,
  'key-by-hand': (v: { path: string; key: string }): string =>
    `"${v.key}" of ${v.path} is written in a way the suite cannot change where it stands. Change it in an editor.`,
  'not-moved': (v: { id: string }): string =>
    `${v.id} is where its Anchor says: there is nothing to update.`,
  'without-repair': (): string =>
    'This Problem has no Repair: the suite cannot know what was meant.'
} satisfies Sentences

/** What `review` may say: one of its codes, with the values of its sentence. */
export type ReviewSaid = SaidBy<typeof SENTENCES>

/** The English sentence of what `review` said. */
export const englishOf = (said: ReviewSaid): string => sentenceOf(SENTENCES, said)

/** Refuse an operation right away: its plan is the reason, in English and as a code. */
export function refuse(said: ReviewSaid): never {
  throw new Refusal(englishOf(said), said)
}
