<script lang="ts">
  import { onMount } from 'svelte'
  import { createCodeViewer, type CodeViewer } from '../lib/code-viewer'
  import { app, type CodeView } from '../lib/state.svelte'
  import { t } from '../lib/strings'

  // A Source File, read-only, with the lines of the Dependency it was opened from marked and
  // the one asked for in view. It stands where the level was; the details stay beside it, so
  // that one line after another can be opened from there.
  let { code }: { code: CodeView } = $props()

  let host: HTMLDivElement
  let viewer = $state<CodeViewer>()
  const show = $derived(app.active?.structure.show ?? 'graph')

  onMount(() => {
    viewer = createCodeViewer(host)
    return () => viewer?.destroy()
  })

  $effect(() => {
    const file = code.file
    if (!viewer || !file) return
    viewer.show({ path: file.path, text: file.text }, $state.snapshot(code.marks), code.line)
  })
</script>

<section class="code" aria-label={t.structure.viewer.label}>
  <div class="head">
    <button class="back" onclick={() => app.closeSourceFile()}>
      <span aria-hidden="true">←</span>
      {t.structure.viewer.back(show)}
    </button>
    <span class="path">{code.path}</span>
    {#if code.marks.length > 0}
      <span class="marked">{t.structure.viewer.marked(code.marks)}</span>
    {/if}
    <span class="read-only">{t.structure.viewer.readOnly}</span>
  </div>
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
    align-items: baseline;
    gap: 4px 12px;
    flex: none;
    padding: 7px 14px;
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

  .marked {
    color: var(--ink-soft);
    font-size: 12px;
  }

  .read-only {
    margin-left: auto;
    color: var(--ink-faint);
    font-size: 11.5px;
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
