/** A bare file name in the same directory. A path, a URL or an anchor names no ADR. */
const ADR_FILE = /^(?:\.\/)?([^/\\#?:]+)\.md$/

/**
 * `<words> [<label>](<target>)` and nothing else: how adr-tools and MADR 3 write a link to
 * another ADR. One link per line; the label may contain brackets. Taken apart by hand, so
 * that a long line costs no more than its length.
 */
export function linkLine(content: string): { words: string; target: string } | undefined {
  const open = content.indexOf('[')
  const close = content.lastIndexOf('](')
  if (open <= 0 || close < open || !content.endsWith(')')) return undefined
  let words = content.slice(0, open).trimEnd()
  if (words.endsWith(':')) words = words.slice(0, -1).trimEnd()
  const label = content.slice(open + 1, close)
  const target = content.slice(close + 2, -1).trim()
  if (!words || words.includes(']') || label.includes('](') || /[\s()]/.test(target)) {
    return undefined
  }
  return { words, target }
}

/** The ID a link target names: the file name without `.md`. */
export function targetOf(target: string): string | undefined {
  return ADR_FILE.exec(target)?.[1]
}
