import type { MetadataKey } from '../metadata/keys'

export type BackReferenceKey = 'superseded-by' | 'amended-by'

/**
 * A Problem: an inconsistency in a Decision Log that the tool detects and names
 * (docs/file-format.md, "Consistency"). Detection only; repairs come with the Problems view.
 */
export type Problem =
  /** The file opens frontmatter with `---` and never closes it. */
  | { readonly kind: 'unterminated-frontmatter'; readonly adr: string }
  /** The frontmatter is not valid YAML, not a mapping, or has duplicate keys. */
  | { readonly kind: 'invalid-frontmatter'; readonly adr: string; readonly detail: string }
  /** A Metadata value has the wrong type or form: an unknown Status, a malformed date, … */
  | {
      readonly kind: 'invalid-metadata'
      readonly adr: string
      readonly key: MetadataKey
      readonly detail: string
    }
  /** The Status is one of the five values but not written in lowercase. */
  | { readonly kind: 'status-not-lowercase'; readonly adr: string; readonly written: string }
  /** A Relation or Back-reference names an ID that is not in the Decision Log. */
  | {
      readonly kind: 'unknown-target'
      readonly adr: string
      readonly key: MetadataKey
      readonly target: string
    }
  /** A Relation or Back-reference names the ADR's own ID. */
  | { readonly kind: 'self-reference'; readonly adr: string; readonly key: MetadataKey }
  /** `source` has been accepted and supersedes or amends `adr`, which lacks the Back-reference. */
  | {
      readonly kind: 'missing-back-reference'
      readonly adr: string
      readonly key: BackReferenceKey
      readonly source: string
    }
  /** `adr` carries a Back-reference to `source`, which has no such Relation in effect. */
  | {
      readonly kind: 'unfounded-back-reference'
      readonly adr: string
      readonly key: BackReferenceKey
      readonly source: string
    }
  /** `source` has been accepted and supersedes `adr`, whose Status is not `superseded`. */
  | { readonly kind: 'not-marked-superseded'; readonly adr: string; readonly source: string }
  /** `adr` is `superseded`, but no ADR that has been accepted supersedes it. */
  | { readonly kind: 'superseded-without-successor'; readonly adr: string }
  /** `supersedes` Relations form a cycle through these ADRs. */
  | { readonly kind: 'supersedes-cycle'; readonly adrs: readonly string[] }
  /** Several ADRs of a `sequential` log share a number. */
  | { readonly kind: 'duplicate-number'; readonly number: number; readonly adrs: readonly string[] }
  /** `.adr/config.yml` or `.adr-dir` cannot be used as written. */
  | { readonly kind: 'invalid-configuration'; readonly path: string; readonly detail: string }
  /** A configured Decision Log directory does not exist. */
  | { readonly kind: 'missing-log-directory'; readonly path: string }
