<script lang="ts">
  import type { StructureEdge, StructureNode, StructureView } from '../../../shared/ipc'
  import { NODE, layoutGraph, pathOf } from '../lib/graph-layout'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'

  // One level of the Components as a drawing: left to right is "depends on", so what is used
  // stands left of what uses it. The members of a Cycle share a column, and the lines that
  // close it are red. The boxes are buttons over the lines; the lines are one SVG underneath.
  let { view }: { view: StructureView } = $props()

  const layout = $derived(
    layoutGraph(
      view.nodes.map((node) => node.id),
      view.edges,
      { keepUnconnected: true, groups: view.cycles.map((cycle) => cycle.members) }
    )
  )
  const nodeOf = $derived(new Map(view.nodes.map((node) => [node.id, node])))
  // The keyboard goes through the drawing as the eye does: column by column, top to bottom.
  const placed = $derived(layout.nodes.toSorted((a, b) => a.layer - b.layer || a.y - b.y))
  const selection = $derived(app.active?.structure.selection)

  const inCycle = (edge: StructureEdge): boolean =>
    view.cycles.some(({ members }) => members.includes(edge.from) && members.includes(edge.to))
  const isWeakest = (edge: StructureEdge): boolean =>
    view.cycles.some(({ weakest }) => weakest?.from === edge.from && weakest.to === edge.to)
  /** The lines of the round trip of the Cycle that is selected. */
  const onRoundTrip = (edge: StructureEdge): boolean => {
    if (selection?.kind !== 'cycle') return false
    const trip = view.cycles[selection.index]?.roundTrip ?? []
    return trip.some(
      (from, index) => from === edge.from && trip[(index + 1) % trip.length] === edge.to
    )
  }
  const isSelected = (edge: StructureEdge): boolean =>
    selection?.kind === 'edge' && selection.from === edge.from && selection.to === edge.to
  const touchesSelected = (edge: StructureEdge): boolean =>
    selection?.kind === 'node' && (edge.from === selection.id || edge.to === selection.id)
  /** Heavier Dependencies are drawn heavier, without drowning the light ones. */
  const strokeOf = (weight: number): number => 1.2 + Math.min(4, Math.log2(weight)) * 0.6

  function labelOf(node: StructureNode): string {
    switch (node.kind) {
      case 'own-files':
        return t.structure.graph.ownFiles(node.name)
      case 'unassigned':
        return t.structure.graph.unassigned
      default:
        return node.name
    }
  }
</script>

<div class="graph">
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
  </div>

  {#if layout.nodes.length === 0}
    <p class="empty">{t.structure.graph.empty}</p>
  {:else}
    <div class="canvas">
      <div class="drawing" style:width="{layout.width}px" style:height="{layout.height}px">
        <svg width={layout.width} height={layout.height} aria-hidden="true">
          <defs>
            <marker
              id="dependency-arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path class="arrowhead" d="M0 0.5L7.5 4L0 7.5z" />
            </marker>
          </defs>
          {#each layout.edges as line (`${line.edge.from}\n${line.edge.to}`)}
            {@const edge = line.edge}
            {@const d = pathOf(line)}
            <path
              class="line"
              class:type-only={edge.typeOnly}
              class:in-cycle={inCycle(edge)}
              class:weakest={isWeakest(edge)}
              class:highlighted={isSelected(edge) || touchesSelected(edge) || onRoundTrip(edge)}
              style:stroke-width={strokeOf(edge.weight)}
              {d}
              marker-end="url(#dependency-arrow)"
            />
            <!-- A wider, invisible line beneath, so that a thin one can be hit by the mouse.
                 The keyboard reaches the same Dependencies through the details of a node. -->
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <path
              class="hit"
              {d}
              onclick={() => app.selectInStructure({ kind: 'edge', from: edge.from, to: edge.to })}
            >
              <title>{t.structure.graph.weight(edge.weight)}</title>
            </path>
          {/each}
        </svg>

        {#each placed as placedNode (placedNode.id)}
          {@const node = nodeOf.get(placedNode.id)}
          {#if node}
            <button
              class="node {node.kind}"
              class:draft={view.origin === 'draft'}
              class:selected={selection?.kind === 'node' && selection.id === node.id}
              style:left="{placedNode.x}px"
              style:top="{placedNode.y}px"
              style:width="{NODE.width}px"
              style:height="{NODE.height}px"
              title={node.kind === 'source-file' ? node.id : labelOf(node)}
              aria-pressed={selection?.kind === 'node' && selection.id === node.id}
              onclick={() => app.selectInStructure({ kind: 'node', id: node.id })}
              ondblclick={() => node.kind === 'component' && app.openComponent(node.id)}
            >
              <span class="name">{labelOf(node)}</span>
              {#if node.kind !== 'source-file'}
                <span class="files">{node.files}</span>
              {/if}
            </button>
          {/if}
        {/each}
      </div>
    </div>
  {/if}

  <footer>
    <p class="reading">{t.structure.graph.howToRead}</p>
    <ul class="legend" aria-label={t.structure.graph.legend}>
      <li>
        <svg width="34" height="10" aria-hidden="true">
          <path class="line" d="M1 5H32" marker-end="url(#dependency-arrow)" />
        </svg>
        {t.structure.graph.dependency}
      </li>
      <li>
        <svg width="34" height="10" aria-hidden="true">
          <path class="line type-only" d="M1 5H32" marker-end="url(#dependency-arrow)" />
        </svg>
        {t.structure.graph.typeOnly}
      </li>
      <li>
        <svg width="34" height="10" aria-hidden="true">
          <path class="line in-cycle" d="M1 5H32" marker-end="url(#dependency-arrow)" />
        </svg>
        {t.structure.graph.inCycle}
      </li>
      <li>
        <svg width="34" height="10" aria-hidden="true">
          <path class="line in-cycle weakest" d="M1 5H32" marker-end="url(#dependency-arrow)" />
        </svg>
        {t.structure.graph.weakest}
      </li>
    </ul>
  </footer>
</div>

<style>
  .graph {
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
    margin-left: auto;
    padding: 1px 8px;
    border: 1px solid var(--proposed);
    border-radius: 9px;
    color: var(--proposed);
    font-size: 11.5px;
    font-weight: 600;
  }

  .canvas {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .drawing {
    position: relative;
  }

  svg {
    display: block;
    overflow: visible;
  }

  .drawing > svg {
    position: absolute;
    inset: 0;
  }

  .line {
    fill: none;
    stroke: var(--ink-soft);
    stroke-width: 1.4;
    pointer-events: none;
  }

  path.arrowhead {
    fill: context-stroke;
    stroke: none;
  }

  .type-only {
    stroke-dasharray: 5 4;
  }

  .in-cycle {
    stroke: var(--problem);
  }

  .weakest {
    stroke-dasharray: 2 3;
    stroke-linecap: round;
  }

  .highlighted {
    stroke: var(--focus);
  }

  .highlighted.in-cycle {
    stroke: var(--problem);
    filter: drop-shadow(0 0 2px var(--problem));
  }

  .hit {
    fill: none;
    stroke: transparent;
    stroke-width: 12;
    cursor: pointer;
  }

  .node {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border: 1px solid var(--line-strong);
    border-radius: 5px;
    background: var(--paper);
    text-align: left;
  }

  .node:hover {
    background: var(--hover);
  }

  .node.draft {
    border-style: dashed;
  }

  .node.selected {
    border-color: var(--focus);
    background: var(--selected);
  }

  .node.own-files,
  .node.unassigned {
    background: var(--panel);
    color: var(--ink-soft);
  }

  .node.source-file .name {
    font-family: var(--code);
    font-size: 12px;
    font-weight: 400;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .files {
    flex: none;
    color: var(--ink-faint);
    font-size: 11.5px;
  }

  footer {
    flex: none;
    padding: 8px 14px 10px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--ink-soft);
  }

  footer .reading {
    margin: 0 0 6px;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 18px;
    padding: 0;
    list-style: none;
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .empty {
    max-width: 34rem;
    padding: 18px 14px;
    color: var(--ink-soft);
    line-height: 1.55;
  }
</style>
