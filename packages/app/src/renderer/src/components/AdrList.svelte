<script lang="ts">
  import { problemsOf } from '../lib/problems'
  import { app, statusKey } from '../lib/state.svelte'
  import { STATUS_LABEL, prefixOf } from '../lib/wording'
  import StatusMark from './StatusMark.svelte'

  const selectedId = $derived(app.selected?.id)
  const changed = $derived(app.active?.repository.git?.changed ?? [])

  // Wherever the selection came from — a search, a Relation, a Problem — the list shows it.
  $effect(() => {
    if (selectedId)
      document.getElementById(`adr-${selectedId}`)?.scrollIntoView({ block: 'nearest' })
  })

  function onkeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (step === 0 || app.adrs.length === 0) return
    event.preventDefault()
    const position = app.adrs.findIndex((adr) => adr.id === selectedId)
    const next = app.adrs[Math.max(0, Math.min(app.adrs.length - 1, position + step))]
    if (!next) return
    app.select(next.id)
  }
</script>

<div class="list">
  <div class="tools">
    <button class="search" onclick={() => app.startSearching()}>
      Search <kbd>{window.api.platform === 'darwin' ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
    <button onclick={() => app.startCreating()}>New ADR</button>
  </div>
  <div class="head" aria-hidden="true">
    <span class="prefix">{app.log?.naming === 'date' ? 'Date' : 'No.'}</span>
    <span>Title</span>
    <span>Status</span>
    <span class="decided">Decided</span>
  </div>

  {#if app.adrs.length === 0}
    <p class="empty">
      {app.log?.adrs.length === 0
        ? 'This Decision Log has no ADRs yet.'
        : 'No ADR has this Status.'}
    </p>
  {:else}
    <div
      class="rows"
      role="listbox"
      tabindex="0"
      aria-label="ADRs"
      aria-activedescendant={selectedId ? `adr-${selectedId}` : undefined}
      {onkeydown}
    >
      {#each app.adrs as adr (adr.id)}
        {@const status = statusKey(adr)}
        {@const problems = problemsOf(app.problemGroups, adr.id).filter((own) => !own.cause).length}
        <!-- The keyboard is handled by the listbox around the rows. -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          id="adr-{adr.id}"
          class="row {status}"
          class:selected={adr.id === selectedId}
          role="option"
          tabindex="-1"
          aria-selected={adr.id === selectedId}
          onclick={() => app.select(adr.id)}
        >
          <span class="prefix">{prefixOf(adr)}</span>
          <span class="title">
            <span class="text" title={adr.title ?? adr.id}>{adr.title ?? adr.id}</span>
            {#if changed.includes(adr.path)}
              <span class="uncommitted" title="Uncommitted changes" aria-label="Uncommitted changes"
              ></span>
            {/if}
            {#if problems > 0}
              <span class="problems" title="{problems} {problems === 1 ? 'Problem' : 'Problems'}">
                {problems}
              </span>
            {/if}
          </span>
          <span class="status">
            <StatusMark {status} />
            {adr.metadata.rawStatus ?? STATUS_LABEL[status]}
          </span>
          <span class="decided">{adr.metadata.decided ?? ''}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .list {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
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

  kbd {
    margin-left: 6px;
    font-family: var(--ui);
    font-size: 11px;
    color: var(--ink-faint);
  }

  .tools button:hover {
    background: var(--hover);
  }

  .head,
  .row {
    display: grid;
    grid-template-columns: 5.5ch minmax(0, 1fr) 12.5ch 10.5ch;
    column-gap: 12px;
    align-items: center;
    padding: 0 14px;
  }

  /* In a narrow pane the title matters more than the date; the detail shows it anyway. */
  @container (max-width: 520px) {
    .head,
    .row {
      grid-template-columns: 5.5ch minmax(0, 1fr) 12.5ch;
    }

    .decided {
      display: none;
    }
  }

  .head {
    height: 28px;
    flex: none;
    font-size: 11.5px;
    color: var(--ink-faint);
    border-bottom: 1px solid var(--line);
  }

  .rows {
    overflow-y: auto;
    flex: 1;
  }

  .row {
    height: 30px;
  }

  .row:hover {
    background: var(--hover);
  }

  .row.selected {
    background: var(--selected);
  }

  .prefix {
    color: var(--ink-soft);
  }

  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .text {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-soft);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .decided {
    color: var(--ink-faint);
    text-align: right;
  }

  /* A decision that no longer holds steps back; one that was never taken stays readable. */
  .row.superseded .text,
  .row.deprecated .text {
    color: var(--ink-faint);
  }

  .row.superseded .text {
    text-decoration: line-through;
    text-decoration-color: var(--line-strong);
  }

  .uncommitted {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--proposed);
  }

  .problems {
    flex: none;
    min-width: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--problem);
    color: var(--paper);
    font-size: 10.5px;
    font-weight: 600;
    line-height: 16px;
    text-align: center;
    text-decoration: none;
  }

  .empty {
    padding: 18px 14px;
    color: var(--ink-soft);
  }
</style>
