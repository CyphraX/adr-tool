import { isScalar } from 'yaml'

/**
 * The text of a YAML scalar as its author wrote it, or `undefined` for an empty value.
 * Metadata values are strings: `tags: [2024]` is the tag "2024", not the number, so the
 * type YAML resolved the scalar to is ignored.
 */
export function scalarText(node: unknown): string | undefined {
  if (!isScalar(node) || node.value === null) return undefined
  return node.source ?? String(node.value)
}
