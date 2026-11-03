<script lang="ts">
  import {
    anchorStateOf,
    filtered,
    firstLine,
    linesOf,
    ownersOf,
    placeOf,
    type ReviewFilter
  } from '../lib/review'
  import { reviewing } from '../lib/reviewing.svelte'
  import { app } from '../lib/state.svelte'
  import { codeSpans } from '../lib/wording'
  import { t } from '../lib/strings'

  // The Annotations the sidebar leaves, newest first: what each one is, the first line of its
  // text, where it is, who wrote it when, and how many Replies it has. An orphaned one is
  // marked, and so is one that moved (docs/plan-vision.md, part 9).
  const tab = $derived(app.active)
  const review = $derived(tab?.review)
  const known = $derived(review?.known)
  const filter = $derived<ReviewFilter>(review?.filter ?? {})
  const owners = $derived(ownersOf(tab?.outline.known))
  const shown = $derived(filtered(known?.annotations ?? [], filter, owners))
  const all = $derived(known?.annotations.length ?? 0)
  const selectedId = $derived(review?.selectedId)
  const filtering = $derived(Object.keys(filter).length > 0)

  // Wherever the selection came from — the search, a Problem, the code viewer — the list shows it.
  $effect(() => {
    if (selectedId)
      document.getElementById(`annotation-${selectedId}`)?.scrollIntoView({ block: 'nearest' })
  })

  function onkeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (step === 0 || shown.length === 0) return
    event.preventDefault()
    const position = shown.findIndex((annotation) => annotation.id === selectedId)
    const next =
      position === -1
        ? shown[step === 1 ? 0 : shown.length - 1]
        : shown[Math.max(0, Math.min(shown.length - 1, position + step))]
    if (next) reviewing.select(next.id)
  }
</script>

{#snippet withCode(text: string)}
  {#each codeSpans(text) as part, position (position)}{#if part.code}<code>{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

<div class="list">
  <div class="tools">
    <button class="search" onclick={() => app.startSearching()}>{t.search}</button>
    <button title={t.annotations.list.annotateFileHint} onclick={() => reviewing.startPicking()}>
      {t.annotations.list.annotateFile}
    </button>
  </div>
  {#if known && all > 0}
    <div class="head">
      <span>{t.annotations.list.count(shown.length, all)}</span>
      {#if filtering}
        <button class="link" onclick={() => reviewing.clearFilter()}>
          {t.annotations.list.showAll}
        </button>
      {/if}
    </div>
  {/if}

  {#if !known}
    <p class="empty" role="status">
      {review?.failed !== undefined && !review.reading
        ? t.annotations.list.failed(review.failed)
        : t.annotations.reading}
    </p>
  {:else if known.configUnreadable}
    <p class="empty">{@render withCode(t.annotations.list.configUnreadable)}</p>
  {:else if all === 0}
    <p class="empty">{t.annotations.list.none}</p>
  {:else if shown.length === 0}
    <p class="empty">{t.annotations.list.noneFiltered}</p>
  {:else}
    <div
      class="rows"
      role="listbox"
      tabindex="0"
      aria-label={t.annotations.list.label}
      aria-activedescendant={selectedId ? `annotation-${selectedId}` : undefined}
      {onkeydown}
    >
      {#each shown as annotation (annotation.id)}
        {@const place = placeOf(annotation)}
        {@const anchor = anchorStateOf(annotation)}
        {@const at = place ?? annotation.anchor}
        <!-- The keyboard is handled by the listbox around the rows. -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          id="annotation-{annotation.id}"
          class="row"
          class:selected={annotation.id === selectedId}
          class:resolved={annotation.state === 'resolved'}
          role="option"
          tabindex="-1"
          aria-selected={annotation.id === selectedId}
          onclick={() => reviewing.select(annotation.id)}
        >
          <span class="mark" aria-hidden="true"></span>
          <span class="first">
            <span class="type">
              {annotation.type ? t.annotations.types[annotation.type] : t.annotations.kind}
            </span>
            <span class="text">{firstLine(annotation.text) || t.annotations.noText}</span>
            {#if anchor === 'orphaned'}
              <span class="tag orphaned">{t.annotations.list.orphaned}</span>
            {:else if anchor === 'moved'}
              <span class="tag moved">{t.annotations.list.moved}</span>
            {/if}
            {#if annotation.state === 'resolved'}
              <span class="tag">{t.annotations.list.resolved}</span>
            {/if}
          </span>
          <span class="second">
            {#if at}
              <span class="place" title={at.path}>{at.path}:{linesOf(at)}</span>
            {:else}
              <span class="place none">{t.annotations.list.noAnchor}</span>
            {/if}
            <span class="about">
              {t.annotations.about(annotation.author, annotation.date, annotation.replies.length)}
            </span>
          </span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .list {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--panel-raised);
    border-right: 1px solid var(--line);
  }

  .tools {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex: none;
    padding: 6px 14px;
    border-bottom: 1px solid var(--line);
  }

  .tools button {
    padding: 3px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .tools .search {
    margin-right: auto;
    color: var(--ink-soft);
  }

  .tools button:hover {
    background: var(--hover);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex: none;
    height: 28px;
    padding: 0 14px;
    font-size: 11.5px;
    color: var(--ink-faint);
    border-bottom: 1px solid var(--line);
  }

  .link {
    color: var(--focus);
    font-size: 11.5px;
  }

  .link:hover {
    text-decoration: underline;
  }

  .rows {
    overflow-y: auto;
    flex: 1;
  }

  .row {
    display: grid;
    grid-template-columns: 3px minmax(0, 1fr);
    grid-template-rows: auto auto;
    column-gap: 11px;
    row-gap: 2px;
    padding: 7px 14px 8px 11px;
    border-bottom: 1px solid var(--line);
  }

  .row:hover {
    background: var(--hover);
  }

  .row.selected {
    background: var(--selected);
  }

  /* As in the gutter of the code viewer: amber waits for a person, ink is resolved. */
  .mark {
    grid-row: 1 / 3;
    border-radius: 2px;
    background: var(--waiting);
  }

  .row.resolved .mark {
    background: var(--ink-soft);
  }

  .first,
  .second {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .type {
    flex: none;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-soft);
  }

  .text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .row.resolved .text {
    color: var(--ink-soft);
  }

  .tag {
    flex: none;
    padding: 0 6px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    color: var(--ink-soft);
    font-size: 11px;
    line-height: 16px;
  }

  .tag.moved {
    border-color: var(--waiting);
    color: var(--waiting);
  }

  .tag.orphaned {
    border-color: var(--problem);
    color: var(--problem);
  }

  .second {
    font-size: 12px;
    color: var(--ink-faint);
  }

  .place {
    min-width: 0;
    overflow: hidden;
    font-family: var(--code);
    font-size: 11.5px;
    color: var(--ink-soft);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .place.none {
    font-family: var(--ui);
  }

  .about {
    flex: none;
    margin-left: auto;
    white-space: nowrap;
  }

  .empty {
    padding: 18px 14px;
    color: var(--ink-soft);
    line-height: 1.55;
  }

  code {
    font-family: var(--code);
    font-size: 0.92em;
  }
</style>
