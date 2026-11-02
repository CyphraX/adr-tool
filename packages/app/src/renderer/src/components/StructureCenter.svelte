<script lang="ts">
  import type { StructureView } from '../../../shared/ipc'
  import { app, type StructureShow } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import StructureGraph from './StructureGraph.svelte'
  import StructureMatrix from './StructureMatrix.svelte'
  import StructureMetrics from './StructureMetrics.svelte'

  // The middle of the Structure view: where you are in the hierarchy, and the level as a
  // drawing, as a matrix or as a table of its metrics — three views of one model, which
  // share the filter and the selection.
  let { view }: { view: StructureView } = $props()

  const show = $derived(app.active?.structure.show ?? 'graph')
  const views: StructureShow[] = ['graph', 'matrix', 'metrics']
</script>

<div class="center">
  <div class="head">
    <nav class="way" aria-label={t.structure.graph.way}>
      {#if view.path.length === 0}
        <span class="here">{t.structure.graph.top}</span>
      {:else}
        <button onclick={() => app.openComponent(undefined)}>{t.structure.graph.top}</button>
        {#each view.path as step, position (step.id)}
          <span class="between" aria-hidden="true">›</span>
          {#if position === view.path.length - 1}
            <span class="here">{step.name}</span>
          {:else}
            <button onclick={() => app.openComponent(step.id)}>{step.name}</button>
          {/if}
        {/each}
      {/if}
    </nav>
    {#if view.origin === 'draft'}
      <span class="badge">{t.structure.graph.draft}</span>
    {/if}
    <div class="switch" role="group" aria-label={t.structure.views.label}>
      {#each views as candidate (candidate)}
        <button
          class:current={show === candidate}
          aria-pressed={show === candidate}
          onclick={() => app.showInStructure(candidate)}
        >
          {t.structure.views[candidate]}
        </button>
      {/each}
    </div>
  </div>

  {#if show === 'matrix'}
    <StructureMatrix {view} />
  {:else if show === 'metrics'}
    <StructureMetrics {view} />
  {:else}
    <StructureGraph {view} />
  {/if}
</div>

<style>
  .center {
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
    gap: 10px;
    flex: none;
    min-height: 37px;
    padding: 6px 14px;
    border-bottom: 1px solid var(--line);
  }

  .way {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 6px;
    min-width: 0;
  }

  .way button {
    color: var(--focus);
  }

  .way button:hover {
    text-decoration: underline;
  }

  .here {
    font-weight: 600;
  }

  .between {
    color: var(--ink-faint);
  }

  .badge {
    padding: 1px 8px;
    border: 1px solid var(--proposed);
    border-radius: 9px;
    color: var(--proposed);
    font-size: 11.5px;
    font-weight: 600;
  }

  .switch {
    display: flex;
    flex: none;
    margin-left: auto;
    border: 1px solid var(--line-strong);
    border-radius: 5px;
    overflow: hidden;
  }

  .switch button {
    padding: 2px 10px;
    font-size: 12px;
  }

  .switch button + button {
    border-left: 1px solid var(--line-strong);
  }

  .switch button:hover {
    background: var(--hover);
  }

  .switch button.current {
    background: var(--selected);
    font-weight: 600;
  }
</style>
