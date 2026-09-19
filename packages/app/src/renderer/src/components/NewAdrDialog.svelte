<script lang="ts">
  import { app } from '../lib/state.svelte'
  import { prefixOf } from '../lib/wording'

  // What the tool needs from a person to start an ADR: a title and a Template. The number,
  // the file name and the Metadata are the tool's business.
  let dialog = $state<HTMLDialogElement>()
  let title = $state<HTMLInputElement>()
  const creating = $derived(app.creating)
  const target = $derived(
    creating?.relation
      ? app.log?.adrs.find((adr) => adr.id === creating.relation!.target)
      : undefined
  )

  $effect(() => {
    if (creating && !dialog?.open) {
      dialog?.showModal()
      title?.focus()
    }
    if (!creating && dialog?.open) dialog.close()
  })

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    void app.create()
  }
</script>

<dialog bind:this={dialog} oncancel={() => app.cancelCreating()} aria-labelledby="new-adr-title">
  {#if creating}
    <form onsubmit={submit}>
      <h1 id="new-adr-title">
        {#if creating.relation?.type === 'supersedes'}
          New ADR that supersedes ADR {target ? prefixOf(target) : ''}
        {:else if creating.relation?.type === 'amends'}
          New ADR that amends ADR {target ? prefixOf(target) : ''}
        {:else}
          New ADR
        {/if}
      </h1>

      {#if creating.relation && target}
        <p class="relation">
          {#if creating.relation.type === 'supersedes'}
            It replaces the decision of “{target.title ?? target.id}” as a whole. That ADR stays as
            it is until the new one is accepted; then it becomes superseded.
          {:else}
            It refines or extends part of “{target.title ?? target.id}”. That ADR keeps its Status;
            once the new one is accepted, it points to it.
          {/if}
        </p>
      {/if}

      <label>
        <span>Title</span>
        <input
          bind:this={title}
          bind:value={creating.title}
          type="text"
          required
          placeholder="What is being decided, in a few words"
        />
      </label>

      <label>
        <span>Template</span>
        <select bind:value={creating.template}>
          {#each creating.templates as template (template.name)}
            <option value={template.name}>
              {template.name}{template.source === 'repository' ? ' (this repository)' : ''}
            </option>
          {/each}
        </select>
      </label>

      <p class="hint">
        The ADR starts as proposed. The tool gives it the next number and its file name; you see the
        file before it is written.
      </p>

      <footer>
        <button type="button" onclick={() => app.cancelCreating()}>Cancel</button>
        <button type="submit" class="primary" disabled={creating.title.trim() === ''}>Create</button
        >
      </footer>
    </form>
  {/if}
</dialog>

<style>
  dialog {
    width: min(520px, calc(100vw - 80px));
    margin: auto;
    padding: 22px 24px 18px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 18px 60px rgb(0 0 0 / 0.28);
    user-select: text;
  }

  dialog::backdrop {
    background: rgb(12 16 24 / 0.42);
  }

  h1 {
    font-size: 16px;
    font-weight: 600;
  }

  .relation,
  .hint {
    margin-top: 8px;
    color: var(--ink-soft);
    line-height: 1.55;
  }

  label {
    display: block;
    margin-top: 16px;
  }

  label span {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    color: var(--ink-soft);
  }

  input,
  select {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  .hint {
    margin-top: 16px;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }

  footer button {
    min-width: 84px;
    padding: 6px 14px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
  }

  footer button:hover {
    background: var(--hover);
  }

  footer .primary {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
    font-weight: 500;
  }

  footer .primary:hover:not(:disabled) {
    border-color: var(--focus);
    background: var(--focus);
  }

  footer button:disabled {
    opacity: 0.5;
  }
</style>
