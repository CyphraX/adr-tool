/** Replace `text[start, end)` with `insert`. An insertion has `start === end`. */
export interface TextEdit {
  readonly start: number
  readonly end: number
  readonly insert: string
}

/**
 * Apply edits to a text. Offsets refer to the original text; edits must not overlap.
 * This is the only way the tool ever produces new file content (ADR-0002): whatever
 * no edit covers comes out byte for byte as it went in.
 */
export function applyEdits(text: string, edits: readonly TextEdit[]): string {
  const ordered = [...edits].sort((a, b) => a.start - b.start || a.end - b.end)
  let result = ''
  let cursor = 0
  for (const edit of ordered) {
    if (edit.start < cursor || edit.end < edit.start || edit.end > text.length) {
      throw new RangeError(`Overlapping or out-of-range edit at ${edit.start}..${edit.end}`)
    }
    result += text.slice(cursor, edit.start) + edit.insert
    cursor = edit.end
  }
  return result + text.slice(cursor)
}
