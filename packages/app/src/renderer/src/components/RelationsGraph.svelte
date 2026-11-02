<script lang="ts">
  import { tick } from 'svelte'
  import { RELATION_TYPES, type DecisionLog, type Relation } from '@adr-tool/core'
  import {
    NODE,
    ZOOM,
    fitScale,
    layoutGraph,
    pathOf,
    relationsShown,
    scrollAfterZoom,
    stepScale,
    wheelScale
  } from '../lib/graph-layout'
  import { problemsOf } from '../lib/problems'
  import { everyNamed } from '../lib/references'
  import { app, statusKey } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { logName, RELATION_TYPE_LABEL, prefixOf } from '../lib/wording'
  import StatusMark from './StatusMark.svelte'

  // The Relations of the Decision Log in view as a drawing: left to right is "builds on",
  // so a chain of supersessions reads like a time line. The boxes are buttons over the
  // lines; the lines are one SVG underneath, and a list beside it reads them out.
  let { log }: { log: DecisionLog } = $props()

  // An ADR of another Decision Log is drawn where a Relation leads to it or comes from it.
  const named = $derived(new Map(everyNamed(log).map((one) => [one.id, one])))
  const types = $derived(app.active?.graph.types ?? [...RELATION_TYPES])
  const scale = $derived(app.active?.graph.scale ?? 1)
  const shown = $derived(
    relationsShown(
      log.adrs.map(({ id }) => id),
      (log.guests ?? []).map((guest) => guest.reference),
      log.relations,
      types
    )
  )
  const selectedId = $derived(app.selected?.id)

  // `relates-to` does not say which of the two builds on the other. The ADR that is open
  // stays in the drawing when no Relation that is shown touches it.
  const layout = $derived(
    layoutGraph(shown.ids, shown.relations, {
      decidesLayer: (relation) => relation.type !== 'relates-to',
      keep: selectedId === undefined ? [] : [selectedId]
    })
  )
  // The keyboard goes through the drawing as the eye does: column by column, top to bottom.
  const nodes = $derived(layout.nodes.toSorted((a, b) => a.layer - b.layer || a.y - b.y))
  const filtered = $derived(types.length < RELATION_TYPES.length)

  /** An ADR as a line read out names it. */
  function nameOf(id: string): string {
    const one = named.get(id)
    if (!one) return id
    return t.graph.adrName(prefixOf(one.adr), one.adr.title ?? one.adr.id, one.log)
  }

  function spoken(relation: Relation): string {
    return t.graph.line(nameOf(relation.from), relation.type, nameOf(relation.to), relation.state)
  }

  let pane = $state<HTMLDivElement>()

  /**
   * Draw at another scale, the point at `at` — from the pane's top left corner — staying
   * where it is: the point under the cursor, or the middle of the pane.
   */
  async function zoomTo(next: number, at?: { x: number; y: number }): Promise<void> {
    const from = scale
    if (!pane || next === from) return
    const point = at ?? { x: pane.clientWidth / 2, y: pane.clientHeight / 2 }
    const scroll = scrollAfterZoom(
      { left: pane.scrollLeft, top: pane.scrollTop },
      point,
      from,
      next
    )
    app.zoomGraph(next)
    // The drawing has its new size before the pane can scroll there.
    await tick()
    pane.scrollLeft = scroll.left
    pane.scrollTop = scroll.top
  }

  async function fit(): Promise<void> {
    if (!pane) return
    app.zoomGraph(fitScale(layout, { width: pane.clientWidth, height: pane.clientHeight }))
    await tick()
    pane.scrollLeft = 0
    pane.scrollTop = 0
  }

  // Ctrl and the wheel — ⌘ on a Mac, and a pinch on a trackpad — zoom the drawing rather
  // than the window. A listener that is not passive is what may say so.
  $effect(() => {
    const target = pane
    if (!target) return
    const onwheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const box = target.getBoundingClientRect()
      void zoomTo(wheelScale(scale, event.deltaY, event.deltaMode), {
        x: event.clientX - box.left,
        y: event.clientY - box.top
      })
    }
    target.addEventListener('wheel', onwheel, { passive: false })
    return () => target.removeEventListener('wheel', onwheel)
  })

  // Wherever the selection came from, the drawing shows it.
  $effect(() => {
    if (selectedId) {
      document
        .getElementById(`node-${selectedId}`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  })
</script>

<div class="graph">
  <div class="head">
    <h2>{t.graph.heading}</h2>
    <span class="tools">
      {#if layout.nodes.length > 0}
        <span class="zoom" role="group" aria-label={t.graph.zoom(window.api.platform === 'darwin')}>
          <button
            aria-label={t.graph.smaller}
            title={t.graph.smaller}
            disabled={scale <= ZOOM.min}
            onclick={() => zoomTo(stepScale(scale, -1))}>−</button
          >
          <button class="percent" title={t.graph.actualSize} onclick={() => zoomTo(1)}>
            {t.graph.percent(Math.round(scale * 100))}
          </button>
          <button
            aria-label={t.graph.larger}
            title={t.graph.larger}
            disabled={scale >= ZOOM.max}
            onclick={() => zoomTo(stepScale(scale, 1))}>+</button
          >
          <button title={t.graph.fitHint} onclick={fit}>{t.graph.fit}</button>
        </span>
      {/if}
      <button onclick={() => app.startSearching()}>{t.search}</button>
      <button onclick={() => app.show('adrs')}>{t.backToAdrs}</button>
    </span>
  </div>

  <!-- The arrowhead of every line, in the drawing and in the legend. -->
  <svg class="defs" width="0" height="0" aria-hidden="true">
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
  </svg>

  {#if log.relations.length === 0}
    <p class="empty">{t.graph.empty}</p>
  {:else}
    {#if layout.nodes.length === 0}
      <p class="empty">{t.graph.noneShown}</p>
    {:else}
      <div class="canvas" bind:this={pane}>
        <div
          class="extent"
          style:width="{layout.width * scale}px"
          style:height="{layout.height * scale}px"
        >
          <div
            class="drawing"
            style:width="{layout.width}px"
            style:height="{layout.height}px"
            style:transform="scale({scale})"
          >
            <svg width={layout.width} height={layout.height} aria-hidden="true">
              {#each layout.edges as edge, position (position)}
                <path
                  class="{edge.edge.type} {edge.edge.state}"
                  class:touching={edge.edge.from === selectedId || edge.edge.to === selectedId}
                  d={pathOf(edge)}
                  marker-end={edge.edge.type === 'relates-to' ? undefined : 'url(#arrow)'}
                />
              {/each}
            </svg>

            {#each nodes as node (node.id)}
              {@const one = named.get(node.id)}
              {#if one}
                {@const adr = one.adr}
                {@const status = statusKey(adr)}
                {@const problems =
                  one.log === undefined
                    ? problemsOf(app.problemGroups, adr.id).filter((own) => !own.cause).length
                    : 0}
                <button
                  id="node-{node.id}"
                  class="node {status}"
                  class:guest={one.log !== undefined}
                  class:selected={node.id === selectedId}
                  style:left="{node.x}px"
                  style:top="{node.y}px"
                  style:width="{NODE.width}px"
                  style:height="{NODE.height}px"
                  title={one.log === undefined
                    ? (adr.title ?? adr.id)
                    : t.graph.inLog(one.log, adr.title ?? adr.id)}
                  aria-current={node.id === selectedId}
                  onclick={() =>
                    one.log === undefined ? app.select(adr.id) : app.jumpTo(one.log, adr.id)}
                >
                  <StatusMark {status} />
                  {#if one.log !== undefined}
                    <span class="log"
                      >{one.log === '' ? logName('') : one.log.split('/').at(-1)}/</span
                    >
                  {/if}
                  <span class="prefix">{prefixOf(adr)}</span>
                  <span class="title">{adr.title ?? adr.id}</span>
                  {#if problems > 0}
                    <span class="problems" title={t.problemCount(problems)}>
                      {problems}
                    </span>
                  {/if}
                </button>
              {/if}
            {/each}
          </div>
        </div>
      </div>
      <!-- What the lines say, for a screen reader: the drawing is boxes and a picture of lines. -->
      <ul class="spoken" aria-label={t.graph.spoken}>
        {#each layout.edges as edge, position (position)}
          <li>{spoken(edge.edge)}</li>
        {/each}
      </ul>
    {/if}

    <footer>
      <p class="reading">{t.graph.howToRead}</p>
      <ul class="legend" aria-label={t.graph.legend}>
        {#each RELATION_TYPES as type (type)}
          <li>
            <label title={t.graph.filterHint}>
              <input
                type="checkbox"
                checked={types.includes(type)}
                onchange={(event) => app.showRelationType(type, event.currentTarget.checked)}
              />
              <svg width="34" height="10" aria-hidden="true">
                <path
                  class="{type} in-effect"
                  d="M1 5H32"
                  marker-end={type === 'relates-to' ? undefined : 'url(#arrow)'}
                />
              </svg>
              {RELATION_TYPE_LABEL[type]}
            </label>
          </li>
        {/each}
        <li>
          <svg width="34" height="10" aria-hidden="true">
            <path class="supersedes pending" d="M1 5H32" marker-end="url(#arrow)" />
          </svg>
          {t.graph.proposed}
        </li>
        <li>
          <svg width="34" height="10" aria-hidden="true">
            <path class="supersedes void" d="M1 5H32" marker-end="url(#arrow)" />
          </svg>
          {t.neverTookEffect}
        </li>
      </ul>
      {#if layout.unrelated > 0}
        <p>
          {filtered
            ? t.graph.unrelatedShown(layout.unrelated)
            : t.graph.unrelated(layout.unrelated)}
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
    position: relative;
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

  .zoom {
    display: flex;
    margin-right: 6px;
  }

  .zoom button {
    min-width: 28px;
    padding: 3px 8px;
    border-radius: 0;
  }

  .zoom button + button {
    margin-left: -1px;
  }

  .zoom button:first-child {
    border-radius: 4px 0 0 4px;
  }

  .zoom button:last-child {
    border-radius: 0 4px 4px 0;
  }

  .zoom .percent {
    min-width: 54px;
    color: var(--ink-soft);
  }

  .head button:disabled {
    color: var(--ink-faint);
    background: var(--paper);
  }

  .extent {
    position: relative;
  }

  /* The drawing is laid out at its own size and scaled as a whole: boxes, lines and text. */
  .drawing {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
  }

  .defs {
    position: absolute;
  }

  /* Read out, not shown: the lines of the drawing as sentences. */
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

  .legend label {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legend input {
    margin: 0;
    accent-color: var(--focus);
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

  /* An ADR of another Decision Log: drawn for the Relation, kept and shown in its own log. */
  .node.guest {
    border-style: dashed;
    background: var(--panel);
  }

  .log {
    flex: none;
    margin-right: -4px;
    font-size: 11.5px;
    color: var(--ink-faint);
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
    flex: 1;
    max-width: 34rem;
    padding: 18px 14px;
    color: var(--ink-soft);
    line-height: 1.55;
  }
</style>
