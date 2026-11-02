/**
 * What of a `.svelte` file is code (docs/structure-format.md, section 3, "Svelte"): its
 * `<script>` blocks, instance and `module`. The Svelte compiler is not used.
 */

/** A comment, or the document head, whose scripts belong to the page and not to the component. */
const NOT_THE_COMPONENTS = /<!--[\s\S]*?-->|<svelte:head(?:\s[^>]*)?>[\s\S]*?<\/svelte:head\s*>/gi
/** A script tag whose attributes may hold `>` inside quotes: `generics="T extends A<B>"`. */
const SCRIPT = /(<script(?:\s(?:[^>"']|"[^"]*"|'[^']*')*)?>)([\s\S]*?)<\/script\s*>/gi

/** Everything but line breaks turned into spaces, so that offsets and lines stay where they were. */
const blank = (text: string): string => text.replace(/[^\r\n]/g, ' ')

/**
 * The script blocks of a component, at the offsets they have in the file and with
 * everything else blanked out. Read as one TypeScript file, its lines are the lines of the
 * `.svelte` file.
 */
export function scriptOfSvelte(text: string): string {
  const masked = text.replace(NOT_THE_COMPONENTS, blank)
  let script = ''
  let end = 0
  for (const match of masked.matchAll(SCRIPT)) {
    const content = match[2]!
    const start = match.index + match[1]!.length
    script += blank(masked.slice(end, start)) + content
    end = start + content.length
  }
  return script + blank(masked.slice(end))
}
