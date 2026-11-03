/**
 * The modules of the suite, in the order of docs/vision.md, as the module switcher in the head
 * of a tab shows them (docs/design.md, "The frame"). A module joins the window with an entry
 * here, its name in `strings.*.ts` (`modules.<id>`), its three panes in App.svelte — the
 * compiler asks for each — and its Problems in the repository's list (lib/repository-problems.ts).
 *
 * What a tab remembers of a module — its view, its selection — is the module's own part of the
 * tab (lib/state.svelte.ts): switching to another module and back finds it as it was left.
 */
export const MODULES = [
  /** The ADRs of the Decision Logs (CONTEXT.md). */
  { id: 'decisions' },
  /** The Components of the code and their Dependencies (docs/contexts/structure/CONTEXT.md). */
  { id: 'structure' },
  /** An architect's Annotations on lines of the code (docs/contexts/review/CONTEXT.md). */
  { id: 'review' }
] as const satisfies readonly { readonly id: string }[]

/** A module of the suite, by its ID. */
export type Module = (typeof MODULES)[number]['id']
