<script lang="ts">
  import { STATUSES, type DecisionLog } from '@adr-tool/core'
  import { app, statusKey } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { dashboardOf, localToday, type StatusKey } from '../lib/views'
  import { STATUS_LABEL, prefixOf } from '../lib/wording'
  import StatusMark from './StatusMark.svelte'

  // The Decision Log in view in figures (docs/plan-roadmap.md, part 11): how many ADRs stand
  // where, what is wrong, what waits for a decision and for how long, what was decided last,
  // and which Components the ADRs affect. Each figure leads to what it counts.
  let { log }: { log: DecisionLog } = $props()

  // Today, as long as the view is open: past midnight it is another day.
  let today = $state(localToday())
  $effect(() => {
    const timer = setInterval(() => (today = localToday()), 60_000)
    return () => clearInterval(timer)
  })
  const dashboard = $derived(dashboardOf(log.adrs, today))
  // The median says something about several proposals that name the day they were written.
  const dated = $derived(dashboard.waiting.filter((one) => one.days !== undefined).length)
  const problems = $derived(app.problemGroups.length)
  const declared = $derived(
    new Map((app.active?.repository.components ?? []).map((one) => [one.id, one.name]))
  )
  const statuses = $derived<StatusKey[]>([
    ...STATUSES,
    ...(dashboard.counts.unknown > 0 ? (['unknown'] as const) : [])
  ])
</script>

<div class="dashboard">
  <div class="head">
    <h2>{t.sidebar.dashboard}</h2>
    <span class="tools">
      <button onclick={() => app.startSearching()}>{t.search}</button>
      <button onclick={() => app.show('adrs')}>{t.backToAdrs}</button>
    </span>
  </div>

  <div class="scroll" aria-label={t.dashboard.label}>
    <section class="wide">
      <h3>
        {t.dashboard.byStatus} <span class="faint">{t.dashboard.total(dashboard.total)}</span>
      </h3>
      {#if dashboard.total > 0}
        <div class="share" aria-hidden="true">
          {#each statuses as status (status)}
            {#if dashboard.counts[status] > 0}
              <span
                class="part {status}"
                style:flex-grow={dashboard.counts[status]}
                title="{STATUS_LABEL[status]}: {dashboard.counts[status]}"
              ></span>
            {/if}
          {/each}
        </div>
      {/if}
      <div class="tiles">
        {#each statuses as status (status)}
          <button class="tile {status}" onclick={() => app.filterBy(status)}>
            <span class="figure">{dashboard.counts[status]}</span>
            <span class="label"><StatusMark {status} /> {STATUS_LABEL[status]}</span>
          </button>
        {/each}
      </div>
    </section>

    <section>
      <h3>{t.dashboard.problems}</h3>
      {#if problems === 0}
        <p class="quiet">{t.dashboard.noProblems}</p>
      {:else}
        <p class="figure problems">{problems}</p>
        <p>{t.dashboard.problemCount(problems)}</p>
        <button class="link" onclick={() => app.show('problems')}>{t.dashboard.showProblems}</button
        >
      {/if}
    </section>

    <section>
      <h3>{t.dashboard.waiting}</h3>
      {#if dashboard.waiting.length === 0}
        <p class="quiet">{t.dashboard.noneWaiting}</p>
      {:else}
        <ul>
          {#each dashboard.waiting as one (one.adr.id)}
            <li>
              <button class="link" onclick={() => app.select(one.adr.id)}>
                <span class="prefix">{prefixOf(one.adr)}</span>
                {one.adr.title ?? one.adr.id}
              </button>
              <span class="days">{t.dashboard.days(one.days)}</span>
            </li>
          {/each}
        </ul>
        {#if dashboard.medianWait !== undefined && dated > 1}
          <p class="quiet">{t.dashboard.median(dashboard.medianWait)}</p>
        {/if}
      {/if}
    </section>

    <section>
      <h3>{t.dashboard.recent}</h3>
      {#if dashboard.recent.length === 0}
        <p class="quiet">{t.dashboard.noneDecided}</p>
      {:else}
        <ul>
          {#each dashboard.recent as adr (adr.id)}
            <li>
              <StatusMark status={statusKey(adr)} />
              <button class="link" onclick={() => app.select(adr.id)}>
                <span class="prefix">{prefixOf(adr)}</span>
                {adr.title ?? adr.id}
              </button>
              <span class="days">{adr.metadata.decided}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section>
      <h3>{t.dashboard.components}</h3>
      {#if dashboard.components.length === 0}
        <p class="quiet">{t.dashboard.noComponents}</p>
      {:else}
        <ul>
          {#each dashboard.components as use (use.id)}
            {@const name = declared.get(use.id)}
            <li>
              {#if name !== undefined}
                <button
                  class="link"
                  title={t.detail.showComponent(name)}
                  onclick={() => app.showComponent(use.id)}>{use.id}</button
                >
              {:else}
                <span class="code">{use.id}</span>
              {/if}
              <span class="days">{t.dashboard.adrCount(use.adrs.length)}</span>
            </li>
          {/each}
        </ul>
      {/if}
      {#if dashboard.acceptedWithoutComponent > 0 && declared.size > 0}
        <p class="quiet">{t.dashboard.withoutComponent(dashboard.acceptedWithoutComponent)}</p>
      {/if}
    </section>
  </div>
</div>

<style>
  .dashboard {
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
    justify-content: space-between;
    flex: none;
    padding: 6px 14px;
    border-bottom: 1px solid var(--line);
  }

  h2 {
    font-size: 13px;
    font-weight: 600;
  }

  .tools {
    display: flex;
    gap: 8px;
  }

  .head button {
    padding: 3px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .head button:hover {
    background: var(--hover);
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
    align-content: start;
    gap: 12px;
    padding: 14px;
  }

  section {
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--paper);
    min-width: 0;
  }

  section.wide {
    grid-column: 1 / -1;
  }

  h3 {
    margin-bottom: 10px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .faint,
  .quiet,
  .days {
    color: var(--ink-faint);
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }

  .share {
    display: flex;
    gap: 2px;
    height: 10px;
    margin-bottom: 12px;
    border-radius: 5px;
    overflow: hidden;
  }

  .part {
    flex-basis: 0;
  }

  .part.proposed {
    background: var(--proposed);
  }
  .tile.proposed .figure {
    color: var(--proposed);
  }
  .part.accepted {
    background: var(--accepted);
  }
  .tile.accepted .figure {
    color: var(--accepted);
  }
  .part.rejected {
    background: var(--rejected);
  }
  .tile.rejected .figure {
    color: var(--rejected);
  }
  .part.deprecated {
    background: var(--deprecated);
  }
  .tile.deprecated .figure {
    color: var(--deprecated);
  }
  .part.superseded {
    background: var(--superseded);
  }
  .tile.superseded .figure {
    color: var(--superseded);
  }
  .part.unknown {
    background: var(--unknown);
  }
  .tile.unknown .figure {
    color: var(--unknown);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
    gap: 8px;
  }

  .tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--panel-raised);
    text-align: left;
  }

  .tile:hover {
    background: var(--hover);
  }

  .figure {
    font-size: 24px;
    font-weight: 600;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }

  .figure.problems {
    color: var(--rejected);
  }

  .label {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--ink-soft);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 3px 0;
  }

  li :global(svg) {
    flex: none;
    align-self: center;
  }

  .days {
    margin-left: auto;
    flex: none;
    font-size: 12px;
  }

  .link {
    min-width: 0;
    padding: 0;
    background: none;
    color: var(--ink);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .link:hover {
    color: var(--focus);
    text-decoration: underline;
  }

  .prefix,
  .code {
    color: var(--ink-soft);
    font-family: var(--code);
    font-size: 12px;
  }

  p + p,
  p + button,
  ul + p {
    margin-top: 6px;
  }
</style>
