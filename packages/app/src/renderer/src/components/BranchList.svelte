<script lang="ts">
  import { language } from '../lib/language'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { STATUS_LABEL, STATUS_WIDTH, logName, prefixOf } from '../lib/wording'
  import StatusMark from './StatusMark.svelte'

  const branches = $derived(app.active?.branches)
  const overview = $derived(branches?.overview)
  const selected = $derived(branches?.selected)
  // With one Decision Log there is no need to say which one an ADR belongs to; a branch may
  // have one that the working tree has not.
  const severalLogs = $derived(
    new Set([
      ...(app.active?.repository.repository.logs.map((log) => log.path) ?? []),
      ...(overview?.branches.flatMap((branch) => branch.adrs.map((adr) => adr.log)) ?? [])
    ]).size > 1
  )

  const day = new Intl.DateTimeFormat(language, { dateStyle: 'medium' })
  const dated = (iso: string): string => {
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? iso : day.format(date)
  }
</script>

<div class="list" style:--status={STATUS_WIDTH}>
  <div class="tools">
    <p class="lead">{t.branches.lead}</p>
    <button onclick={() => app.loadBranches()} disabled={branches?.loading}>
      {t.branches.refresh}
    </button>
  </div>

  <div class="rows" role="region" aria-label={t.branches.label} aria-busy={branches?.loading}>
    {#if overview === undefined}
      <p class="empty">{branches?.loading ? t.branches.asking : t.branches.failed}</p>
    {:else if overview.failed}
      <p class="empty">{t.branches.failed}</p>
    {:else if overview.branches.length === 0}
      <p class="empty">{t.branches.none}</p>
    {/if}
    {#if overview && overview.unread.length > 0}
      <p class="unread">{t.branches.unread(overview.unread.join(', '))}</p>
    {/if}
    {#if overview && overview.branches.length > 0}
      {#each overview.branches as branch (branch.sha)}
        {@const [name, ...others] = branch.names}
        <div class="branch" role="group" aria-label={name}>
          <h3>
            <span class="name">{name}</span>
            {#if others.length > 0}
              <span class="others">{t.branches.also(others.join(', '))}</span>
            {/if}
            <span class="date">{t.branches.lastCommit(dated(branch.date))}</span>
          </h3>
          {#each branch.adrs as adr (`${adr.log}/${adr.id}`)}
            {@const status = adr.status ?? 'unknown'}
            <button
              class="row"
              class:selected={selected?.sha === branch.sha && selected.path === adr.path}
              aria-pressed={selected?.sha === branch.sha && selected.path === adr.path}
              onclick={() => app.showBranchAdr(branch.sha, adr.path, name!)}
            >
              <span class="prefix">{prefixOf(adr)}</span>
              <span class="title">
                <span class="text" title={adr.title ?? adr.id}>{adr.title ?? adr.id}</span>
                {#if severalLogs}
                  <span class="log">{logName(adr.log)}</span>
                {/if}
              </span>
              <span class="status">
                <StatusMark {status} />
                {adr.rawStatus ?? STATUS_LABEL[status]}
              </span>
              <span class="change">
                {#if adr.change === 'added'}
                  <span class="tag" title={t.branches.addedHint}>{t.branches.added}</span>
                {:else if adr.statusHere || adr.rawStatusHere}
                  <span class="tag">
                    {t.branches.here(
                      adr.rawStatusHere ?? STATUS_LABEL[adr.statusHere ?? 'unknown']
                    )}
                  </span>
                {/if}
              </span>
              {#if adr.sameNumber.length > 0}
                <span class="clash" title={t.branches.sameNumberHint}>
                  {t.branches.sameNumber(adr.sameNumber.join(', '))}
                </span>
              {/if}
            </button>
          {/each}
        </div>
      {/each}
    {/if}
  </div>
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
    align-items: flex-start;
    gap: 12px;
    flex: none;
    padding: 8px 14px;
    border-bottom: 1px solid var(--line);
  }

  .lead {
    flex: 1;
    font-size: 12px;
    line-height: 1.45;
    color: var(--ink-soft);
  }

  .tools button {
    flex: none;
    padding: 3px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .tools button:hover:not(:disabled) {
    background: var(--hover);
  }

  .rows {
    overflow-y: auto;
    flex: 1;
  }

  .empty {
    padding: 16px 14px;
    color: var(--ink-soft);
  }

  .unread {
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
    color: var(--problem);
    font-size: 12px;
  }

  .branch + .branch {
    border-top: 1px solid var(--line);
  }

  h3 {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
    padding: 12px 14px 4px;
    font-size: 12.5px;
    font-weight: 600;
  }

  .name {
    font-family: var(--code);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .others,
  .date {
    font-weight: 400;
    font-size: 11.5px;
    color: var(--ink-faint);
  }

  .date {
    margin-left: auto;
  }

  .row {
    display: grid;
    grid-template-columns: 5.5ch minmax(0, 1fr) var(--status) 11ch;
    column-gap: 12px;
    align-items: center;
    width: 100%;
    min-height: 30px;
    padding: 4px 14px;
    text-align: left;
  }

  @container (max-width: 520px) {
    .row {
      grid-template-columns: 5.5ch minmax(0, 1fr) var(--status);
    }

    .change {
      grid-column: 2 / -1;
    }
  }

  .row:hover {
    background: var(--hover);
  }

  .row.selected {
    background: var(--selected);
  }

  .prefix {
    color: var(--ink-soft);
    white-space: nowrap;
  }

  .title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .text {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .log {
    flex: none;
    font-size: 11.5px;
    color: var(--ink-faint);
  }

  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .tag {
    padding: 0 6px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    font-size: 11px;
    color: var(--ink-soft);
    white-space: nowrap;
  }

  .clash {
    grid-column: 2 / -1;
    font-size: 11.5px;
    color: var(--proposed);
  }
</style>
