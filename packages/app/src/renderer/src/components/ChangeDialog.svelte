<script lang="ts">
  import { diffLines } from '../lib/diff'
  import { app } from '../lib/state.svelte'

  // One dialog for the three things that can follow a click on an action: the change to
  // review, the reason it cannot be done, or the reason it could not be written.
  let dialog = $state<HTMLDialogElement>()
  let confirm = $state<HTMLButtonElement>()
  const review = $derived(app.review)

  const SIGN = { added: '+', removed: '−', context: ' ', gap: '' } as const

  $effect(() => {
    if (review && !dialog?.open) dialog?.showModal()
    if (!review && dialog?.open) dialog.close()
    // Reviewed and then Enter: the confirming button has the focus, not the scrolling diff.
    if (review) confirm?.focus()
  })
</script>

<dialog bind:this={dialog} oncancel={() => app.dismissReview()} aria-labelledby="change-title">
  {#if review}
    <h1 id="change-title">{review.title}</h1>

    {#if review.kind === 'change'}
      {@const files = review.change.changeSet.files}
      {@const created = files.filter((file) => file.creates).length}
      {@const changed = files.length - created}
      <p class="summary">
        {#if created > 0}
          This creates {created === 1 ? 'one file' : `${created} files`}{changed > 0 ? ',' : '.'}
        {/if}
        {#if changed > 0}
          {created > 0 ? 'and changes' : 'This changes'}
          {changed === 1 ? 'one file' : `${changed} files`}. Nothing else in
          {changed === 1 ? 'it' : 'them'} is touched.
        {/if}
      </p>

      {#if review.change.warnings.length > 0}
        <div class="warnings">
          <p>This looks like more than a Correction:</p>
          <ul>
            {#each review.change.warnings as warning (warning)}
              <li>{warning}</li>
            {/each}
          </ul>
          <p>
            If it changes what was decided, cancel and write a new ADR that amends or supersedes
            this one. If it does not, save.
          </p>
        </div>
      {/if}

      <div class="files">
        {#each files as file (file.path)}
          <section>
            <h2>{file.path}{file.creates ? ' — new file' : ''}</h2>
            <div class="diff">
              {#each diffLines(file) as line, position (position)}
                <span class={line.kind}>{SIGN[line.kind]} {line.text}</span>
              {/each}
            </div>
          </section>
        {/each}
      </div>

      <footer>
        <button onclick={() => app.dismissReview()}>Cancel</button>
        <button
          bind:this={confirm}
          class="primary"
          disabled={review.applying}
          onclick={() => app.applyReview()}
        >
          {review.action}
        </button>
      </footer>
    {:else if review.kind === 'confirm'}
      <p class="reason">{review.reason}</p>
      <footer>
        <button bind:this={confirm} onclick={() => app.dismissReview()}>Keep editing</button>
        <button class="primary" onclick={() => app.confirmReview()}>{review.action}</button>
      </footer>
    {:else}
      <p class="reason">{review.reason}</p>
      <footer>
        <button bind:this={confirm} class="primary" onclick={() => app.dismissReview()}>
          Close
        </button>
      </footer>
    {/if}
  {/if}
</dialog>

<style>
  dialog {
    width: min(720px, calc(100vw - 80px));
    max-height: calc(100vh - 80px);
    margin: auto;
    padding: 22px 24px 18px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 18px 60px rgb(0 0 0 / 0.28);
    user-select: text;
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

  .summary,
  .reason {
    margin-top: 6px;
    color: var(--ink-soft);
    line-height: 1.55;
  }

  .reason {
    color: var(--ink);
  }

  .warnings {
    margin-top: 14px;
    padding: 10px 14px;
    border-left: 3px solid var(--proposed);
    background: color-mix(in srgb, var(--proposed) 10%, transparent);
    line-height: 1.55;
  }

  .warnings ul {
    margin: 4px 0;
    padding-left: 1.3em;
  }

  .files {
    flex: 1;
    min-height: 0;
    margin-top: 16px;
    overflow-y: auto;
  }

  section + section {
    margin-top: 14px;
  }

  h2 {
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 500;
    color: var(--ink-soft);
    background: var(--panel);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 4px 4px 0 0;
  }

  .diff {
    overflow-x: auto;
    padding: 6px 0;
    border: 1px solid var(--line);
    border-radius: 0 0 4px 4px;
    font-family: var(--code);
    font-size: 12.5px;
    line-height: 1.6;
    font-variant-numeric: normal;
  }

  .diff span {
    display: block;
    padding: 0 10px;
    white-space: pre;
  }

  .added {
    background: color-mix(in srgb, var(--accepted) 16%, transparent);
  }

  .removed {
    background: color-mix(in srgb, var(--rejected) 14%, transparent);
  }

  .context {
    color: var(--ink-soft);
  }

  .gap {
    height: 8px;
    border-top: 1px dashed var(--line);
    margin-top: 6px;
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

  footer .primary:hover {
    border-color: var(--focus);
    background: var(--focus);
  }

  footer button:disabled {
    opacity: 0.55;
  }
</style>
