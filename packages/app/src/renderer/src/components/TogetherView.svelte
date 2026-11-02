<script lang="ts">
  import { app, statusKey } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { everyAdr, problemsAcross, type Placed } from '../lib/together'
  import {
    STATUS_LABEL,
    STATUS_WIDTH,
    describeConsequences,
    describeProblem,
    logName,
    prefixOf
  } from '../lib/wording'
  import StatusMark from './StatusMark.svelte'

  // Every repository open in the window, seen together (docs/plan-roadmap.md, part 13). A click
  // brings the repository of the ADR to the front and opens the ADR there; the view stays this.

  const show = $derived(app.active?.view === 'all-problems' ? 'problems' : 'adrs')
  const repositories = $derived(app.tabs.map((tab) => tab.repository))
  const adrs = $derived(everyAdr(repositories))
  const problems = $derived(problemsAcross(repositories))
  const problemCount = $derived(problems.reduce((sum, one) => sum + one.count, 0))
  // The log is named beside an ADR only where its repository has more than one.
  const severalLogs = $derived(
    new Set(
      repositories
        .filter((repository) => repository.repository.logs.length > 1)
        .map((repository) => repository.id)
    )
  )

  const isOpen = (one: Placed): boolean =>
    one.repositoryId === app.activeId &&
    one.log === app.log?.path &&
    one.adr.id === app.active?.selectedId
  const open = (one: Placed): void => app.jumpTo(one.log, one.adr.id, one.repositoryId)
  const current = $derived(adrs.findIndex(isOpen))

  $effect(() => {
    if (current >= 0)
      document.getElementById(`across-${current}`)?.scrollIntoView({ block: 'nearest' })
  })

  function onkeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (step === 0 || adrs.length === 0) return
    event.preventDefault()
    const next = adrs[Math.max(0, Math.min(adrs.length - 1, current + step))]
    if (next) open(next)
  }
</script>

{#snippet subject(one: Placed)}
  <button class="adr" class:selected={isOpen(one)} onclick={() => open(one)}>
    <StatusMark status={statusKey(one.adr)} />
    {#if severalLogs.has(one.repositoryId)}<span class="log">{logName(one.log)}</span>{/if}
    <span class="prefix">{prefixOf(one.adr)}</span>
    <span class="title">{one.adr.title ?? one.adr.id}</span>
  </button>
{/snippet}

<div class="list" style:--status={STATUS_WIDTH}>
  <div class="head">
    <h2>{show === 'adrs' ? t.together.adrs : t.together.problems}</h2>
    <span class="tools">
      <button onclick={() => app.startSearching()}>{t.search}</button>
      <button onclick={() => app.show('adrs')}>{t.backToAdrs}</button>
    </span>
  </div>

  {#if show === 'adrs'}
    <p class="summary">{t.together.count(adrs.length, repositories.length)}</p>
    <div
      class="rows"
      role="listbox"
      tabindex="0"
      aria-label={t.together.adrs}
      aria-activedescendant={current >= 0 ? `across-${current}` : undefined}
      {onkeydown}
    >
      {#each repositories as repository (repository.id)}
        <h3 class="repository">{repository.name}</h3>
        {#each adrs as one, index (index)}
          {#if one.repositoryId === repository.id}
            {@const status = statusKey(one.adr)}
            <!-- The keyboard is handled by the listbox around the rows. -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              id="across-{index}"
              class="row {status}"
              class:selected={index === current}
              role="option"
              tabindex="-1"
              aria-selected={index === current}
              onclick={() => open(one)}
            >
              <span class="prefix">
                {#if severalLogs.has(one.repositoryId)}<span class="log">{logName(one.log)}</span
                  >{/if}{prefixOf(one.adr)}
              </span>
              <span class="text" title={one.adr.title ?? one.adr.id}>
                {one.adr.title ?? one.adr.id}
              </span>
              <span class="status">
                <StatusMark {status} />
                {one.adr.metadata.rawStatus ?? STATUS_LABEL[status]}
              </span>
            </div>
          {/if}
        {/each}
      {/each}
    </div>
  {:else if problemCount === 0}
    <p class="empty">{t.together.noProblems}</p>
  {:else}
    <div class="groups">
      {#each problems as repository (repository.repositoryId)}
        <h3 class="repository">
          {repository.repository}
          <span class="count" class:some={repository.count > 0}>{repository.count}</span>
        </h3>
        {#if repository.count === 0}
          <p class="empty">{t.together.noneHere}</p>
        {/if}
        <ul aria-label={repository.repository}>
          {#each repository.own as problem, position (position)}
            <li class="group">
              <p class="whole">{t.together.repository}</p>
              <p class="what">{describeProblem(problem)}</p>
            </li>
          {/each}
          {#each repository.logs as { log, groups } (log)}
            {#each groups as { problem, subjects, consequences }, position (position)}
              <li class="group">
                {#each subjects as one (`${one.log}/${one.adr.id}`)}
                  <div class="subject">{@render subject(one)}</div>
                {:else}
                  {#if severalLogs.has(repository.repositoryId)}
                    <p class="whole">{logName(log)}</p>
                  {/if}
                {/each}
                <p class="what">{describeProblem(problem)}</p>
                {#if consequences.length > 0}
                  <div class="consequences">
                    <p>{describeConsequences(problem)}</p>
                    <ul>
                      {#each consequences as consequence, nth (nth)}
                        <li>
                          {#each consequence.subjects.filter((one) => !subjects.some((own) => own.adr.id === one.adr.id && own.log === one.log)) as one (`${one.log}/${one.adr.id}`)}
                            {@render subject(one)}
                          {/each}
                          <span class="what">{describeProblem(consequence.problem)}</span>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </li>
            {/each}
          {/each}
        </ul>
      {/each}
    </div>
  {/if}
</div>

<style>
  .list {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--panel-raised);
    border-right: 1px solid var(--line);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex: none;
    padding: 6px 14px;
    border-bottom: 1px solid var(--line);
  }

  h2 {
    min-width: 0;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .tools {
    display: flex;
    flex: none;
    gap: 8px;
  }

  .tools button {
    padding: 3px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .tools button:hover {
    background: var(--hover);
  }

  .summary {
    flex: none;
    padding: 6px 14px;
    font-size: 12px;
    color: var(--ink-faint);
    border-bottom: 1px solid var(--line);
  }

  .rows,
  .groups {
    flex: 1;
    overflow-y: auto;
  }

  .groups {
    user-select: text;
    cursor: auto;
  }

  .repository {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  .row {
    display: grid;
    grid-template-columns: minmax(5.5ch, max-content) minmax(0, 1fr) var(--status);
    column-gap: 12px;
    align-items: center;
    height: 30px;
    padding: 0 14px;
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

  .log {
    margin-right: 6px;
    font-size: 12px;
    color: var(--ink-faint);
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

  .row.superseded .text,
  .row.deprecated .text {
    color: var(--ink-faint);
  }

  .row.superseded .text {
    text-decoration: line-through;
    text-decoration-color: var(--line-strong);
  }

  ul {
    list-style: none;
    padding: 0;
  }

  .group {
    padding: 10px 14px 12px 11px;
    border-left: 3px solid var(--problem);
    border-bottom: 1px solid var(--line);
  }

  .subject {
    display: flex;
    align-items: center;
    min-height: 26px;
  }

  .adr {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 2px 6px;
    margin-left: -6px;
    border-radius: 3px;
    font-weight: 500;
    text-align: left;
  }

  .adr:hover {
    background: var(--hover);
  }

  .adr.selected {
    background: var(--selected);
  }

  .adr :global(svg) {
    flex: none;
  }

  .adr .log {
    margin-right: 0;
  }

  .adr .title {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .whole {
    font-weight: 500;
  }

  .what {
    color: var(--ink-soft);
    line-height: 1.5;
  }

  .group > .what {
    margin-top: 2px;
  }

  .consequences {
    margin-top: 10px;
    padding: 8px 10px;
    border-radius: 4px;
    background: var(--panel);
  }

  .consequences > p {
    color: var(--ink-soft);
    line-height: 1.5;
  }

  .consequences li {
    margin-top: 8px;
  }

  .consequences .adr {
    font-weight: 400;
  }

  .consequences .what {
    display: block;
    font-size: 12px;
  }

  .count {
    font-weight: 400;
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

  .empty {
    padding: 8px 14px 12px;
    color: var(--ink-soft);
  }
</style>
