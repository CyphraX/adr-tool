<script lang="ts">
  import { renderMarkdown } from '../lib/markdown'
  import { app } from '../lib/state.svelte'

  // The ADR itself, set as a document: the same in the reading view and in the editor's preview.
  let { markdown }: { markdown: string } = $props()
  const html = $derived(renderMarkdown(markdown))

  // Nothing navigates inside the app. A link to another ADR of this log selects it;
  // a web link opens in the system browser; everything else does nothing.
  function followLink(event: MouseEvent): void {
    const anchor = (event.target as Element).closest('a')
    const href = anchor?.getAttribute('href')
    if (!href) return
    event.preventDefault()
    if (/^https?:\/\//i.test(href)) void window.api.openExternal(href)
    else app.selectByFileName(decodeURIComponent(href.split(/[?#]/)[0]!.split('/').pop()!))
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="document" onclick={followLink}>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized in lib/markdown.ts -->
  {@html html}
</div>

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
</style>
