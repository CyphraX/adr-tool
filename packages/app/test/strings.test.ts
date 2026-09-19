import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '../src/renderer/src')

/** The attributes whose value a person reads or hears. */
const READ_ALOUD = /\s(?:aria-label|title|placeholder|alt|label)="[^"{]*\p{L}{2,}[^"]*"/gu

/** The words a component's markup says by itself, rather than through strings.ts or wording.ts. */
function literalText(svelte: string): string[] {
  let markup = svelte
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  // Expressions and blocks go, innermost first: what they say comes from code.
  for (let before = ''; before !== markup;) {
    before = markup
    markup = markup.replace(/\{[^{}]*\}/g, '')
  }
  const attributes = [...markup.matchAll(READ_ALOUD)].map((match) => match[0].trim())
  const text = markup.replace(/<[^>]*>/g, ' ').match(/\p{L}{2,}(?:[ '’-]+\p{L}+)*/gu) ?? []
  return [...attributes, ...text]
}

function components(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? components(join(directory, entry.name))
      : entry.name.endsWith('.svelte')
        ? [join(directory, entry.name)]
        : []
  )
}

describe('the texts of the window are in strings.ts and wording.ts', () => {
  it('sees text and spoken attributes in markup, and nothing in expressions', () => {
    const sample = `<script lang="ts">const label = 'Hidden'</script>
      <!-- A comment. -->
      <button title="Opens it" aria-label={t.open} onclick={() => run('now')}>Open {name}</button>
      {#if ready}<p class="note">{t.ready}</p>{/if}
      <style>.note { color: red; }</style>`
    expect(literalText(sample)).toEqual(['title="Opens it"', 'Open'])
  })

  it('no component says anything by itself', () => {
    const found = components(RENDERER).flatMap((file) =>
      literalText(readFileSync(file, 'utf8')).map((text) => `${file}: ${text}`)
    )
    expect(found).toEqual([])
  })
})
