<script lang="ts">
  import type { Adr } from '@adr-tool/core'
  import { t } from '../lib/strings'
  import { STATUS_LABEL, prefixOf } from '../lib/wording'
  import { app } from '../lib/state.svelte'
  import MarkdownDocument from './MarkdownDocument.svelte'
  import StatusStamp from './StatusStamp.svelte'

  // An ADR as a branch that is not checked out has it: read, never written.
  let { adr, sha, branch }: { adr: Adr; sha: string; branch: string } = $props()
  const status = $derived(adr.metadata.status ?? 'unknown')

  // A link to another ADR leads to it as the same branch has it.
  const directory = $derived(adr.path.slice(0, Math.max(0, adr.path.lastIndexOf('/'))))
  const openOnBranch = (fileName: string): void => {
    if (!fileName.endsWith('.md')) return
    void app.showBranchAdr(sha, directory ? `${directory}/${fileName}` : fileName, branch)
  }

  const facts = $derived(
    [
      [t.detail.created, adr.metadata.created],
      [t.detail.decided, adr.metadata.decided],
      [t.detail.decisionMakers, adr.metadata.decisionMakers.join(', ')],
      [t.detail.tags, adr.metadata.tags.join(', ')]
    ].filter((fact): fact is [string, string] => Boolean(fact[1]))
  )
</script>

<article>
  <header>
    <div class="record">
      <p class="id">
        {t.detail.adr} <span class="prefix">{prefixOf(adr)}</span>
        <span class="path">{adr.path}</span>
      </p>
      <StatusStamp {status} label={adr.metadata.rawStatus ?? STATUS_LABEL[status]} />
    </div>
    <p class="branch">{t.branches.readOnly(branch)}</p>
    {#if facts.length > 0}
      <dl>
        {#each facts as [term, value] (term)}
          <div>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        {/each}
      </dl>
    {/if}
  </header>
  <div class="reading">
    <MarkdownDocument markdown={adr.body} onfile={openOnBranch} />
  </div>
</article>

<style>
  article {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--paper);
  }

  header {
    flex: none;
    padding: 18px 40px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--panel-raised);
    user-select: text;
    cursor: auto;
  }

  .record {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .id {
    font-size: 15px;
    font-weight: 600;
  }

  .path {
    margin-left: 10px;
    font-size: 12px;
    font-weight: 400;
    color: var(--ink-faint);
  }

  .branch {
    max-width: 72ch;
    margin-top: 10px;
    padding-left: 10px;
    border-left: 2px solid var(--line-strong);
    font-size: 12.5px;
    color: var(--ink-soft);
  }

  dl {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 24px;
    margin-top: 12px;
    font-size: 12.5px;
  }

  dl div {
    display: flex;
    gap: 6px;
  }

  dt {
    color: var(--ink-faint);
  }

  .reading {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
</style>
