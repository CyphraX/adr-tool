<script lang="ts">
  import type {
    StructureComponent,
    StructureEdge,
    StructureNeighbour,
    StructureNode,
    StructureView
  } from '../../../shared/ipc'
  import { app } from '../lib/state.svelte'
  import { METRICS, t } from '../lib/strings'
  import { nodeLabel } from '../lib/structure'

  // What the selection in the Structure view stands for: a Component with its page — the
  // declaration, the metrics, the Dependencies at its level, its Cycles — another node with
  // its Dependencies, a line or a cell with the Source File Dependencies behind it, a Cycle
  // with its example round trip, or one of the lists of what the analysis could not do.
  let { view }: { view: StructureView } = $props()

  const selection = $derived(app.active?.structure.selection)
  // The matrix may show other rows than the drawing: what is in front is asked first.
  const inMatrix = $derived(app.active?.structure.show === 'matrix')
  const nodes = $derived<readonly StructureNode[]>(
    inMatrix ? [...view.matrix.rows, ...view.nodes] : [...view.nodes, ...view.matrix.rows]
  )
  const edges = $derived<readonly StructureEdge[]>(
    inMatrix ? [...view.matrix.cells, ...view.edges] : [...view.edges, ...view.matrix.cells]
  )
  const nodeOf = (id: string): StructureNode | undefined => nodes.find((node) => node.id === id)
  const edgeOf = (from: string, to: string): StructureEdge | undefined =>
    edges.find((edge) => edge.from === from && edge.to === to)
  const pageOf = (id: string): StructureComponent | undefined =>
    view.components.find((component) => component.id === id)

  function labelOf(id: string): string {
    const node = nodeOf(id)
    return node ? nodeLabel(node) : (pageOf(id)?.name ?? id)
  }

  const selectEdge = (edge: { from: string; to: string }): void =>
    app.selectInStructure({ kind: 'edge', from: edge.from, to: edge.to })
  const selectNode = (id: string): void => app.selectInStructure({ kind: 'node', id })

  /** The Cycle of the level in view with the same round trip, to select it. */
  const cycleIndex = (roundTrip: readonly { id: string }[]): number =>
    view.cycles.findIndex(
      (cycle) =>
        cycle.roundTrip.length === roundTrip.length &&
        cycle.roundTrip.every((id, position) => id === roundTrip[position]!.id)
    )
</script>

{#snippet edgeButton(edge: StructureEdge, end: 'from' | 'to')}
  <li>
    <button class="link" onclick={() => selectEdge(edge)}>{labelOf(edge[end])}</button>
    <span class="faint">{t.structure.graph.weight(edge.weight)}</span>
    {#if edge.typeOnly}<span class="tag">{t.structure.detail.typeOnly}</span>{/if}
  </li>
{/snippet}

{#snippet dependencyList(list: readonly StructureEdge[], end: 'from' | 'to')}
  {#if list.length === 0}
    <p class="faint">{t.structure.detail.nothing}</p>
  {:else}
    <ul class="edges">
      {#each list as edge (edge[end])}{@render edgeButton(edge, end)}{/each}
    </ul>
  {/if}
{/snippet}

{#snippet nodeDetail(node: StructureNode)}
  <h2>{nodeLabel(node)}</h2>
  {#if node.kind === 'source-file'}
    <p class="path">{node.id}</p>
    <p class="faint">{t.structure.page.size(node.files, node.lines)}</p>
  {:else}
    <p class="faint">{t.structure.page.size(node.files, node.lines)}</p>
  {/if}
  <h3>{t.structure.detail.dependsOn}</h3>
  {@render dependencyList(
    edges.filter((edge) => edge.from === node.id),
    'to'
  )}
  <h3>{t.structure.detail.usedBy}</h3>
  {@render dependencyList(
    edges.filter((edge) => edge.to === node.id),
    'from'
  )}
{/snippet}

{#snippet neighbours(page: StructureComponent, list: readonly StructureNeighbour[], out: boolean)}
  {#if list.length === 0}
    <p class="faint">{t.structure.detail.nothing}</p>
  {:else}
    <ul class="edges">
      {#each list as neighbour (neighbour.id)}
        {@const from = out ? page.id : neighbour.id}
        {@const to = out ? neighbour.id : page.id}
        <li>
          {#if edgeOf(from, to)}
            <button class="link" onclick={() => selectEdge({ from, to })}
              >{nodeLabel(neighbour)}</button
            >
          {:else}
            <span>{nodeLabel(neighbour)}</span>
          {/if}
          <span class="faint">{t.structure.graph.weight(neighbour.weight)}</span>
          {#if neighbour.typeOnly}<span class="tag">{t.structure.detail.typeOnly}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet componentPage(page: StructureComponent)}
  <p class="kind">{t.structure.page.component}</p>
  <h2>{page.name}</h2>
  <p><span class="faint">{t.structure.page.id}</span> <code>{page.id}</code></p>
  {#if page.description}<p class="description">{page.description}</p>{/if}
  {#if page.metrics}
    <p class="faint">
      {t.structure.page.size(page.metrics.files, page.metrics.lines)}{#if page.testFiles > 0}<br
        />{t.structure.page.testFiles(page.testFiles, view.tests)}{/if}
    </p>
    <button class="action" onclick={() => app.openComponent(page.id)}>
      {t.structure.detail.showParts}
    </button>
  {:else}
    <p class="faint">{t.structure.page.empty}</p>
  {/if}

  <h3>{t.structure.page.patterns}</h3>
  <dl class="patterns">
    <dt>{t.structure.page.paths}</dt>
    <dd>
      {#each page.paths as pattern (pattern)}<code>{pattern}</code>{:else}<span class="faint"
          >{t.structure.page.none}</span
        >{/each}
    </dd>
    <dt>{t.structure.page.tests}</dt>
    <dd>
      {#each page.tests as pattern (pattern)}<code>{pattern}</code>{:else}<span class="faint"
          >{t.structure.page.none}</span
        >{/each}
    </dd>
  </dl>

  {#if page.metrics}
    {@const metrics = page.metrics}
    <h3>{t.structure.page.metrics}</h3>
    <dl class="metrics">
      {#each METRICS.slice(2) as key (key)}
        {@const value = key === 'files' || key === 'lines' ? undefined : metrics[key]}
        <dt title={t.structure.metric[key].definition}>{t.structure.metric[key].long}</dt>
        <dd
          title={value === undefined
            ? t.structure.undefinedValue
            : t.structure.metric[key].definition}
        >
          {t.structure.value(key, value)}
        </dd>
      {/each}
    </dl>
    {#if page.java}<p class="faint note">{t.structure.metrics.javaLowerBound}</p>{/if}
  {/if}

  <p class="faint note">{t.structure.page.atItsLevel}</p>
  <h3>{t.structure.detail.dependsOn}</h3>
  {@render neighbours(page, page.dependsOn, true)}
  <h3>{t.structure.detail.usedBy}</h3>
  {@render neighbours(page, page.usedBy, false)}

  <h3>{t.structure.page.cycles}</h3>
  {#if page.cycles.length === 0}
    <p class="faint">{t.structure.page.noCycle}</p>
  {:else}
    <ul class="cycles">
      {#each page.cycles as cycle, position (position)}
        {@const index = page.level === view.parent ? cycleIndex(cycle.roundTrip) : -1}
        {@const trip = [...cycle.roundTrip, cycle.roundTrip[0]!].map(nodeLabel).join(' → ')}
        <li>
          {#if index >= 0}
            <button class="link" onclick={() => app.selectInStructure({ kind: 'cycle', index })}
              >{trip}</button
            >
          {:else}
            <span>{trip}</span>
          {/if}
          {#if cycle.typeOnly}<span class="tag">{t.structure.detail.typeOnly}</span>{/if}
        </li>
      {/each}
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
  {#if selection?.kind === 'node' && (nodeOf(selection.id) || pageOf(selection.id))}
    {@const node = nodeOf(selection.id)}
    {@const page = pageOf(selection.id)}
    {#if page && (!node || node.kind === 'component')}
      {@render componentPage(page)}
    {:else if node}
      {@render nodeDetail(node)}
    {/if}
  {:else if selection?.kind === 'edge'}
    {@const edge = edgeOf(selection.from, selection.to)}
    {#if edge}
      <h2>
        <button class="link" onclick={() => selectNode(edge.from)}>{labelOf(edge.from)}</button>
        <span aria-hidden="true">→</span>
        <button class="link" onclick={() => selectNode(edge.to)}>{labelOf(edge.to)}</button>
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
        <button class="link" onclick={() => selectNode(member)}>{labelOf(member)}</button>
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

  .kind {
    color: var(--ink-faint);
    font-size: 11.5px;
    font-weight: 600;
  }

  .description {
    margin-top: 6px;
  }

  .note {
    margin-top: 10px;
    font-size: 12px;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 3px 14px;
    margin: 0;
  }

  dt {
    color: var(--ink-soft);
  }

  dd {
    margin: 0;
  }

  .patterns dd {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
  }

  .metrics dt {
    cursor: help;
  }

  .metrics dd {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
