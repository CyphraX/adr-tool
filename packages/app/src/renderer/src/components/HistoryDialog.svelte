<script lang="ts">
  import { WORKING_TREE } from '../../../shared/ipc'
  import { formatDate } from '../lib/history'
  import { app } from '../lib/state.svelte'
  import FileDiff from './FileDiff.svelte'

  // What git knows about one ADR: its commits through every rename on the left, and on the
  // right what the selected one did to the file. Read-only; nothing here writes.
  let dialog = $state<HTMLDialogElement>()
  const history = $derived(app.history)

  $effect(() => {
    if (history && !dialog?.open) dialog?.showModal()
    if (!history && dialog?.open) dialog.close()
  })

  function onkeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    const entries = history?.entries ?? []
    if (step === 0 || entries.length === 0) return
    event.preventDefault()
    const position = entries.findIndex((entry) => entry.id === history?.selectedId)
    const next = entries[Math.max(0, Math.min(entries.length - 1, position + step))]
    if (next && next.id !== history?.selectedId) void app.showHistoryEntry(next.id)
  }
</script>

<dialog bind:this={dialog} oncancel={() => app.closeHistory()} aria-labelledby="history-title">
  {#if history}
    <h1 id="history-title">{history.title}</h1>

    {#if history.entries === undefined}
      <p class="note">Asking git …</p>
    {:else if history.entries.length === 0}
      <p class="note">
        git knows nothing about this file: the folder is not a git repository, git is not installed,
        or the file has never been committed.
      </p>
    {:else}
      {#if history.notFound}
        <p class="note">
          No commit recorded this Correction — it may have been written by hand in one step with
          another one. This is the whole history of the file.
        </p>
      {/if}
      <div class="panes">
        <div
          class="entries"
          role="listbox"
          tabindex="0"
          aria-label="Commits"
          aria-activedescendant={history.selectedId ? `entry-${history.selectedId}` : undefined}
          {onkeydown}
        >
          {#each history.entries as entry (entry.id)}
            <!-- The keyboard is handled by the listbox around the entries. -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              id="entry-{entry.id}"
              class="entry"
              class:selected={entry.id === history.selectedId}
              class:uncommitted={entry.id === WORKING_TREE}
              role="option"
              tabindex="-1"
              aria-selected={entry.id === history.selectedId}
              onclick={() => app.showHistoryEntry(entry.id)}
            >
              <span class="subject" title={entry.subject}>{entry.subject}</span>
              <span class="who">
                {#if entry.id === WORKING_TREE}
                  on disk
                {:else}
                  {entry.author} · {formatDate(entry.date ?? '')}
                  <span class="sha">{entry.id.slice(0, 7)}</span>
                {/if}
              </span>
              {#if entry.renamedFrom !== undefined}
                <span class="who">renamed from {entry.renamedFrom}</span>
              {/if}
            </div>
          {/each}
        </div>

        <div class="change">
          {#if history.change}
            <FileDiff
              file={history.change}
              unchanged="This commit renamed the file. Its text did not change."
            />
          {:else}
            <p class="note">Reading the change …</p>
          {/if}
        </div>
      </div>
    {/if}

    <footer>
      <button class="primary" onclick={() => app.closeHistory()}>Close</button>
    </footer>
  {/if}
</dialog>

<style>
  dialog {
    width: min(1040px, calc(100vw - 80px));
    height: min(680px, calc(100vh - 80px));
    margin: auto;
    padding: 22px 24px 18px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 18px 60px rgb(0 0 0 / 0.28);
  }

  dialog[open] {
    display: flex;
    flex-direction: column;
  }

  dialog::backdrop {
    background: rgb(12 16 24 / 0.42);
  }

  h1 {
    font-size: 16px;
    font-weight: 600;
  }

  .note {
    margin-top: 10px;
    color: var(--ink-soft);
    line-height: 1.55;
  }

  .panes {
    flex: 1;
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 16px;
    min-height: 0;
    margin-top: 16px;
  }

  .entries {
    overflow-y: auto;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel-raised);
  }

  .entry {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 7px 10px;
    border-bottom: 1px solid var(--line);
  }

  .entry:hover {
    background: var(--hover);
  }

  .entry.selected {
    background: var(--selected);
  }

  .subject {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .uncommitted .subject {
    color: var(--proposed);
  }

  .who {
    font-size: 12px;
    color: var(--ink-soft);
  }

  .sha {
    margin-left: 4px;
    font-family: var(--code);
    font-size: 11.5px;
    color: var(--ink-faint);
  }

  .change {
    min-width: 0;
    overflow-y: auto;
    user-select: text;
    cursor: auto;
  }

  .change .note {
    margin-top: 0;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 18px;
  }

  footer button {
    min-width: 84px;
    padding: 6px 14px;
    border: 1px solid var(--ink);
    border-radius: 4px;
    background: var(--ink);
    color: var(--paper);
    font-weight: 500;
  }

  footer button:hover {
    border-color: var(--focus);
    background: var(--focus);
  }
</style>
