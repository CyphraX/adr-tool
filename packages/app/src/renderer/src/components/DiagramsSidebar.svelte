<script lang="ts">
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { codeSpans } from '../lib/wording'

  // What there is: the Problems of the repository, and its Diagrams, each with how far it and
  // the code differ — its Drift, a red badge.
  const tab = $derived(app.active)
  const diagrams = $derived(tab?.diagrams)
  const overview = $derived(diagrams?.overview)
  const problems = $derived(app.repositoryProblems)

  /** The Drift of a Diagram: of what the canvas holds for the one on it, else of its file. */
  function driftOf(path: string): number | undefined {
    if (diagrams?.path === path && diagrams.current) return diagrams.current.drift.length
    return overview?.diagrams.find((entry) => entry.path === path)?.drift?.length
  }
</script>

{#snippet withCode(text: string)}
  {#each codeSpans(text) as part, position (position)}{#if part.code}<code>{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

<nav aria-label={t.diagrams.label}>
  <section>
    <h2>{t.repositoryProblems.check}</h2>
    <button
      class="row"
      class:current={diagrams?.problems}
      aria-pressed={diagrams?.problems}
      title={t.repositoryProblems.entryHint}
      onclick={() => app.showRepositoryProblems()}
    >
      <span class="label">{t.repositoryProblems.entry}</span>
      <span class="count" class:some={(problems?.count ?? 0) > 0}>{problems?.count ?? 0}</span>
    </button>
  </section>

  <section>
    <h2>{t.diagrams.heading}</h2>
    {#if overview}
      <ul aria-label={t.diagrams.heading}>
        {#each overview.diagrams as entry (entry.path)}
          {@const drift = driftOf(entry.path)}
          <li>
            <button
              class="row"
              class:current={!diagrams?.problems && diagrams?.path === entry.path}
              aria-current={!diagrams?.problems && diagrams?.path === entry.path
                ? 'page'
                : undefined}
              title={entry.path}
              onclick={() => app.diagrams.show(entry.path)}
            >
              <span class="label">
                {entry.title ?? entry.id}
                {#if !entry.readable}<span class="faint">· {t.diagrams.unreadable}</span>{/if}
                {#if diagrams?.path === entry.path && diagrams.unsaved > 0}<span
                    class="unsaved"
                    title={t.diagrams.unsaved(diagrams.unsaved)}>●</span
                  >{/if}
              </span>
              {#if drift !== undefined}
                <span class="count" class:some={drift > 0} title={t.diagrams.driftCount(drift)}>
                  {drift}
                </span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
      {#if overview.directory !== undefined}
        <p class="about">{@render withCode(t.diagrams.where(overview.directory))}</p>
      {:else if overview.config}
        <p class="about">{@render withCode(t.diagrams.notLookedFor)}</p>
      {/if}
      {#if overview.declared.origin === 'draft'}
        <p class="about draft">{t.diagrams.draft}</p>
      {/if}
      {#if diagrams?.reading && diagrams.opened && !overview.analysed}
        <p class="about faint" role="status">{t.diagrams.analysing}</p>
      {/if}
      {#if overview.directory !== undefined}
        <button class="new" onclick={() => app.diagrams.startNew()}>
          {t.diagrams.newDiagram}
        </button>
      {/if}
    {:else if diagrams?.failed}
      <p class="about">{t.diagrams.failed(diagrams.failed)}</p>
    {:else}
      <p class="about faint" role="status">{t.diagrams.analysing}</p>
    {/if}
  </section>
</nav>

<style>
  nav {
    display: flex;
    flex-direction: column;
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

  ul {
    padding: 0;
    list-style: none;
  }

  .about {
    margin: 6px 0;
    padding: 0 14px;
    color: var(--ink-soft);
    line-height: 1.5;
  }

  .about.draft {
    color: var(--proposed);
  }

  .faint,
  .about.faint {
    color: var(--ink-faint);
  }

  code {
    font-family: var(--code);
    font-size: 0.92em;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 26px;
    padding: 3px 14px;
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
    overflow-wrap: anywhere;
  }

  .unsaved {
    margin-left: 4px;
    color: var(--proposed);
    font-size: 9px;
  }

  .count {
    flex: none;
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

  .new {
    margin: 6px 14px 0;
    padding: 3px 12px;
    align-self: flex-start;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .new:hover {
    background: var(--hover);
  }
</style>
