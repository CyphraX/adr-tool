<script lang="ts">
  import { searchLogs } from '../lib/search'
  import { app, statusKey } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { STATUS_LABEL, prefixOf } from '../lib/wording'
  import StatusMark from './StatusMark.svelte'

  // Full-text search with quick jump: type, arrow, Enter. It searches every Decision Log of
  // the repository in front, in what is already loaded — nothing is read for it.
  const LIMIT = 12

  let dialog = $state<HTMLDialogElement>()
  let chosen = $state(0)

  const logs = $derived(app.active?.repository.repository.logs ?? [])
  const all = $derived(searchLogs(logs, app.searching?.query ?? '', app.log?.path))
  const found = $derived(all.slice(0, LIMIT))
  // The files can change under an open palette, and the list with them.
  const position = $derived(Math.min(chosen, found.length - 1))

  $effect(() => {
    if (app.searching && !dialog?.open) dialog?.showModal()
    if (!app.searching && dialog?.open) dialog.close()
  })

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      const hit = found[position]
      if (hit) app.jumpTo(hit.logPath, hit.adr.id)
      return
    }
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (step === 0 || found.length === 0) return
    event.preventDefault()
    chosen = (position + step + found.length) % found.length
    document.getElementById(`hit-${chosen}`)?.scrollIntoView({ block: 'nearest' })
  }
</script>

<dialog bind:this={dialog} oncancel={() => app.stopSearching()} aria-label={t.searching.label}>
  {#if app.searching}
    <input
      bind:value={app.searching.query}
      oninput={() => (chosen = 0)}
      {onkeydown}
      type="search"
      placeholder={t.searching.placeholder}
      spellcheck="false"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={found.length > 0}
      aria-controls={found.length > 0 ? 'hits' : undefined}
      aria-activedescendant={found.length > 0 ? `hit-${position}` : undefined}
    />

    {#if found.length > 0}
      <div id="hits" class="hits" role="listbox" aria-label={t.searching.found}>
        {#each found as hit, index (hit.logPath + hit.adr.id)}
          {@const status = statusKey(hit.adr)}
          <!-- The keyboard is handled by the input above. -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            id="hit-{index}"
            class="hit"
            class:current={index === position}
            role="option"
            tabindex="-1"
            aria-selected={index === position}
            onclick={() => app.jumpTo(hit.logPath, hit.adr.id)}
            onmousemove={() => (chosen = index)}
          >
            <span class="line">
              <StatusMark {status} />
              <span class="prefix">{prefixOf(hit.adr)}</span>
              <span class="title">{hit.adr.title ?? hit.adr.id}</span>
              <span class="where">
                {logs.length > 1 ? `${hit.logPath} · ` : ''}{hit.adr.metadata.rawStatus ??
                  STATUS_LABEL[status]}
              </span>
            </span>
            {#if hit.excerpt.length > 0}
              <span class="excerpt">
                {#each hit.excerpt as part, nth (nth)}{#if part.match}<mark>{part.text}</mark
                    >{:else}{part.text}{/if}{/each}
              </span>
            {/if}
          </div>
        {/each}
      </div>
      {#if all.length > found.length}
        <p class="more">{t.searching.more(found.length, all.length)}</p>
      {/if}
    {:else if app.searching.query.trim() !== ''}
      <p class="none">{t.searching.none}</p>
    {/if}
  {/if}
</dialog>

<style>
  dialog {
    width: min(640px, calc(100vw - 80px));
    max-height: min(560px, calc(100vh - 120px));
    margin: 60px auto auto;
    padding: 0;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 18px 60px rgb(0 0 0 / 0.28);
    overflow: hidden;
  }

  dialog[open] {
    display: flex;
    flex-direction: column;
  }

  dialog::backdrop {
    background: rgb(12 16 24 / 0.32);
  }

  input {
    flex: none;
    width: 100%;
    padding: 14px 18px;
    border: 0;
    outline: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 15px;
  }

  input::-webkit-search-cancel-button {
    display: none;
  }

  .hits {
    overflow-y: auto;
    border-top: 1px solid var(--line);
    padding: 4px 0;
  }

  .hit {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 18px;
  }

  .hit.current {
    background: var(--selected);
  }

  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .line :global(svg) {
    flex: none;
  }

  .prefix {
    flex: none;
    color: var(--ink-soft);
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .where {
    flex: none;
    font-size: 12px;
    color: var(--ink-faint);
  }

  .excerpt {
    padding-left: 22px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 12px;
    color: var(--ink-soft);
  }

  mark {
    border-radius: 2px;
    background: color-mix(in srgb, var(--proposed) 30%, transparent);
    color: var(--ink);
  }

  .more {
    flex: none;
    padding: 6px 18px 8px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--ink-faint);
  }

  .none {
    padding: 12px 18px 16px;
    border-top: 1px solid var(--line);
    color: var(--ink-soft);
  }
</style>
