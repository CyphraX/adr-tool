<script lang="ts" generics="T extends { id: string }">
  import type { Snippet } from 'svelte'

  // Find one of the candidates by words of its text, and pick it.
  let {
    candidates,
    label,
    placeholder,
    noneLeft,
    textOf,
    option,
    newestFirst = false,
    onpick
  }: {
    candidates: readonly T[]
    label: string
    placeholder: string
    /** What the field says when there is nothing left to pick. */
    noneLeft: string
    /** What a search is matched against. */
    textOf: (candidate: T) => string
    /** How a match is shown. */
    option: Snippet<[T]>
    /** The last candidates first, as the list of ADRs shows them. */
    newestFirst?: boolean
    onpick: (id: string) => void
  } = $props()

  const LIMIT = 6
  const uid = $props.id()
  let query = $state('')
  let focused = $state(false)
  let cursor = $state(0)
  /**
   * Something was just picked: the matches stay closed until the person types or asks for them
   * with an arrow, so that they do not cover what comes below the field — a dialog's buttons.
   */
  let picked = $state(false)

  const matches = $derived.by((): T[] => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const found = candidates.filter((candidate) => {
      const text = textOf(candidate).toLowerCase()
      return words.every((word) => text.includes(word))
    })
    return (newestFirst ? found.toReversed() : found).slice(0, LIMIT)
  })
  const open = $derived(focused && !picked && matches.length > 0)

  // The matches stand over everything around the field, also over the edge of a dialog whose
  // lists scroll: they are placed in the window, below the field, or above it where the space
  // below is short. While they are open they follow the field, whatever moves it — a scroll, the
  // window, a pick that makes the list above the field longer — and they are hidden while the
  // field is scrolled out of sight.
  let field = $state<HTMLInputElement | undefined>(undefined)
  type Place = { left: number; width: number; top?: number; bottom?: number }
  let place = $state<Place>()
  const ROOM = 200

  /** The nearest ancestor that scrolls, whose edges the field can be scrolled past. */
  function scrollArea(from: HTMLElement): HTMLElement | undefined {
    for (let node = from.parentElement; node; node = node.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(node).overflowY)) return node
    }
    return undefined
  }

  function measure(area: HTMLElement | undefined): Place | undefined {
    if (!field) return undefined
    const box = field.getBoundingClientRect()
    const edges = area?.getBoundingClientRect()
    if (edges && (box.bottom <= edges.top || box.top >= edges.bottom)) return undefined
    const below = window.innerHeight - box.bottom
    return below >= ROOM || below >= box.top
      ? { left: box.left, width: box.width, top: box.bottom + 2 }
      : { left: box.left, width: box.width, bottom: window.innerHeight - box.top + 2 }
  }

  const same = (a: Place | undefined, b: Place | undefined): boolean =>
    a === b ||
    (a !== undefined &&
      b !== undefined &&
      a.left === b.left &&
      a.width === b.width &&
      a.top === b.top &&
      a.bottom === b.bottom)

  $effect(() => {
    if (!open || !field) return
    const area = scrollArea(field)
    // Compared with what was set last, not read from `place`: this effect does not depend on it.
    let last: Place | undefined
    let frame = 0
    const follow = (): void => {
      const next = measure(area)
      if (!same(next, last)) place = last = next
      frame = requestAnimationFrame(follow)
    }
    follow()
    return () => cancelAnimationFrame(frame)
  })

  function pick(candidate: T | undefined): void {
    if (!candidate) return
    onpick(candidate.id)
    query = ''
    cursor = 0
    picked = true
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (picked) {
        picked = false
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      cursor = (cursor + step + matches.length) % Math.max(matches.length, 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (!picked) pick(matches[cursor])
    } else if (event.key === 'Escape' && query !== '') {
      // The first Escape empties the search; the dialog closes on the next one.
      event.preventDefault()
      query = ''
    }
  }
</script>

<div class="picker">
  <input
    bind:this={field}
    bind:value={query}
    type="text"
    role="combobox"
    aria-label={label}
    aria-expanded={open && place !== undefined}
    aria-controls={`${uid}-matches`}
    aria-autocomplete="list"
    placeholder={candidates.length === 0 ? noneLeft : placeholder}
    disabled={candidates.length === 0}
    oninput={() => {
      cursor = 0
      picked = false
    }}
    onfocus={() => {
      focused = true
      picked = false
    }}
    onblur={() => (focused = false)}
    {onkeydown}
  />
  {#if open && place}
    <ul
      id={`${uid}-matches`}
      role="listbox"
      style:left="{place.left}px"
      style:width="{place.width}px"
      style:top={place.top === undefined ? undefined : `${place.top}px`}
      style:bottom={place.bottom === undefined ? undefined : `${place.bottom}px`}
    >
      {#each matches as candidate, position (candidate.id)}
        <!-- mousedown, not click: the input must not lose the focus before the pick. -->
        <li
          role="option"
          aria-selected={position === cursor}
          class:cursor={position === cursor}
          onmousedown={(event) => {
            event.preventDefault()
            pick(candidate)
          }}
          onmousemove={() => (cursor = position)}
        >
          {@render option(candidate)}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .picker {
    position: relative;
  }

  input {
    width: 100%;
    padding: 5px 8px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  input:disabled {
    border-style: dashed;
    color: var(--ink-faint);
  }

  ul {
    position: fixed;
    z-index: 1;
    padding: 3px;
    list-style: none;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
  }

  li {
    display: flex;
    align-items: baseline;
    gap: 7px;
    padding: 4px 7px;
    border-radius: 3px;
  }

  li :global(svg) {
    flex: none;
    align-self: center;
  }

  .cursor {
    background: var(--selected);
  }
</style>
