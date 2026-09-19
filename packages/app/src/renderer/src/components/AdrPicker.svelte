<script lang="ts">
  import type { Adr } from '@adr-tool/core'
  import { statusKey } from '../lib/state.svelte'
  import { prefixOf } from '../lib/wording'
  import StatusMark from './StatusMark.svelte'

  // Find an ADR by its number or by words of its title, and pick it.
  let {
    candidates,
    label,
    onpick
  }: { candidates: Adr[]; label: string; onpick: (id: string) => void } = $props()

  const LIMIT = 6
  const uid = $props.id()
  let query = $state('')
  let focused = $state(false)
  let cursor = $state(0)

  const matches = $derived.by((): Adr[] => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const found = candidates.filter((adr) => {
      const text = `${adr.id} ${prefixOf(adr)} ${adr.title ?? ''}`.toLowerCase()
      return words.every((word) => text.includes(word))
    })
    // Newest first, like the list.
    return found.toReversed().slice(0, LIMIT)
  })
  const open = $derived(focused && matches.length > 0)

  function pick(adr: Adr | undefined): void {
    if (!adr) return
    onpick(adr.id)
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
    placeholder={candidates.length === 0 ? 'No ADR left to add' : 'Add an ADR: number or title'}
    disabled={candidates.length === 0}
    oninput={() => (cursor = 0)}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
    {onkeydown}
  />
  {#if open}
    <ul id={`${uid}-matches`} role="listbox">
      {#each matches as adr, position (adr.id)}
        <!-- mousedown, not click: the input must not lose the focus before the pick. -->
        <li
          role="option"
          aria-selected={position === cursor}
          class:cursor={position === cursor}
          onmousedown={(event) => {
            event.preventDefault()
            pick(adr)
          }}
          onmousemove={() => (cursor = position)}
        >
          <StatusMark status={statusKey(adr)} />
          <span class="prefix">{prefixOf(adr)}</span>
          <span class="title">{adr.title ?? adr.id}</span>
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

  .prefix {
    flex: none;
    color: var(--ink-soft);
  }

  .title {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>
