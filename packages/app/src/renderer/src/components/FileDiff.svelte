<script lang="ts">
  import type { FileChange } from '@adr-tool/core'
  import { diffLines } from '../lib/diff'
  import { t } from '../lib/strings'

  // One file of a change as a person reviews it: a change that is planned, or one git recorded.
  let { file, unchanged }: { file: FileChange; unchanged: string } = $props()

  const SIGN = { added: '+', removed: '−', context: ' ', gap: '' } as const
  const lines = $derived(diffLines(file))
</script>

<section>
  <h2>
    {file.path}{file.creates ? t.diff.newFile : ''}
    {#if file.renameTo !== undefined}<span class="to">→ {file.renameTo}</span>{/if}
  </h2>
  <div class="diff">
    {#each lines as line, position (position)}
      <span class={line.kind}>{SIGN[line.kind]} {line.text}</span>
    {:else}
      <span class="unchanged">{unchanged}</span>
    {/each}
  </div>
</section>

<style>
  section + :global(section) {
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

  .diff .unchanged {
    color: var(--ink-soft);
    font-family: var(--ui);
    font-size: 13px;
  }

  .to {
    margin-left: 4px;
    color: var(--ink);
  }

  .gap {
    height: 8px;
    border-top: 1px dashed var(--line);
    margin-top: 6px;
  }
</style>
