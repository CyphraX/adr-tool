<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import type { AnnotationView } from '../../../shared/ipc'
  import type { CodeAnnotation, Lines } from '../lib/code-annotations'
  import { createCodeViewer, quotedLines, type CodeViewer } from '../lib/code-viewer'
  import { firstLine, onFile, placeOf } from '../lib/review'
  import { reviewForms } from '../lib/review-tab.svelte'
  import { reviewing } from '../lib/reviewing.svelte'
  import { app, type CodeView } from '../lib/state.svelte'
  import { t } from '../lib/strings'

  // A Source File, read-only, with the lines of the Dependency it was opened from marked and
  // the one asked for in view. It stands where the level was; the details stay beside it, so
  // that one line after another can be opened from there. Conformance opens it as well, at an
  // import or at the line of a Rule, and says where its button leads back to. The Annotations of
  // the file stand beside their lines (docs/plan-vision.md, part 9); lines selected here are
  // annotated, or an Annotation is attached to them again.
  let {
    code,
    back,
    annotations,
    selected,
    onannotation = (id: string) => reviewing.open(id, true),
    attaching
  }: {
    code: CodeView
    /** What leads back from the file, and what it says: to Structure's level unless said. */
    back?: { readonly label: string; readonly go: () => void }
    /** The Annotations of the file, where they are now: those of the repository unless said. */
    annotations?: readonly AnnotationView[]
    /** The Annotation that is selected, whose card shows it. */
    selected?: string | undefined
    /** A click on an Annotation: it opens in Review unless said. */
    onannotation?: (id: string) => void
    /** The Annotation whose new lines are being selected here: Attach again. */
    attaching?:
      | {
          readonly id: string
          readonly attach: (lines: Lines) => void
          readonly cancel: () => void
        }
      | undefined
  } = $props()

  let host: HTMLDivElement
  let viewer = $state<CodeViewer>()
  let lines = $state<Lines | undefined>(undefined)
  const show = $derived(app.active?.structure.show ?? 'graph')
  const leave = $derived(
    back ?? { label: t.structure.viewer.back(show), go: () => app.closeSourceFile() }
  )
  const shown = $derived(
    annotations ?? onFile(app.active?.review.known?.annotations ?? [], code.path)
  )
  const cards = $derived<CodeAnnotation[]>(
    shown.flatMap((annotation) => {
      const place = placeOf(annotation)
      if (!place) return []
      const type = t.annotations.types[annotation.type ?? 'note']
      const text = firstLine(annotation.text) || t.annotations.noText
      return [
        {
          id: annotation.id,
          start: place.start,
          end: place.end,
          open: annotation.state !== 'resolved',
          type,
          text,
          about: t.annotations.about(annotation.author, annotation.date, annotation.replies.length),
          label: t.annotations.card(type, place, text)
        }
      ]
    })
  )

  onMount(() => {
    viewer = createCodeViewer(host, {
      onselect: (selection) => (lines = selection),
      onannotation: (id) => onannotation(id)
    })
    return () => viewer?.destroy()
  })

  $effect(() => {
    const file = code.file
    if (!viewer || !file) return
    viewer.show({ path: file.path, text: file.text }, $state.snapshot(code.marks), code.line)
    // Opened from the keyboard — a Source File picked with Enter —, the code takes the focus
    // that the list it was picked from took with it.
    if (document.activeElement === null || document.activeElement === document.body) viewer.focus()
  })

  // Lines annotated, or attached to, are let go of: what is offered for them is done.
  $effect(() => {
    void reviewForms.written
    untrack(() => viewer?.deselect())
  })

  $effect(() => {
    viewer?.annotate($state.snapshot(cards), selected)
  })

  /** The lines selected, as the file has them: what a new Annotation quotes. */
  function quoted(selection: Lines): string[] {
    return quotedLines(code.file?.text ?? '', selection.start, selection.end)
  }
</script>

<section class="code" aria-label={t.structure.viewer.label}>
  <div class="head">
    <button class="back" onclick={leave.go}>
      <span aria-hidden="true">←</span>
      {leave.label}
    </button>
    <span class="path">{code.path}</span>
    {#if code.marks.length > 0}
      <span class="marked">{t.structure.viewer.marked(code.marks)}</span>
    {/if}
    <span class="tools">
      {#if lines && code.file && !attaching}
        {@const selection = lines}
        <button
          class="annotate"
          title={t.annotations.annotateHint}
          onclick={() =>
            reviewing.compose(code.path, selection.start, selection.end, quoted(selection))}
        >
          {t.annotations.annotate(selection)}
        </button>
      {:else if !attaching && code.file}
        <span class="hint">{t.annotations.selectToAnnotate}</span>
      {/if}
      <span class="read-only">{t.structure.viewer.readOnly}</span>
    </span>
  </div>
  {#if attaching}
    {@const selection = lines}
    <div class="attaching" role="status">
      <p>{t.annotations.attachingHint(attaching.id)}</p>
      <span class="buttons">
        <button onclick={attaching.cancel}>{t.cancel}</button>
        <button
          class="primary"
          disabled={!selection || !code.file}
          onclick={() =>
            selection && attaching.attach({ start: selection.start, end: selection.end })}
        >
          {selection ? t.annotations.attachTo(selection) : t.annotations.attachAgain}
        </button>
      </span>
    </div>
  {/if}
  {#if code.error}
    <p class="message">{code.error}</p>
  {:else if !code.file}
    <p class="message">{t.structure.viewer.reading}</p>
  {/if}
  <div class="host" class:hidden={!code.file || code.error} bind:this={host}></div>
</section>

<style>
  .code {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    flex: none;
    min-height: 37px;
    padding: 5px 14px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
  }

  .back {
    color: var(--focus);
  }

  .back:hover {
    text-decoration: underline;
  }

  .path {
    min-width: 0;
    font-family: var(--code);
    font-size: 12px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .marked,
  .hint {
    color: var(--ink-soft);
    font-size: 12px;
  }

  .hint {
    color: var(--ink-faint);
  }

  .tools {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
  }

  .annotate,
  .attaching button {
    padding: 2px 10px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
    font-size: 12px;
  }

  .annotate:hover,
  .attaching button:hover:not(:disabled) {
    background: var(--hover);
  }

  .read-only {
    color: var(--ink-faint);
    font-size: 11.5px;
  }

  .attaching {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    flex: none;
    padding: 7px 14px;
    border-bottom: 1px solid var(--line);
    border-left: 3px solid var(--waiting);
    background: color-mix(in srgb, var(--waiting) 9%, var(--paper));
    line-height: 1.5;
  }

  .attaching p {
    flex: 1;
    min-width: 16rem;
  }

  .attaching .buttons {
    display: flex;
    gap: 8px;
  }

  .attaching .primary {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
    font-weight: 500;
  }

  .attaching .primary:hover:not(:disabled) {
    border-color: var(--focus);
    background: var(--focus);
  }

  .attaching button:disabled {
    opacity: 0.5;
  }

  .message {
    padding: 18px 14px;
    color: var(--ink-soft);
  }

  .host {
    flex: 1;
    min-height: 0;
  }

  .host.hidden {
    display: none;
  }
</style>
