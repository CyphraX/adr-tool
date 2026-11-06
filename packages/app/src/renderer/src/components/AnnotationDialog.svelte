<script lang="ts">
  import { ANNOTATION_TYPES, type AnnotationType } from '@adr-tool/review'
  import type { Adr } from '@adr-tool/core'
  import { citationOf, citedLines, type CitedLine } from '../lib/review'
  import { reviewForms } from '../lib/review-tab.svelte'
  import { reviewing } from '../lib/reviewing.svelte'
  import { app, statusKey } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { logName, prefixOf } from '../lib/wording'
  import Picker from './Picker.svelte'
  import StatusMark from './StatusMark.svelte'

  // What a new Annotation needs from a person (docs/plan-vision.md, part 9): its type, its text,
  // who writes it — what git says, unless changed — and the ADRs it cites, on the lines selected
  // in a code viewer. Preview plans it in the main process; the dialog steps aside while the
  // change is shown, and is back as it was when the change is cancelled.
  let dialog = $state<HTMLDialogElement>()
  const composing = $derived(reviewForms.composing)
  const shown = $derived(composing !== undefined && app.review === undefined)
  const repository = $derived(
    app.tabs.find((tab) => tab.repository.id === composing?.repositoryId)?.repository.repository
  )
  const logs = $derived(repository?.logs.length ?? 0)

  interface Citable {
    id: string
    adr: Adr
    log: string
  }

  /** The ADRs it cites so far, each with the ADR it names. */
  const cited = $derived<CitedLine[]>(
    composing && repository ? citedLines(composing.cites, repository) : []
  )

  const citable = $derived.by((): Citable[] => {
    if (!composing || !repository) return []
    return repository.logs.flatMap((log) =>
      log.adrs
        .map((adr) => ({ id: citationOf(repository, log.path, adr.id), adr, log: log.path }))
        .filter((candidate) => !composing.cites.includes(candidate.id))
    )
  })

  const adrOf = (logPath: string, id: string): Adr | undefined =>
    repository?.logs.find((log) => log.path === logPath)?.adrs.find((adr) => adr.id === id)

  $effect(() => {
    if (shown && !dialog?.open) {
      dialog?.showModal()
      dialog?.querySelector('textarea')?.focus()
    }
    if (!shown && dialog?.open) dialog.close()
  })

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    void reviewing.submitComposing()
  }
</script>

<dialog
  bind:this={dialog}
  oncancel={() => reviewing.cancelComposing()}
  aria-labelledby="annotation-title"
>
  {#if composing}
    <form onsubmit={submit}>
      <h1 id="annotation-title">
        {t.annotations.annotate(composing)}
        <code class="of">{composing.path}</code>
      </h1>

      <div class="fields">
        <div class="quote" role="group" aria-label={t.annotations.detail.quoted}>
          {#each composing.quote as line, position (position)}
            <span class="number" aria-hidden="true">{composing.start + position}</span><span
              class="line">{line}</span
            >
          {/each}
        </div>

        <fieldset>
          <legend>{t.annotations.dialog.type}</legend>
          <div class="types">
            {#each ANNOTATION_TYPES as type (type)}
              <label class="type" class:chosen={composing.type === type}>
                <input
                  type="radio"
                  name="annotation-type"
                  value={type}
                  checked={composing.type === type}
                  onchange={() => (composing.type = type as AnnotationType)}
                />
                {t.annotations.types[type]}
              </label>
            {/each}
          </div>
        </fieldset>

        <label class="field">
          <span>{t.annotations.dialog.text}</span>
          <textarea
            bind:value={composing.text}
            rows="6"
            required
            placeholder={t.annotations.dialog.textPlaceholder}
          ></textarea>
          <span class="hint">{t.annotations.dialog.textHint}</span>
        </label>

        <label class="field">
          <span>{t.annotations.dialog.author}</span>
          <input
            bind:value={composing.author}
            type="text"
            required
            title={t.annotations.detail.authorHint}
          />
          <span class="hint">{t.annotations.detail.authorHint}</span>
        </label>

        <div class="field">
          <span>{t.annotations.dialog.cites}</span>
          {#if cited.length > 0}
            <ul aria-label={t.annotations.dialog.cites}>
              {#each cited as line (line.item)}
                {@const adr = line.found && adrOf(line.found.logPath, line.found.id)}
                <li>
                  {#if adr && line.found}
                    <StatusMark status={statusKey(adr)} />
                    {#if logs > 1}<span class="log">{logName(line.found.logPath)}</span>{/if}
                    <span class="prefix">{prefixOf(adr)}</span>
                    <span class="title">{adr.title ?? adr.id}</span>
                  {:else}
                    <span class="title">{line.item}</span>
                  {/if}
                  <button
                    type="button"
                    aria-label={t.annotations.dialog.remove(line.item)}
                    onclick={() => composing.cites.splice(composing.cites.indexOf(line.item), 1)}
                    >×</button
                  >
                </li>
              {/each}
            </ul>
          {/if}
          <Picker
            candidates={citable}
            label={t.annotations.dialog.cites}
            placeholder={t.annotations.detail.citePlaceholder}
            noneLeft={t.annotations.detail.noAdrLeft}
            textOf={({ id, adr }) => `${id} ${prefixOf(adr)} ${adr.title ?? ''}`}
            newestFirst
            onpick={(id) => composing.cites.push(id)}
          >
            {#snippet option({ adr, log })}
              <StatusMark status={statusKey(adr)} />
              {#if logs > 1}<span class="log">{logName(log)}</span>{/if}
              <span class="prefix">{prefixOf(adr)}</span>
              <span class="title">{adr.title ?? adr.id}</span>
            {/snippet}
          </Picker>
          <span class="hint">{t.annotations.dialog.citesHint}</span>
        </div>
      </div>

      <footer>
        <button type="button" onclick={() => reviewing.cancelComposing()}>{t.cancel}</button>
        <button
          type="submit"
          class="primary"
          disabled={composing.text.trim() === '' || composing.author.trim() === ''}
        >
          {t.annotations.dialog.preview}
        </button>
      </footer>
    </form>
  {/if}
</dialog>

<style>
  dialog {
    width: min(600px, calc(100vw - 80px));
    max-height: calc(100vh - 40px);
    margin: auto;
    padding: 22px 0 18px;
    /* The matches of a picker are placed in the window and hang out over the edge. */
    overflow: visible;
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

  form {
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 80px);
  }

  h1,
  footer {
    flex: none;
    padding: 0 24px;
  }

  h1 {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
    font-size: 16px;
    font-weight: 600;
  }

  .of {
    font-family: var(--code);
    font-size: 12px;
    font-weight: 400;
    color: var(--ink-soft);
    overflow-wrap: anywhere;
  }

  .fields {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 24px 2px;
  }

  .quote {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    column-gap: 12px;
    max-height: 9.6em;
    margin-top: 12px;
    padding: 6px 10px;
    overflow: auto;
    border: 1px solid var(--line);
    border-left: 3px solid var(--waiting);
    border-radius: 4px;
    background: var(--panel-raised);
    font-family: var(--code);
    font-size: 12px;
    line-height: 1.6;
  }

  .number {
    color: var(--ink-faint);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .line {
    white-space: pre;
  }

  fieldset {
    margin: 16px 0 0;
    padding: 0;
    border: none;
  }

  legend,
  .field > span:first-child {
    display: block;
    margin-bottom: 5px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-soft);
  }

  .types {
    display: flex;
    gap: 6px;
  }

  .type {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 12px 3px 8px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
  }

  .type.chosen {
    border-color: var(--ink);
    background: var(--selected);
  }

  .field {
    display: block;
    margin-top: 16px;
  }

  textarea,
  input[type='text'] {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  textarea {
    resize: vertical;
    font-family: var(--code);
    font-size: 12.5px;
    line-height: 1.5;
  }

  .hint {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--ink-faint);
    line-height: 1.5;
  }

  ul {
    list-style: none;
    padding: 0;
    margin-bottom: 5px;
  }

  li {
    display: flex;
    align-items: baseline;
    gap: 7px;
    padding: 3px 4px 3px 8px;
    border-radius: 3px;
  }

  li:hover {
    background: var(--hover);
  }

  li :global(svg) {
    flex: none;
    align-self: center;
  }

  .prefix {
    flex: none;
    color: var(--ink-soft);
  }

  .log {
    flex: none;
    font-size: 12px;
    color: var(--ink-faint);
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  li button {
    flex: none;
    width: 18px;
    height: 18px;
    border-radius: 3px;
    line-height: 1;
    color: var(--ink-faint);
  }

  li button:hover {
    background: var(--panel);
    color: var(--ink);
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
