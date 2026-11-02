<script lang="ts">
  import { hasRepair } from '@adr-tool/structure/model'
  import { wordStructureProblem } from '../lib/said'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { codeSpans } from '../lib/wording'

  // What the analysis of the repository in front found: where its Components come from,
  // how much code there is, what could not be resolved or parsed, and what is wrong with
  // the declaration.
  const structure = $derived(app.active?.structure)
  const view = $derived(structure?.view)
  const selection = $derived(structure?.selection)
</script>

{#snippet withCode(text: string)}
  {#each codeSpans(text) as part, position (position)}{#if part.code}<code>{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

<nav aria-label={t.structure.label}>
  {#if view}
    <section>
      <h2>{t.structure.components}</h2>
      {#if view.origin === 'declared'}
        <p class="about">{@render withCode(t.structure.declared)}</p>
      {:else}
        <p class="about draft">{t.structure.draft}</p>
        {#if view.canAdopt}
          <button class="adopt" title={t.structure.adoptHint} onclick={() => app.adopt()}>
            {t.structure.adopt}
          </button>
        {/if}
      {/if}
    </section>

    <section>
      <h2>{t.structure.code}</h2>
      <p class="facts">
        {t.structure.sourceFiles(view.sourceFiles)}, {t.structure.testFiles(view.testFiles)}<br />
        {t.structure.dependencies(view.dependencies)}<br />
        {t.structure.libraries(view.libraries)}<br />
        <span class="faint">{t.structure.analysedIn(view.milliseconds)}</span>
      </p>
      {#if view.javaFiles > 0}
        <p class="about faint">{t.structure.javaLowerBound}</p>
      {/if}
      <label class="toggle">
        <input
          type="checkbox"
          checked={view.tests}
          onchange={(event) => app.includeTests(event.currentTarget.checked)}
        />
        {t.structure.includeTests}
      </label>
      <button
        class="row"
        class:current={selection?.kind === 'not-resolved'}
        aria-pressed={selection?.kind === 'not-resolved'}
        onclick={() => app.selectInStructure({ kind: 'not-resolved' })}
      >
        <span class="label">{t.structure.notResolved}</span>
        <span class="count">{view.notResolvedCount}</span>
      </button>
      <button
        class="row"
        class:current={selection?.kind === 'not-analysed'}
        aria-pressed={selection?.kind === 'not-analysed'}
        onclick={() => app.selectInStructure({ kind: 'not-analysed' })}
      >
        <span class="label">{t.structure.notAnalysed}</span>
        <span class="count">{view.notAnalysed.length}</span>
      </button>
    </section>

    {#if view.problems.length > 0 || view.hints.length > 0}
      <section>
        <h2>{view.origin === 'declared' ? t.structure.problems : t.structure.hints}</h2>
        <ul class="findings">
          {#each [...view.problems, ...view.hints] as problem, position (position)}
            <li class:problem={view.origin === 'declared'}>
              <span>{@render withCode(wordStructureProblem(problem))}</span>
              {#if view.origin === 'declared' && hasRepair(problem)}
                <button onclick={() => app.repairStructure(problem)}>{t.structure.repair}</button>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}
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

  .about,
  .facts {
    margin-bottom: 6px;
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

  .adopt {
    margin: 8px 14px 0;
    padding: 4px 12px;
    border-radius: 4px;
    background: var(--ink);
    color: var(--paper);
    font-weight: 500;
  }

  .adopt:hover {
    background: var(--focus);
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px 4px;
    color: var(--ink-soft);
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
  }

  .count {
    color: var(--ink-faint);
  }

  .findings {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 14px;
    list-style: none;
    color: var(--ink-soft);
    line-height: 1.45;
  }

  .findings li.problem {
    color: var(--ink);
  }

  .findings button {
    display: block;
    margin-top: 4px;
    padding: 2px 10px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .findings button:hover {
    background: var(--hover);
  }
</style>
