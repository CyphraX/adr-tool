<script lang="ts">
  import type { Adr } from '@adr-tool/core'
  import { anchorStateOf, citationOf, citedBy, firstLine, placeOf } from '../lib/review'
  import { reviewForms } from '../lib/review-tab.svelte'
  import { reviewing } from '../lib/reviewing.svelte'
  import { wordReviewProblem } from '../lib/said'
  import { app, statusKey } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { codeSpans, logName, prefixOf } from '../lib/wording'
  import MarkdownDocument from './MarkdownDocument.svelte'
  import Picker from './Picker.svelte'
  import StatusMark from './StatusMark.svelte'

  // One Annotation (docs/plan-vision.md, part 9): what it is and who wrote it, what can be done
  // with it — Reply, Resolve or Reopen, Update the Anchor, Attach again —, its code: the quoted
  // lines, and where they are now; its text, its Replies, and the ADRs it cites. Everything it
  // writes is previewed in the change dialog first.
  const tab = $derived(app.active)
  const review = $derived(tab?.review)
  const known = $derived(review?.known)
  const annotation = $derived(
    known?.annotations.find((candidate) => candidate.id === review?.selectedId)
  )
  const repository = $derived(tab?.repository.repository)
  const anchor = $derived(annotation ? anchorStateOf(annotation) : 'unread')
  const place = $derived(annotation && placeOf(annotation))
  const found = $derived(annotation?.found)
  const cited = $derived(annotation && repository ? citedBy(annotation, repository) : [])
  const problems = $derived(
    annotation
      ? (known?.problems ?? []).filter(
          (problem) =>
            'annotation' in problem &&
            problem.annotation === annotation.id &&
            problem.kind !== 'orphaned'
        )
      : []
  )
  const replying = $derived(
    reviewForms.replying &&
      reviewForms.replying.id === annotation?.id &&
      reviewForms.replying.repositoryId === tab?.repository.id
      ? reviewForms.replying
      : undefined
  )
  const attachingThis = $derived(annotation !== undefined && review?.attaching === annotation.id)

  interface Citable {
    /** As `cites` would name it. */
    id: string
    adr: Adr
    log: string
  }

  /** The ADRs of every Decision Log that the Annotation does not cite yet. */
  const citable = $derived.by((): Citable[] => {
    if (!annotation || !repository) return []
    const taken = new Set(
      cited.flatMap((line) => (line.found ? [`${line.found.logPath}\n${line.found.id}`] : []))
    )
    return repository.logs.flatMap((log) =>
      log.adrs
        .filter((adr) => !taken.has(`${log.path}\n${adr.id}`))
        .map((adr) => ({ id: citationOf(repository, log.path, adr.id), adr, log: log.path }))
    )
  })

  const adrOf = (logPath: string, id: string): Adr | undefined =>
    repository?.logs.find((log) => log.path === logPath)?.adrs.find((adr) => adr.id === id)

  /** The lines of a quote, each with its number. */
  const numbered = (quote: readonly string[], start: number): { number: number; text: string }[] =>
    quote.map((text, position) => ({ number: start + position, text }))
</script>

{#snippet withCode(text: string)}
  {#each codeSpans(text) as part, position (position)}{#if part.code}<code>{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

{#snippet quoteBlock(quote: readonly string[], start: number, label: string)}
  <div class="quote" role="group" aria-label={label}>
    {#each numbered(quote, start) as line (line.number)}
      <span class="number" aria-hidden="true">{line.number}</span><span class="line"
        >{line.text}</span
      >
    {/each}
  </div>
{/snippet}

<aside class="detail" aria-label={t.annotations.detail.label}>
  {#if !annotation}
    <p class="message">{t.annotations.detail.select}</p>
  {:else}
    {@const type = annotation.type ? t.annotations.types[annotation.type] : t.annotations.kind}
    {@const resolved = annotation.state === 'resolved'}
    {@const primary = !replying && !attachingThis}
    <header>
      <p class="kind">{type}</p>
      <h2>{firstLine(annotation.text) || t.annotations.noText}</h2>
      <p class="id">
        <code>{annotation.id}</code>
        {#if annotation.state}
          <span class="state" class:open={!resolved}>
            {t.annotations.states[annotation.state]}
          </span>
        {/if}
      </p>
      <p class="faint">{t.annotations.detail.written(annotation.author, annotation.date)}</p>

      {#if annotation.writable}
        <div class="actions">
          {#if anchor === 'orphaned'}
            <button
              class:primary
              title={t.annotations.detail.attachAgainHint}
              disabled={attachingThis}
              onclick={() => reviewing.startAttaching(annotation.id)}
            >
              {t.annotations.attachAgain}
            </button>
          {:else if anchor === 'moved'}
            <button
              class:primary
              title={t.annotations.detail.updateAnchorHint}
              onclick={() => void reviewing.updateAnchor(annotation.id)}
            >
              {t.annotations.detail.updateAnchor}
            </button>
          {/if}
          {#if place}
            <button
              title={t.annotations.detail.showCodeHint}
              onclick={() => reviewing.showCode(annotation.id)}
            >
              {t.annotations.detail.showCode}
            </button>
          {/if}
          <button
            disabled={replying !== undefined}
            onclick={() => reviewing.startReply(annotation.id)}
          >
            {t.annotations.detail.reply}
          </button>
          {#if resolved}
            <button onclick={() => void reviewing.setState(annotation.id, 'open')}>
              {t.annotations.detail.reopen}
            </button>
          {:else if annotation.state === 'open'}
            <button onclick={() => void reviewing.setState(annotation.id, 'resolved')}>
              {t.annotations.detail.resolve}
            </button>
          {/if}
          {#if anchor !== 'orphaned' && annotation.anchor}
            <button
              title={t.annotations.detail.attachAgainHint}
              disabled={attachingThis}
              onclick={() => reviewing.startAttaching(annotation.id)}
            >
              {t.annotations.attachAgain}
            </button>
          {/if}
        </div>
      {:else}
        <p class="warning">{t.annotations.detail.notWritable}</p>
      {/if}
      {#if attachingThis}
        <p class="attaching" role="status">{t.annotations.detail.attaching}</p>
      {/if}

      {#if problems.length > 0}
        <ul class="problems" aria-label={t.annotations.detail.problems}>
          {#each problems as problem, position (position)}
            <li>
              {@render withCode(wordReviewProblem(problem))}
              {#if problem.kind === 'unknown-adr'}
                <button onclick={() => void reviewing.repair(annotation.id, problem.adr)}>
                  {t.annotations.detail.repair}
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </header>

    <section aria-label={t.annotations.detail.code}>
      <h3>{t.annotations.detail.code}</h3>
      {#if annotation.anchor}
        {@const written = annotation.anchor}
        {@const at = place ?? written}
        <p class="where">
          {#if place}
            <button
              class="file"
              title={t.annotations.detail.showCodeHint}
              onclick={() => reviewing.showCode(annotation.id)}>{at.path}</button
            >
          {:else}
            <code class="file">{at.path}</code>
          {/if}
          <span class="faint">{t.annotations.lines(at)}</span>
        </p>
        {#if found?.kind === 'moved'}
          <p class="moved">{t.annotations.detail.movedTo(written, found.anchor)}</p>
          {#if found.renamedFrom !== undefined}
            <p class="faint">
              {@render withCode(t.annotations.detail.renamedFrom(found.renamedFrom))}
            </p>
          {/if}
          {#if found.similarity < 1}
            <p class="faint">{t.annotations.detail.similarity(found.similarity)}</p>
          {/if}
        {:else if found?.kind === 'orphaned'}
          <p class="orphaned">
            {@render withCode(
              found.file === 'gone'
                ? t.annotations.detail.orphanedGone(written.path)
                : t.annotations.detail.orphanedThere(written.path, written)
            )}
          </p>
        {/if}
        <h4>{t.annotations.detail.quoted}</h4>
        {@render quoteBlock(written.quote, written.start, t.annotations.detail.quoted)}
        {#if found?.kind === 'moved' && found.similarity < 1}
          <h4>{t.annotations.detail.now}</h4>
          {@render quoteBlock(found.anchor.quote, found.anchor.start, t.annotations.detail.now)}
        {/if}
      {:else}
        <p class="faint">{t.annotations.detail.noAnchor}</p>
      {/if}
    </section>

    {#if annotation.text.trim() !== ''}
      <section class="text">
        <MarkdownDocument markdown={annotation.text} onfile={() => {}} />
      </section>
    {/if}

    <section aria-label={t.annotations.detail.replies}>
      <h3>
        {t.annotations.detail.replies}
        {#if annotation.replies.length > 0}<span class="count">{annotation.replies.length}</span
          >{/if}
      </h3>
      {#each annotation.replies as reply (reply.path)}
        <div class="reply">
          <p class="by">{t.annotations.detail.written(reply.author, reply.date)}</p>
          <MarkdownDocument markdown={reply.text} onfile={() => {}} />
        </div>
      {:else}
        {#if !replying}<p class="faint">{t.annotations.detail.noReplies}</p>{/if}
      {/each}
      {#if replying}
        <form
          class="reply-form"
          onsubmit={(event) => {
            event.preventDefault()
            void reviewing.submitReply()
          }}
        >
          <label>
            <span class="faint">{t.annotations.detail.yourReply}</span>
            <!-- svelte-ignore a11y_autofocus -->
            <textarea
              bind:value={replying.text}
              rows="4"
              placeholder={t.annotations.detail.textPlaceholder}
              autofocus
            ></textarea>
          </label>
          <label>
            <span class="faint">{t.annotations.detail.author}</span>
            <input
              bind:value={replying.author}
              type="text"
              title={t.annotations.detail.authorHint}
            />
          </label>
          <div class="buttons">
            <button type="button" onclick={() => reviewing.cancelReply()}>{t.cancel}</button>
            <button
              type="submit"
              class="primary"
              disabled={replying.text.trim() === '' || replying.author.trim() === ''}
            >
              {t.annotations.detail.preview}
            </button>
          </div>
        </form>
      {/if}
    </section>

    <section aria-label={t.annotations.detail.cites}>
      <h3>{t.annotations.detail.cites}</h3>
      {#if cited.length === 0}
        <p class="faint">{t.annotations.detail.noCites}</p>
      {:else}
        <ul class="cites">
          {#each cited as line (line.item)}
            {@const adr = line.found && adrOf(line.found.logPath, line.found.id)}
            <li>
              {#if line.found && adr}
                {@const at = line.found}
                <button class="link" onclick={() => app.jumpTo(at.logPath, at.id)}>
                  <StatusMark status={statusKey(adr)} />
                  {#if (repository?.logs.length ?? 0) > 1}<span class="log"
                      >{logName(at.logPath)}</span
                    >{/if}
                  <span class="prefix">{prefixOf(adr)}</span>
                  {adr.title ?? adr.id}
                </button>
              {:else}
                <code>{line.item}</code>
                <span class="missing">{t.annotations.detail.notThere}</span>
              {/if}
              {#if annotation.writable}
                <button
                  class="small"
                  aria-label={t.annotations.detail.unciteLabel(line.item)}
                  onclick={() => void reviewing.uncite(annotation.id, line.item)}
                >
                  {t.annotations.detail.uncite}
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if annotation.writable}
        <div class="cite">
          <Picker
            candidates={citable}
            label={t.annotations.detail.cite}
            placeholder={t.annotations.detail.citePlaceholder}
            noneLeft={t.annotations.detail.noAdrLeft}
            textOf={({ id, adr }) => `${id} ${prefixOf(adr)} ${adr.title ?? ''}`}
            newestFirst
            onpick={(id) => void reviewing.cite(annotation.id, id)}
          >
            {#snippet option({ adr, log })}
              <StatusMark status={statusKey(adr)} />
              {#if (repository?.logs.length ?? 0) > 1}<span class="log">{logName(log)}</span>{/if}
              <span class="prefix">{prefixOf(adr)}</span>
              <span class="title">{adr.title ?? adr.id}</span>
            {/snippet}
          </Picker>
        </div>
      {/if}
    </section>
  {/if}
</aside>

<style>
  .detail {
    overflow-y: auto;
    padding: 14px 18px 28px;
    background: var(--paper);
    line-height: 1.5;
    user-select: text;
    cursor: auto;
  }

  .message {
    margin-top: 30vh;
    color: var(--ink-soft);
    text-align: center;
  }

  .kind {
    color: var(--ink-faint);
    font-size: 11.5px;
    font-weight: 600;
  }

  h2 {
    margin-bottom: 4px;
    font-size: 15px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 18px 0 6px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  h4 {
    margin: 10px 0 4px;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--ink-soft);
  }

  .id {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  code,
  .file {
    font-family: var(--code);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .state {
    padding: 0 6px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    color: var(--ink-soft);
    font-size: 11px;
    line-height: 16px;
  }

  .state.open {
    border-color: var(--waiting);
    color: var(--waiting);
  }

  .faint {
    color: var(--ink-faint);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }

  .actions button,
  .buttons button,
  .problems button,
  .small {
    padding: 3px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--panel-raised);
  }

  .actions button:hover:not(:disabled),
  .buttons button:hover:not(:disabled),
  .problems button:hover,
  .small:hover {
    background: var(--hover);
  }

  .actions .primary,
  .buttons .primary {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
    font-weight: 500;
  }

  .actions .primary:hover:not(:disabled),
  .buttons .primary:hover:not(:disabled) {
    border-color: var(--focus);
    background: var(--focus);
  }

  button:disabled {
    opacity: 0.5;
  }

  .warning,
  .attaching {
    margin-top: 10px;
    padding: 6px 10px;
    border-left: 3px solid var(--waiting);
    background: color-mix(in srgb, var(--waiting) 9%, var(--paper));
  }

  .problems {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 12px;
    padding: 0;
    list-style: none;
  }

  .problems li {
    padding: 6px 10px;
    border-left: 3px solid var(--problem);
    background: color-mix(in srgb, var(--problem) 7%, var(--paper));
    color: var(--ink-soft);
  }

  .problems button {
    display: block;
    margin-top: 6px;
  }

  .where {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
  }

  button.file {
    color: var(--ink);
    text-align: left;
  }

  button.file:hover {
    color: var(--focus);
    text-decoration: underline;
  }

  .moved {
    margin-top: 4px;
    color: var(--waiting);
  }

  .orphaned {
    margin-top: 4px;
    color: var(--problem);
  }

  .quote {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    column-gap: 12px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel-raised);
    font-family: var(--code);
    font-size: 12px;
    line-height: 1.6;
    overflow-x: auto;
  }

  .number {
    color: var(--ink-faint);
    text-align: right;
    user-select: none;
    font-variant-numeric: tabular-nums;
  }

  .line {
    white-space: pre;
  }

  .text {
    margin-top: 16px;
  }

  .reply {
    padding: 8px 0 10px;
    border-top: 1px solid var(--line);
  }

  .reply:first-of-type {
    border-top: none;
    padding-top: 0;
  }

  .by {
    margin-bottom: 2px;
    color: var(--ink-soft);
    font-size: 12px;
    font-weight: 600;
  }

  .count {
    color: var(--ink-faint);
    font-weight: 400;
  }

  .reply-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel-raised);
  }

  .reply-form label {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  textarea,
  input {
    padding: 5px 7px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  textarea {
    resize: vertical;
    font-family: var(--code);
    font-size: 12px;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }

  .cites {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0;
    list-style: none;
  }

  .cites li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
  }

  .link {
    color: var(--ink);
    text-align: left;
  }

  .link:hover {
    color: var(--focus);
    text-decoration: underline;
  }

  .link :global(svg) {
    display: inline-block;
    margin-right: 4px;
    vertical-align: -1px;
  }

  .prefix,
  .log {
    color: var(--ink-soft);
  }

  .missing {
    color: var(--problem);
    font-size: 12px;
  }

  .small {
    margin-left: auto;
    padding: 0 8px;
    font-size: 12px;
  }

  .cite {
    margin-top: 10px;
  }
</style>
