<script lang="ts">
  // The line between two panes, to drag. It resizes the pane in front of it, and knows
  // nothing else: how wide that pane may get is its owner's business. Arrow keys move it for
  // those who do not drag, and a double click gives the pane back to the layout.
  let {
    label,
    min,
    max,
    onresize,
    onreset
  }: {
    label: string
    min: number
    max: number
    onresize: (width: number) => void
    onreset: () => void
  } = $props()

  const STEP = 16

  let divider = $state<HTMLDivElement>()
  let width = $state(0)
  let dragging = $state<{ from: number; width: number } | undefined>(undefined)

  const measure = (): number =>
    divider?.previousElementSibling?.getBoundingClientRect().width ?? width

  // What a screen reader says the separator stands at: the pane's width, whoever set it.
  $effect(() => {
    const pane = divider?.previousElementSibling
    if (!pane) return
    const observer = new ResizeObserver(() => (width = Math.round(measure())))
    observer.observe(pane)
    return () => observer.disconnect()
  })

  function onpointerdown(event: PointerEvent): void {
    if (event.button !== 0) return
    // No text gets selected on the way — and the focus, which that would have given, is given.
    event.preventDefault()
    divider?.focus()
    divider?.setPointerCapture(event.pointerId)
    dragging = { from: event.clientX, width: measure() }
  }

  function onpointermove(event: PointerEvent): void {
    if (dragging) onresize(dragging.width + event.clientX - dragging.from)
  }

  function onkeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? STEP : event.key === 'ArrowLeft' ? -STEP : 0
    if (step !== 0) onresize(measure() + step)
    else if (event.key === 'Home') onresize(min)
    else if (event.key === 'End') onresize(max)
    else if (event.key === 'Enter') onreset()
    else return
    event.preventDefault()
  }
</script>

<!-- A separator that can be moved is a widget: it takes the focus and the keys. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  bind:this={divider}
  class="divider"
  class:dragging={dragging !== undefined}
  role="separator"
  aria-orientation="vertical"
  aria-label={label}
  aria-valuenow={width}
  aria-valuemin={min}
  aria-valuemax={max}
  tabindex="0"
  {onpointerdown}
  {onpointermove}
  onpointerup={() => (dragging = undefined)}
  onpointercancel={() => (dragging = undefined)}
  ondblclick={onreset}
  {onkeydown}
></div>

<style>
  /* No width of its own: the panes keep their borders, and the grip lies over them. */
  .divider {
    position: relative;
    z-index: 2;
    width: 0;
    outline: none;
  }

  .divider::before {
    content: '';
    position: absolute;
    inset: 0 -4px 0 -5px;
    cursor: col-resize;
  }

  .divider::after {
    content: '';
    position: absolute;
    inset: 0 0 0 -2px;
    width: 2px;
    background: transparent;
    transition: background 120ms;
  }

  .divider:hover::after,
  .divider.dragging::after,
  .divider:focus-visible::after {
    background: var(--focus);
  }
</style>
