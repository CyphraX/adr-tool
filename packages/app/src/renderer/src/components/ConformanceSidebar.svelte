<script lang="ts">
  import { RULES_PATH } from '@adr-tool/conformance'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { codeSpans } from '../lib/wording'

  // What there is in Conformance: the Problems of the repository, the Rules — each with the
  // count of its Violations that no Exception accepts, red where there are any —, the
  // Exceptions, and what keeps the Rules from being checked.
  const conformance = $derived(app.active?.conformance)
  const view = $derived(conformance?.view)
  const problems = $derived(app.repositoryProblems)
  const counting = $derived(
    problems?.structure.state === 'reading' || problems?.conformance.state === 'reading'
  )
  const open = $derived(view?.violations.filter((violation) => !violation.exception) ?? [])
  const listing = $derived(
    conformance !== undefined && !conformance.problems && conformance.show !== 'exceptions'
  )
  const openOf = (rule: string): number =>
    open.filter((violation) => violation.rule === rule).length
</script>

{#snippet withCode(text: string)}
  {#each codeSpans(text) as part, position (position)}{#if part.code}<code>{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

{#snippet count(value: number, wrong: boolean)}
  <span class="count" class:some={wrong && value > 0}>{value}</span>
{/snippet}

<nav aria-label={t.conformance.label}>
  <section>
    <h2>{t.repositoryProblems.check}</h2>
    <button
      class="row"
      class:current={conformance?.problems}
      aria-pressed={conformance?.problems}
      title={counting ? t.repositoryProblems.counting : t.repositoryProblems.entryHint}
      onclick={() => app.showRepositoryProblems()}
    >
      <span class="label">{t.repositoryProblems.entry}</span>
      <span class="count" class:some={(problems?.count ?? 0) > 0}>
        {problems?.count ?? 0}{counting ? '…' : ''}
      </span>
    </button>
  </section>

  <section>
    <h2>{t.conformance.rules}</h2>
    {#if view}
      {#if view.rules.length > 0}
        <button
          class="row"
          class:current={listing && conformance?.rule === undefined}
          aria-pressed={listing && conformance?.rule === undefined}
          title={t.conformance.allHint}
          onclick={() => app.showRuleViolations(undefined)}
        >
          <span class="label">{t.conformance.all}</span>
          {@render count(open.length, true)}
        </button>
        {#each view.rules as rule (rule.id)}
          <button
            class="row rule"
            class:current={listing && conformance?.rule === rule.id}
            aria-pressed={listing && conformance?.rule === rule.id}
            title={rule.why}
            onclick={() => app.showRuleViolations(rule.id)}
          >
            <code class="label">{rule.id}</code>
            {@render count(openOf(rule.id), true)}
          </button>
        {/each}
      {/if}
      <button
        class="row"
        class:current={conformance?.show === 'exceptions' && !conformance.problems}
        aria-pressed={conformance?.show === 'exceptions' && !conformance.problems}
        title={t.conformance.exceptionsHint}
        onclick={() => app.showInConformance('exceptions')}
      >
        <span class="label">{t.conformance.exceptions}</span>
        {@render count(view.exceptions.length, false)}
      </button>
    {/if}
  </section>

  {#if view}
    <section>
      <h2>{t.conformance.file}</h2>
      {#if !view.present}
        <p class="about">{@render withCode(t.conformance.noFile)}</p>
      {:else}
        <button
          class="row"
          class:current={conformance?.code?.path === RULES_PATH}
          onclick={() => app.openConformanceCode(RULES_PATH)}
        >
          <code class="label">{RULES_PATH}</code>
        </button>
        {#if view.origin === 'draft'}
          <p class="about draft">{t.conformance.draft}</p>
        {:else if !view.evaluated}
          <p class="about">{@render withCode(t.conformance.notEvaluated)}</p>
        {/if}
      {/if}
      {#if conformance?.reading}
        <p class="about faint" role="status">{t.conformance.again}</p>
      {:else if !view.current}
        <p class="about faint">{t.conformance.asOf(view.analysedAt)}</p>
      {/if}
    </section>
  {:else if conformance?.failed !== undefined && !conformance.reading}
    <p class="about">{t.conformance.failed}: {conformance.failed}</p>
  {:else}
    <p class="about faint" role="status">{t.conformance.analysing}</p>
  {/if}
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

  .about {
    margin: 4px 0 6px;
    padding: 0 14px;
    color: var(--ink-soft);
    line-height: 1.5;
  }

  .about.draft {
    color: var(--proposed);
  }

  .faint {
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
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .rule .label {
    padding-left: 10px;
    font-size: 12px;
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
