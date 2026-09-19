<script lang="ts">
  import { STATUSES } from '@adr-tool/core'
  import { app, statusKey, type StatusFilter } from '../lib/state.svelte'
  import { STATUS_LABEL } from '../lib/wording'
  import StatusMark from './StatusMark.svelte'

  const logs = $derived(app.active?.repository.repository.logs ?? [])
  const view = $derived(app.active?.view ?? 'adrs')
  const filter = $derived(app.active?.statusFilter ?? 'all')

  const counts = $derived.by(() => {
    const result: Partial<Record<StatusFilter, number>> = { all: app.log?.adrs.length ?? 0 }
    for (const adr of app.log?.adrs ?? []) {
      const key = statusKey(adr)
      result[key] = (result[key] ?? 0) + 1
    }
    return result
  })

  // An ADR whose Status cannot be read is rare; its filter only appears when there is one.
  const filters = $derived<StatusFilter[]>([
    'all',
    ...STATUSES,
    ...(counts.unknown ? (['unknown'] as const) : [])
  ])
</script>

<nav aria-label="Decision Logs and filters">
  <section>
    <h2>Decision Logs</h2>
    {#each logs as log (log.path)}
      <button
        class="row"
        class:current={log.path === app.log?.path}
        aria-current={log.path === app.log?.path}
        onclick={() => app.showLog(log.path)}
      >
        <span class="label">{log.path === '' ? '(repository root)' : log.path}</span>
        <span class="count">{log.adrs.length}</span>
      </button>
    {/each}
  </section>

  <section>
    <h2>Status</h2>
    {#each filters as candidate (candidate)}
      <button
        class="row"
        class:current={view === 'adrs' && candidate === filter}
        aria-pressed={view === 'adrs' && candidate === filter}
        onclick={() => app.filterBy(candidate)}
      >
        {#if candidate === 'all'}
          <span class="label all">All</span>
        {:else}
          <StatusMark status={candidate} />
          <span class="label">{STATUS_LABEL[candidate]}</span>
        {/if}
        <span class="count">{counts[candidate] ?? 0}</span>
      </button>
    {/each}
  </section>

  <section>
    <h2>Check</h2>
    <button
      class="row"
      class:current={view === 'problems'}
      aria-pressed={view === 'problems'}
      onclick={() => app.show('problems')}
    >
      <span class="label all">Problems</span>
      <span class="count" class:some={app.problemGroups.length > 0}>
        {app.problemGroups.length}
      </span>
    </button>
  </section>
</nav>

<style>
  nav {
    overflow-y: auto;
    padding: 6px 0 12px;
    background: var(--panel);
    border-right: 1px solid var(--line);
  }

  h2 {
    padding: 12px 14px 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 26px;
    padding: 0 14px;
    text-align: left;
  }

  .row:hover {
    background: var(--hover);
  }

  .row.current {
    background: var(--selected);
  }

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* "All" has no mark; it lines up with the labels that do. */
  .label.all {
    padding-left: 20px;
  }

  .count {
    color: var(--ink-faint);
  }

  .count.some {
    min-width: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--problem);
    color: var(--paper);
    font-size: 10.5px;
    font-weight: 600;
    line-height: 16px;
    text-align: center;
  }
</style>
