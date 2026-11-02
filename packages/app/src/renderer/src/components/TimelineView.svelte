<script lang="ts">
  import type { DecisionLog } from '@adr-tool/core'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { dateOf, dayOf, localToday, positionOn, timelineOf } from '../lib/views'
  import { prefixOf } from '../lib/wording'
  import StatusMark from './StatusMark.svelte'

  // The ADRs of the Decision Log in view along the time they were written and decided
  // (docs/plan-roadmap.md, part 11): one row each, the earliest on top. The rows are buttons;
  // the axis and the bars are drawn behind them.
  let { log }: { log: DecisionLog } = $props()

  // Today, as long as the view is open: past midnight it is another day.
  let today = $state(localToday())
  $effect(() => {
    const timer = setInterval(() => (today = localToday()), 60_000)
    return () => clearInterval(timer)
  })
  const timeline = $derived(timelineOf(log.adrs, today))
  const selectedId = $derived(app.selected?.id)
  const percent = (day: number): string => `${(positionOn(timeline, day) * 100).toFixed(3)}%`
  const now = $derived(dayOf(today)!)
  // The line of today, where today is on the axis: a log decided long ago ends before it.
  const showsToday = $derived(now >= timeline.from && now < timeline.to)

  $effect(() => {
    if (selectedId)
      document.getElementById(`when-${selectedId}`)?.scrollIntoView({ block: 'nearest' })
  })
</script>

<div class="timeline">
  <div class="head">
    <h2>{t.sidebar.timeline}</h2>
    <span class="tools">
      <button onclick={() => app.startSearching()}>{t.search}</button>
      <button onclick={() => app.show('adrs')}>{t.backToAdrs}</button>
    </span>
  </div>
  <p class="lead">{t.timeline.lead}</p>

  {#if timeline.rows.length === 0}
    <p class="empty">{t.timeline.empty}</p>
  {:else}
    <div class="scroll">
      <div class="axis" aria-hidden="true">
        <span></span>
        <span class="track">
          {#each timeline.ticks as tick, position (tick)}
            {@const date = dateOf(tick)}
            <span class="tick" style:left={percent(tick)}>
              {t.timeline.month(date, position === 0 || date.endsWith('-01-01'))}
            </span>
          {/each}
        </span>
      </div>
      <ol aria-label={t.timeline.label}>
        {#each timeline.rows as row (row.adr.id)}
          {@const created = row.adr.metadata.created}
          {@const decided = row.adr.metadata.decided}
          <li>
            <button
              id="when-{row.adr.id}"
              class="row {row.status}"
              class:selected={row.adr.id === selectedId}
              aria-current={row.adr.id === selectedId}
              title={t.timeline.span(created, decided, row.waiting)}
              onclick={() => app.select(row.adr.id)}
            >
              <span class="name">
                <StatusMark status={row.status} />
                <span class="prefix">{prefixOf(row.adr)}</span>
                <span class="title">{row.adr.title ?? row.adr.id}</span>
              </span>
              <span class="track">
                {#each timeline.ticks as tick (tick)}
                  <span class="line" style:left={percent(tick)}></span>
                {/each}
                {#if showsToday}<span class="today" style:left={percent(now)}></span>{/if}
                <span
                  class="bar"
                  class:waiting={row.waiting}
                  style:left={percent(row.start)}
                  style:width="calc({percent(row.end)} - {percent(row.start)})"
                ></span>
              </span>
            </button>
          </li>
        {/each}
      </ol>
    </div>
  {/if}
  {#if timeline.undated.length > 0}
    <div class="undated">
      <p>{t.timeline.undated(timeline.undated.length)}</p>
      {#each timeline.undated as adr (adr.id)}
        <button class="link" onclick={() => app.select(adr.id)}>
          {prefixOf(adr)}
          {adr.title ?? adr.id}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .timeline {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--panel-raised);
    border-right: 1px solid var(--line);
    --names: minmax(12rem, 0.8fr);
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

  .lead,
  .empty {
    flex: none;
    padding: 8px 14px;
    color: var(--ink-soft);
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 14px 16px;
  }

  .axis,
  .row {
    display: grid;
    grid-template-columns: var(--names) minmax(16rem, 2fr);
    gap: 12px;
  }

  .axis {
    position: sticky;
    top: 0;
    z-index: 1;
    height: 26px;
    background: var(--panel-raised);
    border-bottom: 1px solid var(--line);
  }

  .track {
    position: relative;
    display: block;
    /* A label at the right end stays inside, rather than widening the view. */
    overflow: hidden;
  }

  .tick {
    position: absolute;
    bottom: 4px;
    font-size: 11px;
    color: var(--ink-faint);
    white-space: nowrap;
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .row {
    width: 100%;
    align-items: center;
    min-height: 30px;
    padding: 0;
    border-bottom: 1px solid var(--line);
    text-align: left;
    background: none;
  }

  .row:hover {
    background: var(--hover);
  }

  .row.selected {
    background: var(--selected);
  }

  .name {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding-left: 4px;
  }

  .name :global(svg) {
    flex: none;
  }

  .prefix {
    flex: none;
    color: var(--ink-soft);
    font-family: var(--code);
    font-size: 12px;
  }

  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row.superseded .title,
  .row.deprecated .title,
  .row.rejected .title {
    color: var(--ink-faint);
  }

  .row .track {
    align-self: stretch;
  }

  .line,
  .today {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    border-left: 1px solid var(--line);
  }

  .today {
    border-left: 1px dashed var(--focus);
  }

  .bar {
    position: absolute;
    top: 50%;
    height: 10px;
    min-width: 10px;
    margin-top: -5px;
    border-radius: 5px;
    background: var(--unknown, var(--ink-faint));
  }

  .row.proposed .bar {
    background: var(--proposed);
  }
  .row.accepted .bar {
    background: var(--accepted);
  }
  .row.rejected .bar {
    background: var(--rejected);
  }
  .row.deprecated .bar {
    background: var(--deprecated);
  }
  .row.superseded .bar {
    background: var(--superseded);
  }

  /* Still waiting: the bar is open towards today. */
  .row.proposed .bar.waiting {
    background: repeating-linear-gradient(
      -45deg,
      var(--proposed) 0 4px,
      color-mix(in srgb, var(--proposed) 35%, transparent) 4px 8px
    );
  }

  .undated {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    padding: 12px 14px;
    color: var(--ink-soft);
  }

  .link {
    padding: 0;
    background: none;
    color: var(--focus);
    text-decoration: underline;
  }
</style>
