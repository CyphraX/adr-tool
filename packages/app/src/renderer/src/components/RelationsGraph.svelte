<script lang="ts">
  import { RELATION_TYPES, type DecisionLog } from '@adr-tool/core'
  import { NODE, SAME_LAYER_REACH, layoutGraph, type GraphEdge } from '../lib/graph-layout'
  import { problemsOf } from '../lib/problems'
  import { app, statusKey } from '../lib/state.svelte'
  import { RELATION_TYPE_LABEL, prefixOf } from '../lib/wording'
  import StatusMark from './StatusMark.svelte'

  // The Relations of the Decision Log in view as a drawing: left to right is "builds on",
  // so a chain of supersessions reads like a time line. The boxes are buttons over the
  // lines; the lines are one SVG underneath.
  let { log }: { log: DecisionLog } = $props()

  const layout = $derived(
    layoutGraph(
      log.adrs.map((adr) => adr.id),
      log.relations
    )
  )
  const adrOf = $derived(new Map(log.adrs.map((adr) => [adr.id, adr])))
  // The keyboard goes through the drawing as the eye does: column by column, top to bottom.
  const nodes = $derived(layout.nodes.toSorted((a, b) => a.layer - b.layer || a.y - b.y))
  const selectedId = $derived(app.selected?.id)

  // Wherever the selection came from, the drawing shows it.
  $effect(() => {
    if (selectedId) {
      document
        .getElementById(`node-${selectedId}`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  })

  /** How far a curve reaches out before it turns. */
  const BEND = NODE.gapX / 2

  /** The line of an edge: level where it leaves, arrives and passes a layer, curved in between. */
  function pathOf({ points, sameLayer }: GraphEdge): string {
    const [start, ...rest] = points
    if (!start) return ''
    if (sameLayer) {
      const end = rest[0]!
      // A curve reaches three quarters as far as its control points.
      const reach = (SAME_LAYER_REACH * 4) / 3 - 4
      return `M${start.x} ${start.y}C${start.x + reach} ${start.y} ${end.x + reach} ${end.y} ${end.x} ${end.y}`
    }
    const direction = Math.sign(rest.at(-1)!.x - start.x)
    let path = `M${start.x} ${start.y}`
    let from = start
    rest.forEach((point, position) => {
      const passing = position < rest.length - 1
      // A waypoint is the middle of its layer: the line crosses the whole layer at that height.
      const to = passing ? { x: point.x - (direction * NODE.width) / 2, y: point.y } : point
      path += `C${from.x + direction * BEND} ${from.y} ${to.x - direction * BEND} ${to.y} ${to.x} ${to.y}`
      from = passing ? { x: point.x + (direction * NODE.width) / 2, y: point.y } : to
      if (passing) path += `L${from.x} ${from.y}`
    })
    return path
  }
</script>

<div class="graph">
  <div class="head">
    <h2>Relations</h2>
    <span class="tools">
      <button onclick={() => app.startSearching()}>Search</button>
      <button onclick={() => app.show('adrs')}>Back to the ADRs</button>
    </span>
  </div>

  {#if layout.nodes.length === 0}
    <p class="empty">
      No ADR of this Decision Log has a Relation yet. Supersede or amend an ADR, or add a Relation
      in its Metadata, and it shows up here.
    </p>
  {:else}
    <div class="canvas">
      <div class="drawing" style:width="{layout.width}px" style:height="{layout.height}px">
        <svg width={layout.width} height={layout.height} aria-hidden="true">
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path class="arrowhead" d="M0 0.5L7.5 4L0 7.5z" />
            </marker>
          </defs>
          {#each layout.edges as edge, position (position)}
            <path
              class="{edge.relation.type} {edge.relation.state}"
              class:touching={edge.relation.from === selectedId || edge.relation.to === selectedId}
              d={pathOf(edge)}
              marker-end={edge.relation.type === 'relates-to' ? undefined : 'url(#arrow)'}
            />
          {/each}
        </svg>

        {#each nodes as node (node.id)}
          {@const adr = adrOf.get(node.id)}
          {#if adr}
            {@const status = statusKey(adr)}
            {@const problems = problemsOf(app.problemGroups, adr.id).filter(
              (own) => !own.cause
            ).length}
            <button
              id="node-{node.id}"
              class="node {status}"
              class:selected={node.id === selectedId}
              style:left="{node.x}px"
              style:top="{node.y}px"
              style:width="{NODE.width}px"
              style:height="{NODE.height}px"
              title={adr.title ?? adr.id}
              aria-current={node.id === selectedId}
              onclick={() => app.select(node.id)}
            >
              <StatusMark {status} />
              <span class="prefix">{prefixOf(adr)}</span>
              <span class="title">{adr.title ?? adr.id}</span>
              {#if problems > 0}
                <span class="problems" title="{problems} {problems === 1 ? 'Problem' : 'Problems'}">
                  {problems}
                </span>
              {/if}
            </button>
          {/if}
        {/each}
      </div>
    </div>

    <footer>
      <p class="reading">
        Read it from left to right: an ADR stands to the right of what it supersedes, amends or
        depends on, and its arrow points there.
      </p>
      <ul class="legend" aria-label="What the lines mean">
        {#each RELATION_TYPES as type (type)}
          <li>
            <svg width="34" height="10" aria-hidden="true">
              <path
                class="{type} in-effect"
                d="M1 5H32"
                marker-end={type === 'relates-to' ? undefined : 'url(#arrow)'}
              />
            </svg>
            {RELATION_TYPE_LABEL[type]}
          </li>
        {/each}
        <li>
          <svg width="34" height="10" aria-hidden="true">
            <path class="supersedes pending" d="M1 5H32" marker-end="url(#arrow)" />
          </svg>
          proposed
        </li>
        <li>
          <svg width="34" height="10" aria-hidden="true">
            <path class="supersedes void" d="M1 5H32" marker-end="url(#arrow)" />
          </svg>
          never took effect
        </li>
      </ul>
      {#if layout.unrelated > 0}
        <p>
          {layout.unrelated === 1
            ? 'One ADR has no Relation and is not drawn.'
            : `${layout.unrelated} ADRs have no Relation and are not drawn.`}
        </p>
      {/if}
    </footer>
  {/if}
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
    justify-content: space-between;
    flex: none;
    padding: 6px 14px;
    border-bottom: 1px solid var(--line);
  }

  h2 {
    font-size: 13px;
    font-weight: 600;
  }

  .tools {
    display: flex;
    gap: 8px;
  }

  .head button {
    padding: 3px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .head button:hover {
    background: var(--hover);
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

  path {
    fill: none;
    stroke: var(--ink-soft);
    stroke-width: 1.4;
  }

  /* An arrowhead is filled with the colour of its line. */
  path.arrowhead {
    fill: context-stroke;
    stroke: none;
  }

  /* Each type has its own line as well as its own name, like each Status has its own shape. */
  .supersedes {
    stroke-width: 2;
  }

  .amends {
    stroke-dasharray: 7 4;
  }

  .depends-on {
    stroke-dasharray: 2 4;
    stroke-linecap: round;
  }

  .relates-to {
    stroke: var(--ink-faint);
    stroke-width: 1;
  }

  .pending {
    stroke: var(--proposed);
  }

  .void {
    stroke: var(--ink-faint);
    opacity: 0.45;
  }

  /* The Relations of the ADR that is open stand out — and still say whether they took effect. */
  .touching {
    stroke-width: 2.6;
  }

  .touching.in-effect {
    stroke: var(--focus);
  }

  .node {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    border: 1px solid var(--line-strong);
    border-radius: 5px;
    background: var(--paper);
    text-align: left;
  }

  .node:hover {
    background: var(--hover);
  }

  .node.selected {
    border-color: var(--focus);
    background: var(--selected);
  }

  .node :global(svg) {
    flex: none;
  }

  .prefix {
    flex: none;
    color: var(--ink-soft);
  }

  .title {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  /* As in the list: a decision that no longer holds steps back. */
  .node.superseded .title,
  .node.deprecated .title,
  .node.rejected .title {
    color: var(--ink-faint);
    font-weight: 400;
  }

  .node.superseded .title {
    text-decoration: line-through;
    text-decoration-color: var(--line-strong);
  }

  footer {
    flex: none;
    padding: 8px 14px 10px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--ink-soft);
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

  footer p {
    margin-top: 4px;
    color: var(--ink-faint);
  }

  footer .reading {
    margin: 0 0 6px;
    color: var(--ink-soft);
  }

  .problems {
    flex: none;
    min-width: 16px;
    margin-left: auto;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--problem);
    color: var(--paper);
    font-size: 10.5px;
    font-weight: 600;
    line-height: 16px;
    text-align: center;
  }

  .empty {
    max-width: 34rem;
    padding: 18px 14px;
    color: var(--ink-soft);
    line-height: 1.55;
  }
</style>
