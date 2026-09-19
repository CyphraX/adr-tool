<script lang="ts">
  // A list of short free texts: tags, decision-makers. Enter adds what was typed, and so does
  // leaving the field, so that nothing typed is lost on the way to the Save button.
  let {
    items = $bindable(),
    suggestions,
    label,
    placeholder
  }: { items: string[]; suggestions: string[]; label: string; placeholder: string } = $props()

  const uid = $props.id()
  let text = $state('')
  const open = $derived(suggestions.filter((suggestion) => !items.includes(suggestion)))

  function add(): void {
    const item = text.trim()
    text = ''
    if (item !== '' && !items.includes(item)) items.push(item)
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      add()
    } else if (event.key === 'Backspace' && text === '' && items.length > 0) {
      items.pop()
    }
  }

  function oninput(event: Event): void {
    // Picking a suggestion is a whole value, not the start of one.
    if ((event as InputEvent).inputType === 'insertReplacementText') add()
  }
</script>

<div class="chips" role="group" aria-label={label}>
  {#each items as item (item)}
    <span class="chip">
      {item}
      <button aria-label={`Remove ${item}`} onclick={() => items.splice(items.indexOf(item), 1)}
        >×</button
      >
    </span>
  {/each}
  <input
    bind:value={text}
    type="text"
    list={`${uid}-suggestions`}
    aria-label={`Add to ${label}`}
    {placeholder}
    {onkeydown}
    {oninput}
    onblur={add}
  />
  <datalist id={`${uid}-suggestions`}>
    {#each open as suggestion (suggestion)}
      <option value={suggestion}></option>
    {/each}
  </datalist>
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    min-height: 32px;
    padding: 4px 6px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .chips:focus-within {
    outline: 2px solid var(--focus);
    outline-offset: -1px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 3px 1px 8px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--panel);
  }

  .chip button {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    line-height: 1;
    color: var(--ink-faint);
  }

  .chip button:hover {
    background: var(--hover);
    color: var(--ink);
  }

  input {
    flex: 1;
    min-width: 120px;
    padding: 2px;
    border: 0;
    outline: none;
    background: none;
    color: var(--ink);
    font: inherit;
  }
</style>
