<script lang="ts">
  import { nextPrefix, type Adr, type Problem } from '@adr-tool/core'
  import { adrsOf } from '../lib/problems'
  import { app, statusKey } from '../lib/state.svelte'
  import { CONSEQUENCES_LEAD, describeProblem, prefixOf } from '../lib/wording'
  import StatusMark from './StatusMark.svelte'

  const selectedId = $derived(app.selected?.id)

  /** The ADRs a Problem is reported on, as far as they are (still) in the log. */
  function subjects(problem: Problem): Adr[] {
    return adrsOf(problem).flatMap((id) => app.log?.adrs.find((adr) => adr.id === id) ?? [])
  }
</script>

{#snippet subject(adr: Adr)}
  <button class="adr" class:selected={adr.id === selectedId} onclick={() => app.select(adr.id)}>
    <StatusMark status={statusKey(adr)} />
    <span class="prefix">{prefixOf(adr)}</span>
    <span class="title">{adr.title ?? adr.id}</span>
  </button>
{/snippet}

<div class="list">
  <div class="head">
    <h2>Problems</h2>
    <button onclick={() => app.show('adrs')}>Back to the ADRs</button>
  </div>

  {#if app.problemGroups.length === 0}
    <p class="empty">No Problems in this Decision Log.</p>
  {:else}
    <ul class="groups" aria-label="Problems">
      {#each app.problemGroups as { problem, consequences }, position (position)}
        <li class="group">
          {#each subjects(problem) as adr (adr.id)}
            <div class="subject">
              {@render subject(adr)}
              {#if problem.kind === 'duplicate-number' && app.log && app.editing?.adrId !== adr.id}
                <!-- Which of them moves is the person's choice. -->
                <button class="repair" onclick={() => app.renumber(adr.id)}>
                  Renumber to {nextPrefix(app.log, '')}
                </button>
              {/if}
            </div>
          {/each}
          <p class="what">{describeProblem(problem)}</p>

          {#if consequences.length > 0}
            <div class="consequences">
              <p>{CONSEQUENCES_LEAD}</p>
              <ul>
                {#each consequences as consequence, index (index)}
                  <li>
                    <!-- What is reported on the unreadable ADR itself needs no second heading. -->
                    {#each subjects(consequence) as adr (adr.id)}
                      {#if !adrsOf(problem).includes(adr.id)}{@render subject(adr)}{/if}
                    {/each}
                    <span class="what">{describeProblem(consequence)}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
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
    flex: none;
    padding: 6px 14px;
    border-bottom: 1px solid var(--line);
  }

  h2 {
    font-size: 13px;
    font-weight: 600;
  }

  .head button,
  .repair {
    padding: 3px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .head button:hover,
  .repair:hover {
    background: var(--hover);
  }

  ul {
    list-style: none;
    padding: 0;
  }

  .groups {
    flex: 1;
    overflow-y: auto;
    user-select: text;
    cursor: auto;
  }

  .group {
    padding: 10px 14px 12px 11px;
    border-left: 3px solid var(--problem);
    border-bottom: 1px solid var(--line);
  }

  .subject {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
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

  .prefix {
    flex: none;
    color: var(--ink-soft);
    font-weight: 400;
  }

  .title {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .repair {
    flex: none;
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

  .empty {
    padding: 18px 14px;
    color: var(--ink-soft);
  }
</style>
