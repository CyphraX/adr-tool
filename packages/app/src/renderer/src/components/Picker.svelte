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

  const matches = $derived.by((): T[] => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const found = candidates.filter((candidate) => {
      const text = textOf(candidate).toLowerCase()
      return words.every((word) => text.includes(word))
    })
    return (newestFirst ? found.toReversed() : found).slice(0, LIMIT)
  })
  const open = $derived(focused && matches.length > 0)

  function pick(candidate: T | undefined): void {
    if (!candidate) return
    onpick(candidate.id)
    query = ''
    cursor = 0
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      cursor = (cursor + step + matches.length) % Math.max(matches.length, 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      pick(matches[cursor])
    } else if (event.key === 'Escape' && query !== '') {
      // The first Escape empties the search; the dialog closes on the next one.
      event.preventDefault()
      query = ''
    }
  }
</script>

<div class="picker">
  <input
    bind:value={query}
    type="text"
    role="combobox"
    aria-label={label}
    aria-expanded={open}
    aria-controls={`${uid}-matches`}
    aria-autocomplete="list"
    placeholder={candidates.length === 0 ? noneLeft : placeholder}
    disabled={candidates.length === 0}
    oninput={() => (cursor = 0)}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
    {onkeydown}
  />
  {#if open}
    <ul id={`${uid}-matches`} role="listbox">
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
    position: absolute;
    z-index: 1;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
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
