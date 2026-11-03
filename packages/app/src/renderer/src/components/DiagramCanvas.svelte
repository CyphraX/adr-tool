<script lang="ts">
  import {
    geometryOf,
    lineBetween,
    type Declared,
    type Diagram,
    type DiagramEdit,
    type Drift,
    type Point
  } from '@adr-tool/diagrams'
  import type { DiagramSelection } from '../lib/diagrams-tab.svelte'
  import { GRID, boxAt, readingOrder, snapPoint } from '../lib/diagram-canvas'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'

  // The canvas of a Diagram: its boxes where its file puts them, drawn as the picture of its
  // export draws them, and the arrows between them; red where the code does not have an arrow,
  // dashed and faint where the code has one that the Diagram leaves out. The boxes are buttons
  // in reading order, over one SVG of lines. Whatever is done here is an edit, held until Save.
  let {
    diagram,
    declared,
    drift,
    selection
  }: {
    diagram: Diagram
    declared: Declared
    /** The Drift of the Diagram as the canvas holds it; `undefined` until the code has said. */
    drift: readonly Drift[] | undefined
    selection: DiagramSelection | undefined
  } = $props()

  /** The room around the drawing, and beyond it to drag a box into. */
  const PAD = 40
  const ROOM = 320

  /** A box being dragged: where it was, where the pointer took it, and where the drawing stood. */
  let drag = $state<
    | { id: string; start: Point; pointer: Point; at: Point; moved: boolean; origin: Point }
    | undefined
  >(undefined)
  /** A connection being drawn from a box: where the pointer is, on the drawing. */
  let connecting = $state<{ from: string; to: Point } | undefined>(undefined)
  /** The label of a connection being written on the canvas. */
  let labelling = $state<{ from: string; to: string; text: string } | undefined>(undefined)
  let drawing = $state<HTMLDivElement>()

  // While a box is dragged it stands where the pointer took it; the lines follow it.
  const shown = $derived<Pick<Diagram, 'elements' | 'connections'>>(
    drag?.moved
      ? {
          connections: diagram.connections,
          elements: diagram.elements.map((element) =>
            element.id === drag!.id ? { ...element, at: drag!.at } : element
          )
        }
      : diagram
  )
  const geometry = $derived(geometryOf(shown, declared))
  const boxOf = $derived(new Map(geometry.boxes.map((box) => [box.id, box])))
  const boxes = $derived(readingOrder(geometry.boxes))

  // The drawing reaches from the top left of what it holds — or of 0, 0 — to its bottom right,
  // with room to drag into. It stays where it was while a box is dragged.
  const extent = $derived.by(() => {
    const rects = [
      ...geometry.boxes,
      ...geometry.lines.flatMap((line) => (line.label ? [line.label.ground] : []))
    ]
    const left = Math.min(0, ...rects.map((rect) => rect.x - PAD))
    const top = Math.min(0, ...rects.map((rect) => rect.y - PAD))
    const right = Math.max(0, ...rects.map((rect) => rect.x + rect.width)) + ROOM
    const bottom = Math.max(0, ...rects.map((rect) => rect.y + rect.height)) + ROOM
    return { left, top, right, bottom }
  })
  const origin = $derived(drag?.origin ?? { x: extent.left, y: extent.top })
  const width = $derived(extent.right - origin.x)
  const height = $derived(extent.bottom - origin.y)

  const key = (from: string, to: string): string => `${from}\n${to}`
  const notInCode = $derived(
    new Map(
      (drift ?? []).flatMap((one) =>
        one.kind === 'connection-not-in-code' ? [[key(one.from, one.to), one] as const] : []
      )
    )
  )
  const drawn = $derived(new Set(diagram.connections.map(({ from, to }) => key(from, to))))
  // A Dependency the Diagram leaves out, between two of its boxes: drawn faint, a click draws it.
  const leftOut = $derived(
    (drift ?? []).flatMap((one) => {
      if (one.kind !== 'dependency-not-in-diagram') return []
      const [from, to] = [boxOf.get(one.from), boxOf.get(one.to)]
      if (!from || !to) return []
      const line = lineBetween(from, to, drawn.has(key(one.to, one.from)), undefined)
      return line ? [{ from: one.from, to: one.to, line }] : []
    })
  )

  const nameOf = (id: string): string => boxOf.get(id)?.name ?? id
  const isSelected = (from: string, to: string): boolean =>
    selection?.kind === 'connection' && selection.from === from && selection.to === to
  const touches = (from: string, to: string): boolean =>
    selection?.kind === 'element' && (selection.id === from || selection.id === to)

  /** A point of the window as a point of the drawing. */
  function onDrawing(event: PointerEvent | MouseEvent): Point {
    const rect = drawing!.getBoundingClientRect()
    return { x: event.clientX - rect.left + origin.x, y: event.clientY - rect.top + origin.y }
  }

  function edit(change: DiagramEdit): boolean {
    return app.diagrams.edit(change)
  }

  function startDrag(event: PointerEvent, id: string): void {
    if (event.button !== 0) return
    const box = boxOf.get(id)
    if (!box) return
    app.diagrams.select({ kind: 'element', id })
    drag = {
      id,
      start: { x: box.x, y: box.y },
      pointer: { x: event.clientX, y: event.clientY },
      at: { x: box.x, y: box.y },
      moved: false,
      origin: { x: origin.x, y: origin.y }
    }
    window.addEventListener('pointermove', moveDrag)
    window.addEventListener('pointerup', endDrag, { once: true })
  }

  function moveDrag(event: PointerEvent): void {
    if (!drag) return
    const dx = event.clientX - drag.pointer.x
    const dy = event.clientY - drag.pointer.y
    if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
    drag.moved = true
    drag.at = snapPoint({ x: drag.start.x + dx, y: drag.start.y + dy })
  }

  function endDrag(): void {
    window.removeEventListener('pointermove', moveDrag)
    const done = drag
    drag = undefined
    if (!done?.moved) return
    if (done.at.x !== done.start.x || done.at.y !== done.start.y) {
      edit({ kind: 'move-element', id: done.id, at: done.at })
    }
  }

  function startConnecting(event: PointerEvent, from: string): void {
    if (event.button !== 0) return
    event.stopPropagation()
    connecting = { from, to: onDrawing(event) }
    window.addEventListener('pointermove', moveConnecting)
    window.addEventListener('pointerup', endConnecting, { once: true })
  }

  function moveConnecting(event: PointerEvent): void {
    if (connecting) connecting.to = onDrawing(event)
  }

  function endConnecting(event: PointerEvent): void {
    window.removeEventListener('pointermove', moveConnecting)
    const done = connecting
    connecting = undefined
    if (!done) return
    const target = boxAt(geometry.boxes, onDrawing(event))
    if (!target || target.id === done.from) return
    if (edit({ kind: 'add-connection', from: done.from, to: target.id })) {
      app.diagrams.select({ kind: 'connection', from: done.from, to: target.id })
    }
  }

  /** The keyboard moves a box on the grid, takes it out, or takes back the last edit. */
  function onBoxKey(event: KeyboardEvent, id: string): void {
    const step = event.shiftKey ? GRID * 5 : GRID
    const moves: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step }
    }
    const move = moves[event.key]
    const box = boxOf.get(id)
    if (move && box) {
      event.preventDefault()
      edit({ kind: 'move-element', id, at: snapPoint({ x: box.x + move.x, y: box.y + move.y }) })
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      edit({ kind: 'remove-element', id })
    }
  }

  function onKey(event: KeyboardEvent): void {
    const mac = window.api.platform === 'darwin'
    const chord = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
    if (chord && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z') {
      if (event.target instanceof HTMLInputElement) return
      event.preventDefault()
      app.diagrams.undo()
    } else if (event.key === 'Escape' && selection) {
      app.diagrams.select(undefined)
    }
  }

  function startLabelling(from: string, to: string): void {
    const connection = diagram.connections.find((one) => one.from === from && one.to === to)
    if (!connection) return
    app.diagrams.select({ kind: 'connection', from, to })
    labelling = { from, to, text: connection.label ?? '' }
  }

  function endLabelling(keep: boolean): void {
    const done = labelling
    labelling = undefined
    if (!done || !keep) return
    const before = diagram.connections.find((one) => one.from === done.from && one.to === done.to)
    const label = done.text.trim() === '' ? undefined : done.text.trim()
    if (before && (before.label ?? undefined) !== label) {
      edit({ kind: 'relabel-connection', from: done.from, to: done.to, ...(label && { label }) })
    }
  }

  /** Where the label of a connection is written on the canvas: on its ground, or its middle. */
  function labelPlace(from: string, to: string): Point {
    const line = geometry.lines.find((one) => one.ends.from === from && one.ends.to === to)
    if (line?.label) return { x: line.label.ground.x, y: line.label.ground.y }
    if (!line) return { x: 0, y: 0 }
    return { x: (line.from.x + line.to.x) / 2 - 60, y: (line.from.y + line.to.y) / 2 - 10 }
  }

  // A box selected from elsewhere — added, found, or chosen beside the canvas — is brought into
  // view when none of it is in view; one that is clicked or dragged stays where it is.
  let view = $state<HTMLDivElement>()
  $effect(() => {
    const id = selection?.kind === 'element' ? selection.id : undefined
    if (id === undefined || !view) return
    const box = view.querySelector<HTMLElement>(`[data-element="${CSS.escape(id)}"]`)
    if (!box) return
    const [seen, at] = [view.getBoundingClientRect(), box.getBoundingClientRect()]
    const outside =
      at.right <= seen.left ||
      at.left >= seen.right ||
      at.bottom <= seen.top ||
      at.top >= seen.bottom
    if (outside) box.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })

  /** Focus the field of a label as it appears. */
  function focused(field: HTMLInputElement): void {
    field.focus()
    field.select()
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="canvas" bind:this={view} onkeydown={onKey}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="drawing"
    class:dragging={drag?.moved || connecting}
    bind:this={drawing}
    style:width="{width}px"
    style:height="{height}px"
    style:--grid="{GRID}px"
    style:background-position="{-origin.x}px {-origin.y}px"
    onclick={(event) => {
      if (event.target === drawing) app.diagrams.select(undefined)
    }}
  >
    <svg {width} {height} viewBox="{origin.x} {origin.y} {width} {height}" aria-hidden="true">
      <defs>
        <marker
          id="diagram-arrow"
          viewBox="0 0 8 8"
          refX="3.5"
          refY="4"
          markerWidth="8"
          markerHeight="8"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path class="arrowhead" d="M0 0.5L7.5 4L0 7.5z" />
        </marker>
      </defs>

      {#each leftOut as one (key(one.from, one.to))}
        {@const d = `M${one.line.from.x} ${one.line.from.y}L${one.line.to.x} ${one.line.to.y}`}
        <path class="line left-out" {d} marker-end="url(#diagram-arrow)" />
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <path
          class="hit"
          {d}
          onclick={() => {
            if (edit({ kind: 'add-connection', from: one.from, to: one.to })) {
              app.diagrams.select({ kind: 'connection', from: one.from, to: one.to })
            }
          }}
        >
          <title>{t.diagrams.leftOutHint(nameOf(one.from), nameOf(one.to))}</title>
        </path>
      {/each}

      {#each geometry.lines as line (key(line.ends.from, line.ends.to))}
        {@const { from, to } = line.ends}
        {@const off = notInCode.get(key(from, to))}
        {@const d = `M${line.from.x} ${line.from.y}L${line.to.x} ${line.to.y}`}
        <path
          class="line"
          class:not-in-code={off && !off.uncertain}
          class:perhaps={off?.uncertain}
          class:highlighted={isSelected(from, to) || touches(from, to)}
          {d}
          marker-end="url(#diagram-arrow)"
        />
        <!-- The keyboard reaches each connection through the list beside the canvas. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <path
          class="hit"
          {d}
          onclick={() => app.diagrams.select({ kind: 'connection', from, to })}
          ondblclick={() => startLabelling(from, to)}
        >
          <title>{t.diagrams.uses(nameOf(from), nameOf(to), line.label?.text)}</title>
        </path>
        {#if line.label && !(labelling?.from === from && labelling.to === to)}
          {@const ground = line.label.ground}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <g
            class="label"
            class:highlighted={isSelected(from, to)}
            onclick={() => app.diagrams.select({ kind: 'connection', from, to })}
            ondblclick={() => startLabelling(from, to)}
          >
            <rect
              class="ground"
              x={ground.x}
              y={ground.y}
              width={ground.width}
              height={ground.height}
              rx="2"
            />
            <text x={ground.x + ground.width / 2} y={ground.y + ground.height / 2 + 4}>
              {line.label.text}
            </text>
          </g>
        {/if}
      {/each}

      {#if connecting}
        {@const start = boxOf.get(connecting.from)}
        {#if start}
          <path
            class="line drawing-line"
            d="M{start.x + start.width} {start.y + start.height / 2}L{connecting.to.x} {connecting
              .to.y}"
            marker-end="url(#diagram-arrow)"
          />
        {/if}
      {/if}
    </svg>

    {#each boxes as box (box.id)}
      {@const selected = selection?.kind === 'element' && selection.id === box.id}
      <button
        class="box {box.kind}"
        data-element={box.id}
        class:selected
        class:dragged={drag?.id === box.id && drag.moved}
        style:left="{box.x - origin.x}px"
        style:top="{box.y - origin.y}px"
        style:width="{box.width}px"
        style:height="{box.height}px"
        aria-pressed={selected}
        aria-label={t.diagrams.isElement(box.name, box.kind, box.lines.join(' ') || undefined)}
        onpointerdown={(event) => startDrag(event, box.id)}
        onclick={() => app.diagrams.select({ kind: 'element', id: box.id })}
        onkeydown={(event) => onBoxKey(event, box.id)}
      >
        <span class="name">{box.name}</span>
        {#each box.lines as text, position (position)}
          <span class="description">{text}</span>
        {/each}
      </button>
      {#if selected && !drag?.moved}
        <button
          class="handle"
          style:left="{box.x - origin.x + box.width - 6}px"
          style:top="{box.y - origin.y + box.height / 2 - 6}px"
          title={t.diagrams.connectFrom(box.name)}
          aria-label={t.diagrams.connectFrom(box.name)}
          onpointerdown={(event) => startConnecting(event, box.id)}
        ></button>
      {/if}
    {/each}

    {#if labelling}
      {@const place = labelPlace(labelling.from, labelling.to)}
      <input
        class="label-field"
        style:left="{place.x - origin.x}px"
        style:top="{place.y - origin.y - 3}px"
        bind:value={labelling.text}
        aria-label={t.diagrams.labelOf(nameOf(labelling.from), nameOf(labelling.to))}
        spellcheck="false"
        use:focused
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            endLabelling(true)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            endLabelling(false)
          }
        }}
        onblur={() => endLabelling(true)}
      />
    {/if}
  </div>
</div>

<style>
  .canvas {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    background: var(--panel-raised);
  }

  /* The grid the boxes snap to, faint. */
  .drawing {
    position: relative;
    background-image: radial-gradient(circle, var(--line-strong) 1px, transparent 1.2px);
    background-size: var(--grid) var(--grid);
  }

  .drawing.dragging {
    cursor: grabbing;
    user-select: none;
  }

  svg {
    position: absolute;
    inset: 0;
    display: block;
    overflow: visible;
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

  .line.highlighted {
    stroke: var(--focus);
    stroke-width: 2;
  }

  /* Drift: a connection the code does not have; dashed where it is only perhaps not there. */
  .line.not-in-code,
  .line.perhaps {
    stroke: var(--problem);
  }

  .line.perhaps {
    stroke-dasharray: 6 4;
  }

  /* Drift the other way: the code has it, the Diagram leaves it out. A click draws it. */
  .line.left-out {
    stroke: var(--problem);
    stroke-dasharray: 3 4;
    opacity: 0.55;
  }

  .line.drawing-line {
    stroke: var(--focus);
    stroke-dasharray: 4 3;
  }

  .hit {
    fill: none;
    stroke: transparent;
    stroke-width: 12;
    cursor: pointer;
  }

  .label {
    cursor: pointer;
  }

  .label .ground {
    fill: var(--panel-raised);
  }

  .label text {
    fill: var(--ink-soft);
    font-size: 12px;
    text-anchor: middle;
  }

  .label.highlighted text {
    fill: var(--focus);
  }

  .box {
    position: absolute;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    padding: 6px 12px;
    border: 1.2px solid var(--ink-faint);
    border-radius: 5px;
    background: var(--paper);
    text-align: left;
    cursor: grab;
    touch-action: none;
  }

  .box:hover {
    background: var(--hover);
  }

  /* Something from elsewhere has a dashed border; the repository a strong one. */
  .box.external {
    border-style: dashed;
  }

  .box.repository {
    border-width: 2px;
  }

  .box.selected {
    border-color: var(--focus);
    background: var(--selected);
  }

  .box.dragged {
    cursor: grabbing;
    box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
  }

  .name {
    font-size: 14px;
    font-weight: 600;
    line-height: 18px;
    white-space: nowrap;
  }

  .description {
    color: var(--ink-soft);
    font-size: 12px;
    line-height: 16px;
    white-space: nowrap;
  }

  .handle {
    position: absolute;
    width: 12px;
    height: 12px;
    border: 2px solid var(--paper);
    border-radius: 50%;
    background: var(--focus);
    cursor: crosshair;
    touch-action: none;
  }

  .label-field {
    position: absolute;
    width: 160px;
    padding: 2px 6px;
    border: 1px solid var(--focus);
    border-radius: 3px;
    background: var(--paper);
    color: var(--ink);
    font-size: 12px;
  }
</style>
