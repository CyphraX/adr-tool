<script lang="ts">
  import { librariesIn, type LibraryInventory } from '@adr-tool/structure/model'
  import { licenceLabel } from '../lib/libraries'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'

  // The Libraries section of a Component's page: what its manifests declare and its Source
  // Files use, the Components inside it included, each with its version and licence, and
  // whether it is used without a declaration or declared and not used.
  let { inventory, component }: { inventory: LibraryInventory; component: string } = $props()

  const words = $derived(t.structure.inventory)
  const rows = $derived(librariesIn(inventory, component))
</script>

{#snippet unbroken(text: string)}
  <!-- Broken between its words only: an SPDX name such as BSD-3-Clause stays whole. -->
  {#each text.split(' ') as word, position (position)}{position > 0 ? ' ' : ''}<span class="word"
      >{word}</span
    >{/each}
{/snippet}

<h3>{words.page}</h3>
{#if rows.length === 0}
  <p class="faint">{words.pageNone}</p>
{:else}
  <table aria-label={words.page}>
    <thead>
      <tr>
        <th scope="col">{words.library}</th>
        <th scope="col">{words.version}</th>
        <th scope="col" class="numeric">{words.files}</th>
        <th scope="col">{words.licence}</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row (`${row.library.ecosystem}\n${row.library.name}`)}
        {@const { library } = row}
        <tr>
          <th scope="row">
            <button
              class="link"
              title={words.status[row.status]}
              onclick={() =>
                app.selectInStructure({
                  kind: 'library',
                  ecosystem: library.ecosystem,
                  name: library.name
                })}>{library.name}</button
            >
            {#if row.status !== 'used'}
              <span class="tag {row.status}">{words.tag[row.status]}</span>
            {/if}
          </th>
          <td class="version">{row.versions.join(', ')}</td>
          <td class="numeric"
            >{row.usedBy.reduce((sum, user) => sum + user.files.length, 0) || ''}</td
          >
          <td
            class:unknown={library.licence.kind === 'unknown'}
            title={licenceLabel(library.licence)}
            >{@render unbroken(licenceLabel(library.licence, 'short'))}</td
          >
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  h3 {
    margin: 16px 0 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  .faint {
    color: var(--ink-faint);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 2px 8px 2px 0;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: baseline;
  }

  thead th {
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  tbody th {
    font-weight: 400;
    overflow-wrap: anywhere;
  }

  .numeric {
    text-align: right;
  }

  .link {
    color: var(--focus);
    font-family: var(--code);
    font-size: 12px;
    text-align: left;
    white-space: nowrap;
  }

  .link:hover {
    text-decoration: underline;
  }

  .version {
    font-family: var(--code);
    color: var(--ink-soft);
    white-space: nowrap;
  }

  .word {
    white-space: nowrap;
  }

  .unknown {
    color: var(--ink-faint);
    font-style: italic;
  }

  .tag {
    margin-left: 4px;
    padding: 0 5px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    color: var(--ink-soft);
    font-size: 10.5px;
    white-space: nowrap;
  }

  .tag.undeclared {
    border-color: var(--proposed);
    color: var(--proposed);
  }
</style>
