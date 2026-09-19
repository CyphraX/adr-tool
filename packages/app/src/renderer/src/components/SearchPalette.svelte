<script lang="ts">
  import { search, type SearchHit } from '../lib/search'
  import { app, statusKey } from '../lib/state.svelte'
  import { STATUS_LABEL, prefixOf } from '../lib/wording'
  import StatusMark from './StatusMark.svelte'

  // Full-text search with quick jump: type, arrow, Enter. It searches every Decision Log of
  // the repository in front, in what is already loaded — nothing is read for it.
  const LIMIT = 12

  let dialog = $state<HTMLDialogElement>()
  let input = $state<HTMLInputElement>()
  let position = $state(0)

  const logs = $derived(app.active?.repository.repository.logs ?? [])

  interface Found extends SearchHit {
    logPath: string
  }

  const found = $derived.by((): Found[] => {
    const query = app.searching?.query ?? ''
    // The log in view first: that is where the person is looking.
    const ordered = [...logs].sort(
      (a, b) => Number(b.path === app.log?.path) - Number(a.path === app.log?.path)
    )
    return ordered
      .flatMap((log) => search(log.adrs, query).map((hit) => ({ ...hit, logPath: log.path })))
      .slice(0, LIMIT)
  })

  $effect(() => {
    if (app.searching && !dialog?.open) {
      dialog?.showModal()
      input?.select()
    }
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
    position = (position + step + found.length) % found.length
    document.getElementById(`hit-${position}`)?.scrollIntoView({ block: 'nearest' })
  }
</script>

<dialog bind:this={dialog} oncancel={() => app.stopSearching()} aria-label="Search the ADRs">
  {#if app.searching}
    <input
      bind:this={input}
      bind:value={app.searching.query}
      oninput={() => (position = 0)}
      {onkeydown}
      type="search"
      placeholder="Search titles, text, tags, people — or type a number"
      spellcheck="false"
      role="combobox"
      aria-expanded={found.length > 0}
      aria-controls="hits"
      aria-activedescendant={found.length > 0 ? `hit-${position}` : undefined}
    />

    {#if found.length > 0}
      <div id="hits" class="hits" role="listbox" aria-label="ADRs found">
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
            onmousemove={() => (position = index)}
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
    {:else if app.searching.query.trim() !== ''}
      <p class="none">No ADR has all of these words.</p>
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

  .none {
    padding: 12px 18px 16px;
    border-top: 1px solid var(--line);
    color: var(--ink-soft);
  }
</style>
