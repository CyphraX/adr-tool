<script lang="ts">
  import type { StructureEdge, StructureView } from '../../../shared/ipc'
  import { edgeKey, type ViolationsOnLevel } from '../lib/conformance'
  import { NODE, layoutGraph, pathOf } from '../lib/graph-layout'
  import type { StructureSelection } from '../lib/state.svelte'
  import { nodeLabel, opens } from '../lib/structure'
  import { t } from '../lib/strings'
  import { wordConformance } from '../lib/said'

  // One level of the Components as a drawing: left to right is "depends on", so what is used
  // stands left of what uses it. The members of a Cycle share a column, and the lines that
  // close it are red. The boxes are buttons over the lines, in reading order; the lines are one
  // SVG underneath, and a list beside it says each of them as a sentence for a screen reader.
  // Conformance draws the same level with its Violations in red instead of the Cycles.
  let {
    view,
    selection,
    onselect,
    onopen,
    violations
  }: {
    view: StructureView
    selection: StructureSelection | undefined
    onselect: (selection: StructureSelection) => void
    /** A double click on a Component or a directory: the level below it. */
    onopen: (id: string) => void
    /** The lines and boxes of the Violations no Exception accepts, drawn red. */
    violations?: ViolationsOnLevel
  } = $props()

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

  // On Conformance's drawing red is a Violation: a Cycle is red there where a Rule forbids it.
  const inCycle = (edge: StructureEdge): boolean =>
    !violations &&
    view.cycles.some(({ members }) => members.includes(edge.from) && members.includes(edge.to))
  const isWeakest = (edge: StructureEdge): boolean =>
    !violations &&
    view.cycles.some(({ weakest }) => weakest?.from === edge.from && weakest.to === edge.to)
  const violating = (edge: StructureEdge): boolean => violations?.edges.has(edgeKey(edge)) ?? false

  /** A line as a sentence: what depends on what, how much, and what is wrong with it. */
  function spoken(edge: StructureEdge): string {
    const label = (id: string): string => {
      const node = nodeOf.get(id)
      return node ? nodeLabel(node) : id
    }
    const broken = violations?.edges.get(edgeKey(edge)) ?? []
    return t.structure.graph.line(
      label(edge.from),
      label(edge.to),
      edge.weight,
      edge.typeOnly,
      inCycle(edge),
      broken.map((violation) => wordConformance(violation.said))
    )
  }
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

  // On Conformance's drawing what breaks a Rule is drawn over the rest, never under it, and
  // heavy enough to be seen however few imports stand behind it; the rest steps back.
  const lines = $derived(
    violations
      ? layout.edges.toSorted((a, b) => Number(violating(a.edge)) - Number(violating(b.edge)))
      : layout.edges
  )
  const widthOf = (edge: StructureEdge): number =>
    violating(edge) ? Math.max(2.6, strokeOf(edge.weight)) : strokeOf(edge.weight)

  // A level that is drawn anew shows what breaks a Rule on it, wherever it lies in the drawing.
  let canvas = $state<HTMLDivElement>()
  $effect(() => {
    if (!violations || !canvas) return
    void view
    const first = canvas.querySelector('.line.violating, .node.violating')
    first?.scrollIntoView({ block: 'center', inline: 'center' })
  })
</script>

<div class="graph">
  {#if layout.nodes.length === 0}
    <p class="empty">{t.structure.graph.empty}</p>
  {:else}
    <div class="canvas" bind:this={canvas}>
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
          {#each lines as line (`${line.edge.from}\n${line.edge.to}`)}
            {@const edge = line.edge}
            {@const d = pathOf(line)}
            <path
              class="line"
              class:type-only={edge.typeOnly}
              class:in-cycle={inCycle(edge) || violating(edge)}
              class:violating={violating(edge)}
              class:quiet={violations && !violating(edge)}
              class:weakest={isWeakest(edge)}
              class:highlighted={isSelected(edge) || touchesSelected(edge) || onRoundTrip(edge)}
              style:stroke-width={widthOf(edge)}
              {d}
              marker-end="url(#dependency-arrow)"
            />
            <!-- A wider, invisible line beneath, so that a thin one can be hit by the mouse.
                 The keyboard reaches the same Dependencies through the details of a node. -->
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <path
              class="hit"
              {d}
              onclick={() => onselect({ kind: 'edge', from: edge.from, to: edge.to })}
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
              class:violating={violations?.nodes.has(node.id)}
              class:selected={selection?.kind === 'node' && selection.id === node.id}
              style:left="{placedNode.x}px"
              style:top="{placedNode.y}px"
              style:width="{NODE.width}px"
              style:height="{NODE.height}px"
              title={node.kind === 'source-file' ? node.id : nodeLabel(node)}
              aria-pressed={selection?.kind === 'node' && selection.id === node.id}
              onclick={() => onselect({ kind: 'node', id: node.id })}
              ondblclick={() => opens(node) && onopen(node.id)}
            >
              <span class="name">{nodeLabel(node)}</span>
              {#if node.kind !== 'source-file'}
                <span class="files">{node.files}</span>
              {/if}
            </button>
          {/if}
        {/each}
      </div>
    </div>
  {/if}

  {#if layout.nodes.length > 0}
    <!-- What the drawing shows, read out: each line as a sentence. -->
    <ul class="spoken" aria-label={t.structure.graph.spoken}>
      {#each layout.edges as line (edgeKey(line.edge))}
        <li>{spoken(line.edge)}</li>
      {:else}
        <li>{t.structure.graph.noLine}</li>
      {/each}
    </ul>
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
      {#if violations}
        <li>
          <svg width="34" height="10" aria-hidden="true">
            <path class="line in-cycle" d="M1 5H32" marker-end="url(#dependency-arrow)" />
          </svg>
          {t.structure.graph.violation}
        </li>
        <li>
          <span class="swatch violating" aria-hidden="true"></span>
          {t.structure.graph.thresholdViolation}
        </li>
      {:else}
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
      {/if}
    </ul>
  </footer>
</div>

<style>
  .graph {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
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

  .quiet {
    stroke: var(--line-strong);
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

  .node.violating,
  .swatch.violating {
    border-color: var(--problem);
    box-shadow: inset 0 0 0 1px var(--problem);
  }

  .swatch {
    display: inline-block;
    width: 22px;
    height: 12px;
    border: 1px solid var(--line-strong);
    border-radius: 3px;
    background: var(--paper);
  }

  .spoken {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .node.own-files,
  .node.unassigned {
    background: var(--panel);
    color: var(--ink-soft);
  }

  .node.directory .name {
    font-family: var(--code);
    font-size: 12px;
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
