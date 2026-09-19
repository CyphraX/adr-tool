/**
 * The Metadata keys the tool owns, in the order it inserts them (docs/file-format.md,
 * section 3). Every other key in an ADR's frontmatter is foreign and never touched.
 */
export const METADATA_KEYS = [
  'status',
  'created',
  'decided',
  'decision-makers',
  'tags',
  'supersedes',
  'amends',
  'depends-on',
  'relates-to',
  'superseded-by',
  'amended-by',
  'corrections'
] as const

export type MetadataKey = (typeof METADATA_KEYS)[number]
