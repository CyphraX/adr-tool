<script lang="ts">
  import { CONFIG_PATH } from '@adr-tool/kernel'
  import type { DiagramsSection } from '../lib/diagrams-problems'
  import { wordConfigProblem, wordDiagramProblem } from '../lib/diagram-words'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { codeSpans } from '../lib/wording'

  // The Diagrams' part of the Problems of the repository: the one Problem of `.arch/config.yml`,
  // which is every module's, then each Problem of a Diagram — a click opens the Diagram, and a
  // Repair is previewed.
  let { section }: { section: DiagramsSection } = $props()

  const tab = $derived(app.active)
  const open = $derived(
    tab?.module === 'diagrams' && !tab.diagrams.problems ? tab.diagrams.path : undefined
  )
  const count = $derived(section.state === 'known' ? section.entries.length : 0)
</script>

{#snippet withCode(text: string)}
  {#each codeSpans(text) as part, position (position)}{#if part.code}<code>{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

{#if section.state === 'known' && section.config}
  <section aria-label={t.diagrams.settings}>
    <h3>{t.diagrams.settings} <span class="count some">1</span></h3>
    <ul>
      <li class="group">
        <p class="whole"><code>{CONFIG_PATH}</code></p>
        <p class="what">{@render withCode(wordConfigProblem(section.config))}</p>
        <p class="by-hand">{t.diagrams.byHand}</p>
      </li>
    </ul>
  </section>
{/if}

<section aria-label={t.modules.diagrams}>
  <h3>{t.modules.diagrams} <span class="count" class:some={count > 0}>{count}</span></h3>
  {#if section.state === 'reading'}
    <p class="empty" role="status">{t.diagrams.analysing}</p>
  {:else if section.state === 'failed'}
    <p class="empty">{t.diagrams.failed(section.reason)}</p>
  {:else}
    {#if section.entries.length === 0}
      <p class="empty">{t.repositoryProblems.noneHere}</p>
    {/if}
    <ul>
      {#each section.entries as { problem, diagram, repairable }, position (position)}
        <li class="group">
          <div class="subject">
            {#if diagram}
              <button
                class="artefact"
                class:selected={open === diagram.path}
                onclick={() => app.diagrams.reveal(diagram.path, undefined, true)}
              >
                <span class="kind">{t.diagrams.diagramKind}</span>
                <span>{diagram.title ?? diagram.id}</span>
              </button>
            {:else}
              <span class="artefact"><code>{CONFIG_PATH}</code></span>
            {/if}
          </div>
          <p class="what">{@render withCode(wordDiagramProblem(problem))}</p>
          {#if repairable}
            <button class="repair" onclick={() => void app.diagrams.repair(problem)}>
              {t.diagrams.repair}
            </button>
          {:else}
            <p class="by-hand">{t.diagrams.byHand}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 14px 6px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  ul {
    list-style: none;
    padding: 0;
  }

  .group {
    padding: 10px 14px 12px 11px;
    border-left: 3px solid var(--problem);
    border-bottom: 1px solid var(--line);
    background: var(--paper);
  }

  .subject {
    display: flex;
    align-items: center;
    min-height: 26px;
  }

  .artefact {
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

  button.artefact:hover {
    background: var(--hover);
  }

  .artefact.selected {
    background: var(--selected);
  }

  .kind {
    flex: none;
    font-size: 12px;
    font-weight: 400;
    color: var(--ink-faint);
  }

  .whole {
    font-weight: 500;
  }

  .what {
    margin-top: 2px;
    color: var(--ink-soft);
    line-height: 1.5;
  }

  code {
    font-family: var(--code);
    font-size: 0.92em;
  }

  .repair {
    margin-top: 8px;
    padding: 3px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .repair:hover {
    background: var(--hover);
  }

  .by-hand {
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--ink-faint);
  }

  .empty {
    padding: 2px 14px 6px;
    color: var(--ink-soft);
    line-height: 1.5;
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
