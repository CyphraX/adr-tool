<script lang="ts">
  import { onMount } from 'svelte'
  import type { EditorView } from '@codemirror/view'
  import { recordsCorrection, type Adr } from '@adr-tool/core'
  import { createBodyEditor, replaceText } from '../lib/editor'
  import { app, type EditorMode } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import MarkdownDocument from './MarkdownDocument.svelte'

  let { adr }: { adr: Adr } = $props()

  let host = $state<HTMLDivElement>()
  let view: EditorView | undefined
  const editing = $derived(app.editing)
  const correction = $derived(recordsCorrection(adr))

  const MODES: [EditorMode, string][] = [
    ['source', t.editor.source],
    ['split', t.editor.split]
  ]

  onMount(() => {
    view = createBodyEditor({
      parent: host!,
      text: app.editing?.text ?? '',
      onChange: (text) => {
        if (app.editing) app.editing.text = text
      },
      onSave: () => void app.save()
    })
    view.focus()
    return () => view?.destroy()
  })

  // The text can change from outside the editor: the version from disk was loaded.
  $effect(() => {
    if (view && editing) replaceText(view, editing.text)
  })
</script>

{#if editing}
  <div class="editor">
    <div class="bar">
      <div class="modes" role="group" aria-label={t.editor.layout}>
        {#each MODES as [mode, label] (mode)}
          <button aria-pressed={editing.mode === mode} onclick={() => (editing.mode = mode)}>
            {label}
          </button>
        {/each}
      </div>

      {#if correction}
        <label class="note">
          <span>{t.editor.correction}</span>
          <input type="text" placeholder={t.editor.notePlaceholder} bind:value={editing.note} />
        </label>
      {/if}

      <div class="actions">
        <button onclick={() => app.discardEdit()}>{app.dirty ? t.editor.discard : t.close}</button>
        <button
          class="primary"
          disabled={!app.dirty || editing.changedOnDisk !== undefined}
          onclick={() => app.save()}
        >
          {t.save}
        </button>
      </div>
    </div>

    {#if editing.missing}
      <p class="notice">{t.editor.missing}</p>
    {:else if editing.changedOnDisk !== undefined}
      <div class="notice">
        <p>{t.editor.changedOnDisk}</p>
        <button onclick={() => app.keepMine()}>{t.editor.keepMine}</button>
        <button onclick={() => app.loadFromDisk()}>{t.editor.loadFromDisk}</button>
      </div>
    {:else if correction}
      <p class="hint">{t.editor.correctionHint}</p>
    {/if}

    <div class="surfaces" class:split={editing.mode === 'split'}>
      <div class="source" bind:this={host}></div>
      {#if editing.mode === 'split'}
        <div class="preview">
          <MarkdownDocument markdown={editing.text} />
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .editor {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--paper);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 40px;
    border-bottom: 1px solid var(--line);
    background: var(--panel-raised);
  }

  button {
    padding: 4px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  button:hover {
    background: var(--hover);
  }

  button:disabled {
    opacity: 0.5;
  }

  .modes {
    display: flex;
  }

  .modes button {
    border-radius: 0;
  }

  .modes button:first-child {
    border-radius: 4px 0 0 4px;
  }

  .modes button:last-child {
    border-left: 0;
    border-radius: 0 4px 4px 0;
  }

  .modes button[aria-pressed='true'] {
    background: var(--selected);
    font-weight: 500;
  }

  .note {
    display: flex;
    align-items: center;
    flex: 1;
    gap: 8px;
    min-width: 0;
    color: var(--ink-soft);
  }

  .note input {
    flex: 1;
    min-width: 0;
    max-width: 26rem;
    padding: 4px 8px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }

  .actions .primary {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
    font-weight: 500;
  }

  .actions .primary:hover:not(:disabled) {
    border-color: var(--focus);
    background: var(--focus);
  }

  .hint,
  .notice {
    padding: 8px 40px;
    border-bottom: 1px solid var(--line);
    color: var(--ink-soft);
    line-height: 1.5;
  }

  .notice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    color: var(--ink);
    border-left: 3px solid var(--proposed);
    background: color-mix(in srgb, var(--proposed) 10%, transparent);
  }

  .surfaces {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    flex: 1;
    min-height: 0;
  }

  .surfaces.split {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .source {
    min-height: 0;
    overflow: hidden;
    user-select: text;
    cursor: text;
  }

  .preview {
    overflow-y: auto;
    border-left: 1px solid var(--line);
  }
</style>
