const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/
const HEADING_1 = /^ {0,3}#(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/

/**
 * The title of an ADR: the text of the first level-one ATX heading in its body that is
 * not inside a fenced code block. `undefined` when there is none.
 */
export function titleOf(body: string): string | undefined {
  let fence: string | undefined
  for (const line of body.split(/\r?\n/)) {
    const open = FENCE_OPEN.exec(line)?.[1]
    if (fence) {
      // A fence closes with the same character, at least as long, and nothing else on the line.
      const closes = open !== undefined && open[0] === fence[0] && open.length >= fence.length
      if (closes && line.trim() === open) fence = undefined
      continue
    }
    if (open) {
      fence = open
      continue
    }
    const title = HEADING_1.exec(line)?.[1]?.trim()
    if (title) return title
  }
  return undefined
}
