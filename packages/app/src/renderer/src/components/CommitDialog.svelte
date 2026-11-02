<script lang="ts">
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { logName, prefixOf } from '../lib/wording'
  import FileDiff from './FileDiff.svelte'

  // A commit of one ADR's files (docs/adr/0012-…): what it takes, what it offers to take
  // along, the message, and git's own words when it does not commit.
  let dialog = $state<HTMLDialogElement>()
  const committing = $derived(app.committing)
  const plan = $derived(committing?.plan)
  const files = $derived(
    plan
      ? [
          ...plan.files,
          ...plan.related
            .filter((one) => committing?.include.includes(one.file.path))
            .map((one) => one.file)
        ]
      : []
  )

  // Every changed file it does not take stays as it is: the offered ones left out among them.
  const left = $derived(
    plan ? plan.others + plan.related.length + plan.files.length - files.length : 0
  )

  $effect(() => {
    if (committing && !dialog?.open) dialog?.showModal()
    if (!committing && dialog?.open) dialog.close()
  })

  function oncancel(event: Event): void {
    // Escape while git commits would leave what git says unheard.
    if (committing?.busy) event.preventDefault()
    app.cancelCommit()
  }
</script>

<dialog bind:this={dialog} {oncancel} aria-labelledby="commit-title">
  {#if committing}
    <h1 id="commit-title">{committing.title}</h1>

    {#if plan}
      <p class="summary">{t.commit.summary(files.length, left)}</p>
      {#if plan.branch === undefined}
        <p class="detached">{t.commit.detached}</p>
      {/if}

      {#if plan.related.length > 0}
        <fieldset class="related">
          <legend>{t.commit.related}</legend>
          <p class="hint">{t.commit.relatedHint}</p>
          {#each plan.related as one (one.file.path)}
            <label>
              <input
                type="checkbox"
                checked={committing.include.includes(one.file.path)}
                onchange={() => app.toggleCommitted(one.file.path)}
              />
              {#if one.logPath !== app.log?.path}<span class="log">{logName(one.logPath)}</span
                >{/if}
              <span class="prefix">{prefixOf({ id: one.adrId, number: one.number })}</span>
              {one.title ?? one.adrId}
            </label>
          {/each}
        </fieldset>
      {/if}

      <label class="message">
        <span>{t.commit.message}</span>
        <textarea bind:value={committing.message} rows="3" spellcheck="true"></textarea>
      </label>
      <p class="hooks">{t.commit.hooks}</p>

      <div class="files">
        {#each files as file (file.path)}
          <FileDiff {file} unchanged={t.diff.renamedOnly} />
        {/each}
      </div>

      <footer>
        <button onclick={() => app.cancelCommit()}>{t.cancel}</button>
        <button
          class="primary"
          disabled={committing.busy || committing.message.trim() === ''}
          onclick={() => app.confirmCommit()}
        >
          {committing.busy ? t.commit.committing : t.commit.action}
        </button>
      </footer>
    {:else if committing.made}
      <p class="reason">{t.commit.madeButSaid(committing.made.sha, committing.made.said)}</p>
      <footer>
        <button class="primary" onclick={() => app.cancelCommit()}>{t.close}</button>
      </footer>
    {:else if committing.refused !== undefined}
      <p class="reason">{committing.refused}</p>
      <footer>
        <button onclick={() => app.cancelCommit()}>{t.close}</button>
        <button class="primary" onclick={() => app.startCommit()}>{t.commit.again}</button>
      </footer>
    {:else}
      <p class="summary">{t.commit.asking}</p>
    {/if}
  {/if}
</dialog>

<style>
  dialog {
    width: min(760px, calc(100vw - 80px));
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
  .reason,
  .hooks,
  .hint {
    margin-top: 6px;
    color: var(--ink-soft);
    line-height: 1.55;
  }

  .reason {
    color: var(--ink);
    white-space: pre-wrap;
  }

  .detached {
    margin-top: 6px;
    color: var(--proposed);
    line-height: 1.55;
  }

  .hooks,
  .hint {
    font-size: 12px;
    color: var(--ink-faint);
  }

  .related {
    margin-top: 14px;
    padding: 8px 12px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
  }

  .related legend {
    padding: 0 4px;
    font-weight: 500;
  }

  .related label {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: 6px;
  }

  .log {
    font-size: 12px;
    color: var(--ink-faint);
  }

  .prefix {
    color: var(--ink-soft);
  }

  .message {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 14px;
    font-weight: 500;
  }

  textarea {
    padding: 6px 8px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    font-weight: 400;
    resize: vertical;
  }

  .files {
    flex: 1;
    min-height: 0;
    margin-top: 14px;
    overflow-y: auto;
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
