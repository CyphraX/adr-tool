<script lang="ts">
  import type { ScopedLibrary } from '@adr-tool/structure/model'
  import { licenceLabel, shownUsers } from '../lib/libraries'
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
  // Test files are listed as the view says: without them, they are counted apart.
  const tests = $derived(app.active?.structure.tests ?? false)
  const users = $derived(shownUsers(library.usedBy, tests))
  const hiddenTests = $derived(
    tests ? 0 : library.usedBy.reduce((sum, user) => sum + user.tests.length, 0)
  )
  // A Java or Python package holds packages: a Rule that names one names those below it too.
  const holdsPackages = $derived(library.ecosystem === 'maven' || library.ecosystem === 'python')
</script>

{#snippet withCode(text: string)}
  {#each codeSpans(text) as part, position (position)}{#if part.code}<code>{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

{#snippet files(
  paths: readonly string[],
  lines: Readonly<Record<string, readonly number[]>>,
  undeclared: readonly string[]
)}
  <ul class="files">
    {#each paths.slice(0, FILES_LISTED) as path (path)}
      {@const at = lines[path] ?? []}
      <li>
        <!-- Opened at its first import of the Library, every import marked. -->
        <button
          class="path file"
          class:open={openPath === path}
          title={t.structure.viewer.open(path)}
          onclick={() => app.openSourceFile(path, at, at[0])}
          >{path}{#if at.length > 0}<span class="faint">:{at[0]}</span>{/if}</button
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
  {#each library.imports as name, position (position)}{position > 0 ? ', ' : ''}<code>{name}</code
    >{/each}
  {#if library.mapping !== undefined}
    <span
      class="faint"
      class:guess={library.mapping === 'normalised' || library.mapping === 'group'}
      >— {words.mapping[library.mapping]}</span
    >
  {/if}
</p>

{#if holdsPackages && library.imports.length > 0}
  <p class="faint">{words.importedBelow}</p>
{/if}

<h3>{words.usedBy}</h3>
{#if users.length === 0}
  <p class="faint">{hiddenTests > 0 ? words.testsHidden(hiddenTests) : words.usedByNone}</p>
{:else}
  <ul class="users">
    {#each users as user (user.component ?? '')}
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
        {@render files(user.files, user.lines, user.undeclared)}
      </li>
    {/each}
  </ul>
  {#if hiddenTests > 0}<p class="faint">{words.testsHidden(hiddenTests)}</p>{/if}
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
  <p class="faint">{library.ecosystem === 'maven' ? words.javaLicence : words.linkedOutside}</p>
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
