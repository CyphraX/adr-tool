<script lang="ts">
  import type { StructureEdge, StructureNode, StructureView } from '../../../shared/ipc'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'

  // What the selection in the Structure view stands for: a node with its Dependencies, a
  // line with the Source File Dependencies behind it, a Cycle with its example round trip,
  // or one of the lists of what the analysis could not do.
  let { view }: { view: StructureView } = $props()

  const selection = $derived(app.active?.structure.selection)
  const nodeOf = $derived(new Map(view.nodes.map((node) => [node.id, node])))

  function labelOf(id: string): string {
    const node = nodeOf.get(id)
    if (!node) return id
    switch (node.kind) {
      case 'own-files':
        return t.structure.graph.ownFiles(node.name)
      case 'unassigned':
        return t.structure.graph.unassigned
      default:
        return node.name
    }
  }

  const selectEdge = (edge: { from: string; to: string }): void =>
    app.selectInStructure({ kind: 'edge', from: edge.from, to: edge.to })
</script>

{#snippet edgeButton(edge: StructureEdge, end: 'from' | 'to')}
  <li>
    <button class="link" onclick={() => selectEdge(edge)}>{labelOf(edge[end])}</button>
    <span class="faint">{t.structure.graph.weight(edge.weight)}</span>
    {#if edge.typeOnly}<span class="tag">{t.structure.detail.typeOnly}</span>{/if}
  </li>
{/snippet}

{#snippet nodeDetail(node: StructureNode)}
  {@const out = view.edges.filter((edge) => edge.from === node.id)}
  {@const into = view.edges.filter((edge) => edge.to === node.id)}
  <h2>{labelOf(node.id)}</h2>
  {#if node.kind === 'source-file'}
    <p class="path">{node.id}</p>
  {:else}
    <p class="faint">{t.structure.graph.files(node.files)}</p>
  {/if}
  {#if node.kind === 'component'}
    <button class="action" onclick={() => app.openComponent(node.id)}>
      {t.structure.detail.showParts}
    </button>
  {/if}
  <h3>{t.structure.detail.dependsOn}</h3>
  {#if out.length === 0}
    <p class="faint">{t.structure.detail.nothing}</p>
  {:else}
    <ul class="edges">
      {#each out as edge (edge.to)}{@render edgeButton(edge, 'to')}{/each}
    </ul>
  {/if}
  <h3>{t.structure.detail.usedBy}</h3>
  {#if into.length === 0}
    <p class="faint">{t.structure.detail.nothing}</p>
  {:else}
    <ul class="edges">
      {#each into as edge (edge.from)}{@render edgeButton(edge, 'from')}{/each}
    </ul>
  {/if}
{/snippet}

{#snippet cycleList()}
  <h2>{t.structure.detail.cycles}</h2>
  {#if view.cycles.length === 0}
    <p class="faint">{t.structure.detail.noCycles}</p>
  {:else}
    <ul class="cycles">
      {#each view.cycles as cycle, index (cycle.members.join('\n'))}
        <li>
          <button class="link" onclick={() => app.selectInStructure({ kind: 'cycle', index })}>
            {t.structure.detail.cycle(cycle.members.length)}
          </button>
          <span class="faint">{cycle.members.map(labelOf).join(', ')}</span>
        </li>
      {/each}
    </ul>
  {/if}
  <p class="hint">{t.structure.detail.hint}</p>
{/snippet}

<aside aria-label={t.structure.detail.label}>
  {#if selection?.kind === 'node' && nodeOf.get(selection.id)}
    {@render nodeDetail(nodeOf.get(selection.id)!)}
  {:else if selection?.kind === 'edge'}
    {@const edge = view.edges.find(
      (candidate) => candidate.from === selection.from && candidate.to === selection.to
    )}
    {#if edge}
      <h2>
        <button class="link" onclick={() => app.selectInStructure({ kind: 'node', id: edge.from })}
          >{labelOf(edge.from)}</button
        >
        <span aria-hidden="true">→</span>
        <button class="link" onclick={() => app.selectInStructure({ kind: 'node', id: edge.to })}
          >{labelOf(edge.to)}</button
        >
      </h2>
      <p class="faint">{t.structure.graph.weight(edge.weight)}</p>
      <ul class="dependencies">
        {#each edge.dependencies as dependency (`${dependency.from}\n${dependency.to}`)}
          <li>
            <span class="path">{dependency.from}</span>
            <span class="faint">{t.structure.detail.lines(dependency.lines)}</span>
            {#if dependency.typeOnly}<span class="tag">{t.structure.detail.typeOnly}</span>{/if}
            <span class="path to"
              ><span class="arrow" aria-hidden="true">→</span>{dependency.to}</span
            >
          </li>
        {/each}
      </ul>
    {/if}
  {:else if selection?.kind === 'cycle' && view.cycles[selection.index]}
    {@const cycle = view.cycles[selection.index]!}
    <h2>{t.structure.detail.cycle(cycle.members.length)}</h2>
    {#if cycle.typeOnly}<p class="faint">{t.structure.detail.typeOnlyCycle}</p>{/if}
    <h3>{t.structure.detail.roundTrip}</h3>
    <p class="trip">
      {#each [...cycle.roundTrip, cycle.roundTrip[0]!] as member, position (position)}
        {#if position > 0}<span class="arrow" aria-hidden="true">→</span>{/if}
        <button class="link" onclick={() => app.selectInStructure({ kind: 'node', id: member })}
          >{labelOf(member)}</button
        >
      {/each}
    </p>
    {#if cycle.weakest}
      {@const weakest = cycle.weakest}
      <h3>{t.structure.detail.weakest}</h3>
      <p>
        <button class="link" onclick={() => selectEdge(weakest)}>
          {labelOf(weakest.from)} → {labelOf(weakest.to)}
        </button>
      </p>
    {/if}
  {:else if selection?.kind === 'not-resolved'}
    <h2>{t.structure.detail.notResolved}</h2>
    <p class="hint">{t.structure.detail.notResolvedHint}</p>
    {#if view.notResolved.length === 0}
      <p class="faint">{t.structure.detail.none}</p>
    {:else}
      {#if view.notResolved.length < view.notResolvedCount}
        <p class="faint">
          {t.structure.detail.firstOf(view.notResolved.length, view.notResolvedCount)}
        </p>
      {/if}
      <ul class="dependencies">
        {#each view.notResolved as use, position (position)}
          <li>
            <span class="path">{use.file}</span>
            <span class="faint">{t.structure.detail.lines([use.line])}</span>
            <code>{use.specifier}</code>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if selection?.kind === 'not-analysed'}
    <h2>{t.structure.detail.notAnalysed}</h2>
    <p class="hint">{t.structure.detail.notAnalysedHint}</p>
    {#if view.notAnalysed.length === 0}
      <p class="faint">{t.structure.detail.none}</p>
    {:else}
      <ul class="dependencies">
        {#each view.notAnalysed as file (file.file)}
          <li>
            <span class="path">{file.file}</span>
            {#if file.line === undefined}
              <span class="faint">{t.structure.detail.unreadable}</span>
            {:else}
              <span class="faint">{t.structure.detail.lines([file.line])}</span>
              <span>{file.message}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    {@render cycleList()}
  {/if}
</aside>

<style>
  aside {
    overflow-y: auto;
    padding: 14px 18px 24px;
    background: var(--paper);
    line-height: 1.5;
  }

  h2 {
    margin-bottom: 4px;
    font-size: 15px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  h3 {
    margin: 16px 0 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0;
    list-style: none;
  }

  .faint {
    color: var(--ink-faint);
  }

  .hint {
    margin-top: 12px;
    color: var(--ink-soft);
  }

  .link {
    color: var(--focus);
    text-align: left;
  }

  .link:hover {
    text-decoration: underline;
  }

  .action {
    margin-top: 8px;
    padding: 3px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--panel-raised);
  }

  .action:hover {
    background: var(--hover);
  }

  .edges li,
  .cycles li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
  }

  .dependencies li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--line);
  }

  .path,
  code {
    font-family: var(--code);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .path.to {
    flex-basis: 100%;
    color: var(--ink-soft);
  }

  .arrow {
    margin: 0 4px 0 0;
  }

  .trip .arrow {
    margin: 0 6px;
  }

  .tag {
    padding: 0 6px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    color: var(--ink-soft);
    font-size: 11px;
  }

  .trip {
    line-height: 1.8;
  }
</style>
