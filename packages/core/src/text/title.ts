import { headingOf, proseLines } from './prose'

/**
 * The title of an ADR: the text of the first level-one ATX heading in its body that is
 * not inside a fenced code block. `undefined` when there is none.
 *
 * A leading number that repeats the ADR's own — `# 3. Title`, as adr-tools writes it — is
 * not part of the title (docs/file-format.md, section 4).
 */
export function titleOf(body: string, number?: number): string | undefined {
  for (const line of proseLines(body)) {
    const heading = headingOf(line.content)
    if (heading?.level !== 1 || !heading.text) continue
    const numbered = /^(\d+)\.[ \t]+(.+)$/.exec(heading.text)
    return numbered && Number(numbered[1]) === number ? numbered[2]! : heading.text
  }
  return undefined
}
