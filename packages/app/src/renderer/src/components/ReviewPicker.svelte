<script lang="ts">
  import { reviewing } from '../lib/reviewing.svelte'
  import { searchSourceFiles } from '../lib/search'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { codeSpans } from '../lib/wording'

  // The Source Files Structure knows, to open one in the middle of Review: to annotate lines of
  // it, or to attach an Annotation whose file is gone to lines of another (part 9).
  const LIMIT = 60
  const tab = $derived(app.active)
  const outline = $derived(tab?.outline)
  const files = $derived(outline?.known?.sourceFiles ?? [])
  const attaching = $derived(
    tab?.review.attaching === undefined
      ? undefined
      : tab.review.known?.annotations.find((one) => one.id === tab.review.attaching)
  )
  let query = $state('')
  let cursor = $state(0)
  const matches = $derived(
    query.trim() === ''
      ? files.slice(0, LIMIT).map((file) => file.path)
      : searchSourceFiles(files, query)
          .slice(0, LIMIT)
          .map((hit) => hit.path)
  )
  const total = $derived(
    query.trim() === '' ? files.length : searchSourceFiles(files, query).length
  )

  $effect(() => {
    void query
    cursor = 0
  })

  function pick(path: string): void {
    reviewing.openFile(path)
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      cursor = Math.max(0, Math.min(matches.length - 1, cursor + step))
      document.getElementById(`pick-${cursor}`)?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter' && matches[cursor] !== undefined) {
      event.preventDefault()
      pick(matches[cursor]!)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      if (attaching) reviewing.cancelAttaching()
      else reviewing.backToList()
    }
  }
</script>

{#snippet withCode(text: string)}
  {#each codeSpans(text) as part, position (position)}{#if part.code}<code>{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

<section class="picker" aria-labelledby="review-picker-heading">
  <div class="head">
    <button class="back" onclick={() => reviewing.backToList()}>
      <span aria-hidden="true">←</span>
      {t.annotations.backToList}
    </button>
  </div>
  <div class="body">
    <h2 id="review-picker-heading">
      {attaching ? t.annotations.picker.attachHeading(attaching.id) : t.annotations.picker.heading}
    </h2>
    <p class="lead">
      {#if attaching}
        {@render withCode(t.annotations.picker.attachLead(attaching.anchor?.path ?? ''))}
      {:else}
        {t.annotations.picker.lead}
      {/if}
    </p>
    {#if !outline?.known}
      <p class="lead" role="status">
        {outline?.failed !== undefined && !outline.reading
          ? t.annotations.picker.failed(outline.failed)
          : t.annotations.picker.analysing}
      </p>
    {:else if files.length === 0}
      <p class="lead">{t.annotations.picker.noneLeft}</p>
    {:else}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:value={query}
        type="search"
        role="combobox"
        aria-expanded="true"
        aria-controls="review-picker-files"
        aria-activedescendant={matches.length > 0 ? `pick-${cursor}` : undefined}
        aria-label={t.annotations.picker.label}
        placeholder={t.annotations.picker.placeholder}
        spellcheck="false"
        autocomplete="off"
        autofocus
        {onkeydown}
      />
      {#if matches.length === 0}
        <p class="lead">{t.searching.none}</p>
      {:else}
        {#if total > matches.length}
          <p class="more">{t.searching.more(matches.length, total)}</p>
        {/if}
        <ul id="review-picker-files" role="listbox" aria-label={t.annotations.picker.label}>
          {#each matches as path, position (path)}
            <!-- The keyboard is handled by the field above the list. -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <li
              id="pick-{position}"
              role="option"
              aria-selected={position === cursor}
              class:current={position === cursor}
              onclick={() => pick(path)}
              onmousemove={() => (cursor = position)}
            >
              {path}
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</section>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--panel-raised);
    border-right: 1px solid var(--line);
  }

  .head {
    display: flex;
    align-items: center;
    flex: none;
    min-height: 37px;
    padding: 5px 14px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
  }

  .back {
    color: var(--focus);
  }

  .back:hover {
    text-decoration: underline;
  }

  .body {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding: 14px 14px 0;
  }

  h2 {
    font-size: 15px;
    font-weight: 600;
  }

  .lead {
    margin-top: 6px;
    color: var(--ink-soft);
    line-height: 1.55;
  }

  input {
    margin-top: 12px;
    padding: 6px 8px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  .more {
    margin-top: 8px;
    font-size: 12px;
    color: var(--ink-faint);
  }

  ul {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin: 8px -14px 0;
    padding: 0 0 12px;
    list-style: none;
  }

  li {
    padding: 4px 14px;
    font-family: var(--code);
    font-size: 12px;
    overflow-wrap: anywhere;
    cursor: default;
  }

  li.current {
    background: var(--selected);
  }

  code {
    font-family: var(--code);
    font-size: 0.92em;
  }
</style>
