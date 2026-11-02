<script lang="ts">
  import type { Attachment } from 'svelte/attachments'
  import { drawIn, windowTheme, type Theme } from '../lib/diagrams'
  import { renderMarkdown, type DocumentBase } from '../lib/markdown'
  import { app } from '../lib/state.svelte'

  // The ADR itself, set as a document: the same in the reading view and in the editor's preview.
  // With a base, the images it names next to it in its repository are shown.
  let {
    markdown,
    base,
    onfile = (fileName: string) => app.selectByFileName(fileName)
  }: {
    markdown: string
    base?: DocumentBase | undefined
    /** A link to a file next to the ADR: by default, the ADR of this log it names is selected. */
    onfile?: (fileName: string) => void
  } = $props()
  const html = $derived(renderMarkdown(markdown, base))

  // A Mermaid block is drawn in place (docs/adr/0016-…). The document is set here rather than
  // by Svelte, so that what takes a block's place is the document's and nobody else's.
  let theme = $state<Theme>(windowTheme())
  $effect(() => {
    const scheme = window.matchMedia('(prefers-color-scheme: dark)')
    const follow = (): void => void (theme = windowTheme())
    scheme.addEventListener('change', follow)
    return () => scheme.removeEventListener('change', follow)
  })
  function setDocument(html: string, theme: Theme): Attachment<HTMLElement> {
    return (element) => {
      // Sanitized in lib/markdown.ts.
      element.innerHTML = html
      drawIn(element, theme)
    }
  }

  // Nothing navigates inside the app. A link to another ADR of this log selects it;
  // a web link opens in the system browser; everything else does nothing.
  function followLink(event: MouseEvent): void {
    const anchor = (event.target as Element).closest('a')
    const href = anchor?.getAttribute('href')
    if (!href) return
    event.preventDefault()
    if (/^https?:\/\//i.test(href)) void window.api.openExternal(href)
    else onfile(decodeURIComponent(href.split(/[?#]/)[0]!.split('/').pop()!))
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="document" {@attach setDocument(html, theme)} onclick={followLink}></div>

<style>
  .document {
    max-width: 46rem;
    padding: 28px 40px 64px;
    font-family: var(--document);
    font-size: 16px;
    line-height: 1.62;
    font-variant-numeric: normal;
    user-select: text;
    cursor: auto;
  }

  .document :global(h1) {
    margin-bottom: 0.7em;
    font-size: 1.75em;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.01em;
  }

  .document :global(h2) {
    margin: 1.9em 0 0.5em;
    font-family: var(--ui);
    font-size: 0.9em;
    font-weight: 600;
    color: var(--ink-soft);
  }

  .document :global(h3),
  .document :global(h4) {
    margin: 1.5em 0 0.4em;
    font-size: 1em;
    font-weight: 600;
  }

  .document :global(p),
  .document :global(ul),
  .document :global(ol),
  .document :global(blockquote),
  .document :global(pre),
  .document :global(table) {
    margin: 0 0 1em;
  }

  .document :global(ul),
  .document :global(ol) {
    padding-left: 1.4em;
  }

  .document :global(li) {
    margin-bottom: 0.45em;
  }

  .document :global(a) {
    color: inherit;
    text-decoration-color: var(--focus);
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .document :global(code) {
    font-family: var(--code);
    font-size: 0.86em;
    padding: 0.1em 0.3em;
    border-radius: 3px;
    background: var(--panel);
  }

  .document :global(pre) {
    padding: 12px 14px;
    overflow-x: auto;
    border-radius: 4px;
    background: var(--panel);
    line-height: 1.5;
  }

  .document :global(pre code) {
    padding: 0;
    background: none;
  }

  .document :global(blockquote) {
    padding-left: 1em;
    border-left: 3px solid var(--line-strong);
    color: var(--ink-soft);
  }

  .document :global(table) {
    border-collapse: collapse;
    font-family: var(--ui);
    font-size: 0.85em;
  }

  .document :global(th),
  .document :global(td) {
    padding: 5px 12px 5px 0;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: top;
  }

  .document :global(hr) {
    margin: 2em 0;
    border: 0;
    border-top: 1px solid var(--line);
  }

  .document :global(input[type='checkbox']) {
    margin-right: 0.4em;
  }

  /* A drawn Mermaid block, and a block that cannot be drawn, with what Mermaid says beside it. */
  .document :global(figure.diagram) {
    margin: 0 0 1em;
    overflow-x: auto;
  }

  .document :global(figure.diagram svg) {
    display: block;
    max-width: 100%;
    height: auto;
  }

  .document :global(.diagram-source summary) {
    margin-top: 4px;
    font-family: var(--ui);
    font-size: 0.75em;
    color: var(--ink-faint);
    cursor: default;
  }

  .document :global(.diagram-source pre) {
    margin-top: 6px;
  }

  .document :global(.diagram-error) {
    margin-top: -0.6em;
    font-family: var(--ui);
    font-size: 0.8em;
    color: var(--problem);
  }
</style>
