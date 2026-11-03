<script lang="ts">
  import type { StructureNode, StructureView } from '../../../shared/ipc'
  import { placeLabels, type Box } from '../lib/labels'
  import { app } from '../lib/state.svelte'
  import { nodeLabel, opens } from '../lib/structure'
  import { t } from '../lib/strings'

  // The Components of the level on the main sequence (structure-format.md, section 5):
  // instability to the right, abstractness to the top, the diagonal between stable and abstract
  // and unstable and concrete. The drawing is for the eye; the list beside it says the same,
  // furthest from the line first, and is what the keyboard and a screen reader go through. A
  // point is named where its name finds room, and numbered as in the list where it does not; a
  // click on it selects it, as in the list, and the selected point is drawn over the others.
  let { view }: { view: StructureView } = $props()

  const selection = $derived(app.active?.structure.selection)

  /** The plot inside the drawing, and the room for the axes around it. */
  const SIZE = 320
  const LEFT = 48
  const TOP = 14
  const RIGHT = 16
  const BOTTOM = 44
  const WIDTH = LEFT + SIZE + RIGHT
  const HEIGHT = TOP + SIZE + BOTTOM
  /** The room inside the frame, so that a point on an edge stays clear of it and of the ticks. */
  const PAD = 14
  const RIGHT_EDGE = LEFT + SIZE
  const BOTTOM_EDGE = TOP + SIZE
  /** How far the corners' zones reach from the frame's corners: 0.3 in units of the axes. */
  const ZONE = PAD + 0.3 * (SIZE - 2 * PAD)

  const x = (instability: number): number => LEFT + PAD + instability * (SIZE - 2 * PAD)
  const y = (abstractness: number): number => TOP + PAD + (1 - abstractness) * (SIZE - 2 * PAD)

  interface Point {
    readonly node: StructureNode
    readonly a: number
    readonly i: number
    readonly d: number
  }

  const measured = $derived(view.nodes.filter(opens))
  const points: Point[] = $derived(
    measured
      .flatMap((node): Point[] => {
        const { abstractness: a, instability: i, distance: d } = node.metrics ?? {}
        return a === undefined || i === undefined || d === undefined ? [] : [{ node, a, i, d }]
      })
      .toSorted((p, q) => q.d - p.d || nodeLabel(p.node).localeCompare(nodeLabel(q.node)))
  )
  const missing = $derived(
    measured.filter((node) => !points.some((point) => point.node === node)).map(nodeLabel)
  )
  // Larger Components are drawn larger, without hiding the small ones.
  const largest = $derived(Math.max(1, ...points.map((point) => point.node.lines)))
  const radiusOf = (lines: number): number => 4 + 6 * Math.sqrt(lines / largest)
  const isSelected = (node: StructureNode): boolean =>
    selection?.kind === 'node' && selection.id === node.id
  const value = (key: 'abstractness' | 'instability' | 'distance', of: number): string =>
    t.structure.value(key, of)
  /**
   * How wide a text is drawn in the font of the drawing, at a size the styles below set: as the
   * window measures it, in the semibold weight a selected name takes; where there is no window
   * to measure in, by an average character of that font.
   */
  const context =
    typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  const family =
    typeof document === 'undefined'
      ? 'sans-serif'
      : getComputedStyle(document.documentElement).getPropertyValue('--ui') || 'sans-serif'
  const widthOf = (text: string, size: number): number => {
    if (!context) return text.length * size * 0.56
    context.font = `600 ${size}px ${family}`
    return context.measureText(text).width
  }
  /** The sizes of the points' names and numbers, and of what the chart says itself. */
  const NAME = 11.5
  const NUMBER = 10.5
  const SAID = 10.5
  /** A line of text at the names' size, as high as the window draws its box. */
  const LINE = 15
  const textBox = (text: string, left: number, baseline: number): Box => ({
    x: left,
    y: baseline - SAID,
    width: widthOf(text, SAID) + 2,
    height: SAID * 1.35
  })
  const painBox = $derived(textBox(t.structure.sequence.pain, LEFT + 6, BOTTOM_EDGE - 6))
  const uselessBox = $derived.by(() => {
    const box = textBox(t.structure.sequence.uselessness, 0, TOP + 14)
    return { ...box, x: RIGHT_EDGE - 6 - box.width }
  })
  // The main sequence's name runs down the diagonal, a little above it.
  const lineBox = $derived.by(() => {
    const half = (widthOf(t.structure.sequence.line, SAID) * Math.SQRT1_2) / 2 + 5
    return { x: x(0.5) + 6 - half, y: y(0.5) - 6 - half, width: 2 * half, height: 2 * half }
  })
  const labels = $derived(
    new Map(
      placeLabels(
        points.map((point, index) => ({
          x: x(point.i),
          y: y(point.a),
          radius: radiusOf(point.node.lines),
          name: nodeLabel(point.node),
          number: index + 1
        })),
        {
          bounds: { x: LEFT, y: TOP, width: SIZE, height: SIZE },
          taken: [painBox, uselessBox, lineBox],
          widthOf: (text, numbered) => widthOf(text, numbered ? NUMBER : NAME),
          lineHeight: LINE
        }
      ).map((label, index) => [points[index]!.node.id, label])
    )
  )
  // Drawn from the furthest down to the nearest, the selected one last, over all others.
  const drawn = $derived(
    points.toReversed().toSorted((p, q) => Number(isSelected(p.node)) - Number(isSelected(q.node)))
  )
  const select = (node: StructureNode): void => app.selectInStructure({ kind: 'node', id: node.id })
  const said = (point: Point): string =>
    t.structure.sequence.point(
      nodeLabel(point.node),
      value('abstractness', point.a),
      value('instability', point.i),
      value('distance', point.d)
    )
</script>

<div class="sequence-view">
  <div class="scroll">
    {#if points.length === 0}
      <p class="empty">{t.structure.sequence.none}</p>
    {:else}
      <div class="body" role="group" aria-label={t.structure.sequence.label}>
        <svg
          class="drawing"
          viewBox="0 0 {WIDTH} {HEIGHT}"
          width={WIDTH}
          height={HEIGHT}
          aria-hidden="true"
        >
          <path
            class="zone"
            d="M {LEFT} {BOTTOM_EDGE} L {LEFT +
              ZONE} {BOTTOM_EDGE} A {ZONE} {ZONE} 0 0 0 {LEFT} {BOTTOM_EDGE - ZONE} Z"
          />
          <path
            class="zone"
            d="M {RIGHT_EDGE} {TOP} L {RIGHT_EDGE -
              ZONE} {TOP} A {ZONE} {ZONE} 0 0 0 {RIGHT_EDGE} {TOP + ZONE} Z"
          />
          <text class="zone-label" x={LEFT + 6} y={BOTTOM_EDGE - 6}
            >{t.structure.sequence.pain}</text
          >
          <text class="zone-label" x={RIGHT_EDGE - 6} y={TOP + 14} text-anchor="end"
            >{t.structure.sequence.uselessness}</text
          >
          <rect class="frame" x={LEFT} y={TOP} width={SIZE} height={SIZE} />
          <line class="grid" x1={x(0.5)} y1={TOP} x2={x(0.5)} y2={BOTTOM_EDGE} />
          <line class="grid" x1={LEFT} y1={y(0.5)} x2={RIGHT_EDGE} y2={y(0.5)} />
          <line class="main" x1={x(0)} y1={y(1)} x2={x(1)} y2={y(0)} />
          <text
            class="main-label"
            x={x(0.5)}
            y={y(0.5) - 6}
            text-anchor="middle"
            transform="rotate(45 {x(0.5)} {y(0.5)})">{t.structure.sequence.line}</text
          >
          {#each [0, 0.5, 1] as tick (tick)}
            <text class="tick" x={x(tick)} y={BOTTOM_EDGE + 16} text-anchor="middle"
              >{value('instability', tick)}</text
            >
            <text class="tick" x={LEFT - 8} y={y(tick) + 4} text-anchor="end"
              >{value('abstractness', tick)}</text
            >
          {/each}
          <text class="axis" x={x(0.5)} y={HEIGHT - 6} text-anchor="middle"
            >{t.structure.sequence.instability}</text
          >
          <text
            class="axis"
            x={14}
            y={y(0.5)}
            text-anchor="middle"
            transform="rotate(-90 14 {y(0.5)})">{t.structure.sequence.abstractness}</text
          >
          {#each drawn as point (point.node.id)}
            {@const selected = isSelected(point.node)}
            {@const label = labels.get(point.node.id)!}
            <!-- The list beside the drawing is the way there for the keyboard and a screen
            reader; a click on a point does what a click in the list does. -->
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <g
              class="point"
              class:selected
              onclick={() => select(point.node)}
              ondblclick={() => app.openComponent(point.node.id)}
            >
              <circle cx={x(point.i)} cy={y(point.a)} r={radiusOf(point.node.lines)} />
              <text
                class:numbered={label.numbered}
                x={label.x}
                y={label.y}
                text-anchor={label.anchor}>{label.text}</text
              >
            </g>
          {/each}
        </svg>

        <div class="list">
          <h3 id="main-sequence-list">{t.structure.sequence.list}</h3>
          <ol aria-labelledby="main-sequence-list">
            {#each points as point, index (point.node.id)}
              {@const selected = isSelected(point.node)}
              <li>
                <button
                  class:selected
                  aria-pressed={selected}
                  aria-label={said(point)}
                  onclick={() => select(point.node)}
                  ondblclick={() => app.openComponent(point.node.id)}
                >
                  <span class="name"
                    ><span class="number" aria-hidden="true">{index + 1}</span>
                    {nodeLabel(point.node)}</span
                  >
                  <span class="values" aria-hidden="true"
                    >A {value('abstractness', point.a)} · I {value('instability', point.i)} · D
                    {value('distance', point.d)}</span
                  >
                </button>
              </li>
            {/each}
          </ol>
        </div>
      </div>
    {/if}
  </div>

  <footer>
    <p>{t.structure.sequence.howToRead}</p>
    {#if missing.length > 0}
      <p>{t.structure.sequence.missing(missing.join(', '))}</p>
    {/if}
    <p title={t.structure.metrics.propagationCostDefinition}>
      {t.structure.metrics.propagationCost(view.propagationCost)}
    </p>
  </footer>
</div>

<style>
  .sequence-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px 14px 14px;
  }

  .empty {
    color: var(--ink-faint);
  }

  .body {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 16px 24px;
  }

  .drawing {
    flex: none;
    max-width: 100%;
    height: auto;
    background: var(--paper);
    font-family: var(--ui);
  }

  .zone {
    fill: color-mix(in srgb, var(--problem) 9%, transparent);
  }

  .zone-label {
    fill: var(--problem);
    font-size: 10.5px;
  }

  .frame {
    fill: none;
    stroke: var(--line-strong);
  }

  .grid {
    stroke: var(--line);
    stroke-dasharray: 2 3;
  }

  .main {
    stroke: var(--accepted);
    stroke-width: 1.5;
    stroke-dasharray: 6 4;
  }

  .main-label {
    fill: var(--accepted);
    font-size: 10.5px;
  }

  .tick {
    fill: var(--ink-faint);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
  }

  .axis {
    fill: var(--ink-soft);
    font-size: 11.5px;
    font-weight: 600;
  }

  .point {
    cursor: pointer;
  }

  .point circle {
    fill: color-mix(in srgb, var(--focus) 70%, transparent);
    stroke: var(--paper);
    stroke-width: 1.5;
  }

  .point:hover circle {
    fill: var(--focus);
  }

  .point text.numbered {
    fill: var(--ink-soft);
    font-size: 10.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .point text {
    fill: var(--ink);
    font-size: 11.5px;
    paint-order: stroke;
    stroke: var(--paper);
    stroke-width: 3px;
    stroke-linejoin: round;
  }

  .point.selected circle {
    fill: var(--focus);
    stroke: var(--ink);
  }

  .point.selected text {
    font-weight: 600;
  }

  .list {
    flex: 1;
    min-width: 200px;
    max-width: 360px;
  }

  h3 {
    margin-bottom: 6px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  ol {
    display: flex;
    flex-direction: column;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--line);
  }

  li button {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 4px 6px;
    border-bottom: 1px solid var(--line);
    text-align: left;
  }

  li button:hover {
    background: var(--hover);
  }

  li button.selected {
    background: var(--selected);
  }

  .name {
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .number {
    display: inline-block;
    min-width: 1.6em;
    color: var(--ink-faint);
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .values {
    color: var(--ink-soft);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  footer {
    flex: none;
    padding: 8px 14px 10px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--ink-soft);
    line-height: 1.5;
  }

  footer p + p {
    margin-top: 4px;
  }
</style>
