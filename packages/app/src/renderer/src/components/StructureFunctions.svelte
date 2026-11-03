<script lang="ts">
  import type { StructureComponent } from '../../../shared/ipc'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'

  // What the Component page shows of the code inside a Component (structure-format.md,
  // section 5, "Inside a Source File"): its most complex functions, each opening the code
  // viewer at its line, and the classes whose methods fall into more than one group.
  let { page }: { page: StructureComponent } = $props()

  const open = $derived(app.active?.structure.code)
  const isOpen = (file: string, line: number): boolean => open?.path === file && open.line === line
  const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
</script>

<section aria-labelledby="most-complex-functions">
  <h3 id="most-complex-functions">{t.structure.page.functions}</h3>
  {#if page.functions.length === 0}
    <p class="faint">{t.structure.page.noFunction}</p>
  {:else}
    <p class="faint">
      {t.structure.page.functionsHint}
      {#if page.functions.length < page.functionCount}
        {t.structure.page.firstFunctions(page.functions.length, page.functionCount)}
      {/if}
    </p>
    <ol class="measured">
      {#each page.functions as one (`${one.file}\n${one.name}`)}
        <li>
          <button
            class="name"
            class:open={isOpen(one.file, one.line)}
            title={t.structure.viewer.openAt(one.file, one.line)}
            onclick={() => app.openSourceFile(one.file, [one.line], one.line)}>{one.name}</button
          >
          <span class="value" title={t.structure.page.complexity(one.complexity)}
            >{one.complexity}</span
          >
          <span class="where">{fileName(one.file)}:{one.line}</span>
        </li>
      {/each}
    </ol>
  {/if}

  {#if page.classes.length > 0}
    <h3>{t.structure.page.classes}</h3>
    <p class="faint">{t.structure.page.classesHint}</p>
    <ol class="measured">
      {#each page.classes as one (`${one.file}\n${one.name}`)}
        <li>
          <button
            class="name"
            class:open={isOpen(one.file, one.line)}
            title={t.structure.viewer.openAt(one.file, one.line)}
            onclick={() => app.openSourceFile(one.file, [one.line], one.line)}>{one.name}</button
          >
          <span class="value" title={t.structure.page.groups(one.lcom4, one.methods)}
            >{one.lcom4}</span
          >
          <span class="where">{t.structure.page.groups(one.lcom4, one.methods)}</span>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  h3 {
    margin: 16px 0 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  .faint {
    margin-bottom: 4px;
    color: var(--ink-faint);
    font-size: 12px;
  }

  .measured {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    column-gap: 8px;
  }

  .name {
    min-width: 0;
    color: var(--ink);
    font-family: var(--code);
    font-size: 12px;
    text-align: left;
    overflow-wrap: anywhere;
  }

  .name:hover {
    color: var(--focus);
    text-decoration: underline;
  }

  .name.open {
    color: var(--focus);
    font-weight: 600;
  }

  .value {
    grid-row: span 2;
    min-width: 2.2em;
    padding: 0 6px;
    border-radius: 9px;
    background: var(--panel);
    color: var(--ink);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    text-align: center;
  }

  .where {
    color: var(--ink-faint);
    font-family: var(--code);
    font-size: 11px;
    overflow-wrap: anywhere;
  }
</style>
