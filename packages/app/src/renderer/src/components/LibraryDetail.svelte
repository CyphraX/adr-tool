<script lang="ts">
  import type { ScopedLibrary } from '@adr-tool/structure/model'
  import { licenceLabel } from '../lib/libraries'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { codeSpans } from '../lib/wording'

  // One Library of the inventory (docs/structure-format.md, section 3): the manifests that
  // declare it, the names the code imports it by and how they were told, the Components and
  // Source Files that use it, what is installed of it, and its licence or why it cannot be told.
  let { row }: { row: ScopedLibrary } = $props()

  /** How many files of one Component the detail lists; the rest are counted. */
  const FILES_LISTED = 50

  const words = $derived(t.structure.inventory)
  const library = $derived(row.library)
  const openPath = $derived(app.active?.structure.code?.path)
</script>

{#snippet withCode(text: string)}
  {#each codeSpans(text) as part, position (position)}{#if part.code}<code>{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

{#snippet files(paths: readonly string[], undeclared: readonly string[])}
  <ul class="files">
    {#each paths.slice(0, FILES_LISTED) as path (path)}
      <li>
        <button
          class="path file"
          class:open={openPath === path}
          title={t.structure.viewer.open(path)}
          onclick={() => app.openSourceFile(path)}>{path}</button
        >
        {#if undeclared.includes(path)}
          <span class="tag undeclared" title={words.undeclaredFile}>{words.tag.undeclared}</span>
        {/if}
      </li>
    {/each}
  </ul>
  {#if paths.length > FILES_LISTED}
    <p class="faint">{words.firstOf(FILES_LISTED, paths.length)}</p>
  {/if}
{/snippet}

<p class="kind">{words.kind(words.ecosystem[library.ecosystem])}</p>
<h2><code>{library.name}</code></h2>
<p class="status" class:undeclared={row.status === 'undeclared'}>{words.status[row.status]}</p>

<h3>{words.declaredIn}</h3>
{#if library.declared.length === 0}
  <p class="faint">{words.notDeclared}</p>
{:else}
  <ul class="declarations">
    {#each library.declared as declaration, position (position)}
      <li>
        <span class="path"
          >{declaration.manifest}{#if declaration.line !== undefined}<span class="faint"
              >:{declaration.line}</span
            >{/if}</span
        >
        {#if declaration.version !== undefined}<code class="version">{declaration.version}</code
          >{/if}
        {#if declaration.group !== undefined}<span class="tag">{declaration.group}</span>{/if}
        {#if declaration.component !== undefined}
          <button class="link id" onclick={() => app.showComponent(declaration.component!)}
            >{declaration.component}</button
          >
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<h3>{words.importedAs}</h3>
<p>
  {#each library.imports as name, position (name)}{#if position > 0},
    {/if}<code>{name}</code>{/each}
  {#if library.mapping !== undefined}
    <span
      class="faint"
      class:guess={library.mapping === 'normalised' || library.mapping === 'group'}
      >— {words.mapping[library.mapping]}</span
    >
  {/if}
</p>

<h3>{words.usedBy}</h3>
{#if library.usedBy.length === 0}
  <p class="faint">{words.usedByNone}</p>
{:else}
  <ul class="users">
    {#each library.usedBy as user (user.component ?? '')}
      <li>
        <div class="user">
          {#if user.component !== undefined}
            <button class="link id" onclick={() => app.showComponent(user.component!)}
              >{user.component}</button
            >
          {:else}
            <span>{words.unassigned}</span>
          {/if}
          <span class="faint">{words.fileCount(user.files.length)}</span>
          {#if user.testOnly}<span class="tag">{words.testsOnly}</span>{/if}
        </div>
        {@render files(user.files, user.undeclared)}
      </li>
    {/each}
  </ul>
{/if}

<h3>{words.installed}</h3>
{#if library.installed}
  <p>
    <span class="path">{library.installed.path}</span>
    {#if library.installed.version !== undefined}<code class="version"
        >{library.installed.version}</code
      >{/if}
  </p>
{:else}
  <p class="faint">{words.notInstalled}</p>
{/if}

<h3>{words.licence}</h3>
<p class:unknown={library.licence.kind === 'unknown'}>{licenceLabel(library.licence)}</p>
{#if library.licence.kind === 'declared'}
  <p class="faint">
    {@render withCode(words.licenceFrom(library.licence.field, library.licence.source))}
  </p>
{:else if library.licence.kind === 'file'}
  <p class="faint">{@render withCode(words.licenceFileFrom(library.licence.source))}</p>
{:else if library.licence.reason === 'outside'}
  <p class="faint">{words.javaLicence}</p>
{/if}

<style>
  h2 {
    margin-bottom: 4px;
    font-size: 15px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  h2 code {
    font-size: 14px;
  }

  h3 {
    margin: 16px 0 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0;
    list-style: none;
  }

  .kind {
    color: var(--ink-faint);
    font-size: 11.5px;
    font-weight: 600;
  }

  .status {
    color: var(--ink-soft);
  }

  .status.undeclared {
    color: var(--proposed);
  }

  .faint {
    color: var(--ink-faint);
  }

  .guess {
    font-style: italic;
  }

  .unknown {
    color: var(--ink-faint);
    font-style: italic;
  }

  .path,
  code,
  .id {
    font-family: var(--code);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .version {
    color: var(--ink-soft);
  }

  .link {
    color: var(--focus);
    text-align: left;
  }

  .link:hover {
    text-decoration: underline;
  }

  .declarations li,
  .user {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
  }

  .users > li {
    padding-bottom: 6px;
    border-bottom: 1px solid var(--line);
  }

  .files {
    gap: 1px;
    margin-top: 2px;
    padding-left: 12px;
  }

  .file {
    color: var(--ink);
    text-align: left;
  }

  .file:hover {
    color: var(--focus);
    text-decoration: underline;
  }

  .file.open {
    color: var(--focus);
    font-weight: 600;
  }

  .tag {
    padding: 0 6px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    color: var(--ink-soft);
    font-size: 11px;
  }

  /* Used without a declaration: it waits for someone to declare it. */
  .tag.undeclared {
    margin-left: 6px;
    border-color: var(--proposed);
    color: var(--proposed);
  }
</style>
