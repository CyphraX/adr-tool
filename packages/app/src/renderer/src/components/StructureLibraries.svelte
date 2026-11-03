<script lang="ts">
  import { librariesIn, type LibraryStatus, type ScopedLibrary } from '@adr-tool/structure/model'
  import type { StructureView } from '../../../shared/ipc'
  import { licenceLabel, licenceRank, usersLabel, type LibraryColumn } from '../lib/libraries'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'

  // The Library inventory of the whole repository (docs/structure-format.md, section 3): one
  // row per Library the manifests declare or the code uses, with its versions, the Components
  // that use it and its licence. Every column sorts; the numbers stand to the right.
  let { view }: { view: StructureView } = $props()

  const words = $derived(t.structure.inventory)
  const selection = $derived(app.active?.structure.selection)
  const all = $derived(librariesIn(view.inventory))

  type Filter = 'all' | LibraryStatus
  const FILTERS: Filter[] = ['all', 'used', 'unused', 'undeclared']
  let filter = $state<Filter>('all')
  let sort = $state<{ column: LibraryColumn; descending: boolean }>({
    column: 'library',
    descending: false
  })

  const countOf = (which: Filter): number =>
    which === 'all' ? all.length : all.filter((row) => row.status === which).length
  const filesOf = (row: ScopedLibrary): number =>
    row.usedBy.reduce((sum, user) => sum + user.files.length, 0)
  const compare = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true })

  /** The value a column sorts by: a text, or a number for the counts. */
  function order(a: ScopedLibrary, b: ScopedLibrary): number {
    switch (sort.column) {
      case 'library':
        return compare(a.library.name, b.library.name)
      case 'version':
        return compare(a.versions.join(', '), b.versions.join(', '))
      case 'usedBy':
        return (
          a.usedBy.length - b.usedBy.length || compare(usersLabel(a.usedBy), usersLabel(b.usedBy))
        )
      case 'files':
        return filesOf(a) - filesOf(b)
      case 'licence':
        // What is declared first, then a licence file, then what cannot be told.
        return (
          licenceRank(a.library.licence) - licenceRank(b.library.licence) ||
          compare(licenceLabel(a.library.licence), licenceLabel(b.library.licence))
        )
    }
  }

  const rows = $derived(
    all
      .filter((row) => filter === 'all' || row.status === filter)
      .sort(
        (a, b) =>
          (sort.descending ? -1 : 1) * order(a, b) || compare(a.library.name, b.library.name)
      )
  )
  const java = $derived(all.some((row) => row.library.ecosystem === 'maven'))
  const ecosystems = $derived(new Set(all.map((row) => row.library.ecosystem)).size)

  // A Library chosen elsewhere — in the search, on a page — is brought into view.
  let body = $state<HTMLElement>()
  $effect(() => {
    if (selection?.kind !== 'library') return
    body?.querySelector('tr.selected')?.scrollIntoView({ block: 'nearest' })
  })

  function sortBy(column: LibraryColumn): void {
    sort =
      sort.column === column
        ? { column, descending: !sort.descending }
        : // The counts are read from the largest down; the texts from A.
          { column, descending: column === 'files' || column === 'usedBy' }
  }

  /** The columns, and the share of the width each has: a long name ends in an ellipsis. */
  const COLUMNS: { column: LibraryColumn; numeric: boolean; width: string }[] = [
    { column: 'library', numeric: false, width: '28%' },
    { column: 'version', numeric: false, width: '11%' },
    { column: 'usedBy', numeric: false, width: '31%' },
    { column: 'files', numeric: true, width: '8%' },
    { column: 'licence', numeric: false, width: '22%' }
  ]
</script>

{#snippet unbroken(text: string)}
  <!-- Broken between its words only: an SPDX name such as BSD-3-Clause stays whole. -->
  {#each text.split(' ') as word, position (position)}{position > 0 ? ' ' : ''}<span class="word"
      >{word}</span
    >{/each}
{/snippet}

<div class="libraries-view">
  <div class="tools">
    <div class="filter" role="group" aria-label={words.filter}>
      {#each FILTERS as which (which)}
        <button
          class:current={filter === which}
          aria-pressed={filter === which}
          onclick={() => (filter = which)}
        >
          {words.filters[which]} <span class="count">{countOf(which)}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="scroll">
    {#if all.length === 0}
      <p class="empty">{words.none}</p>
    {:else if rows.length === 0}
      <p class="empty">{words.noneShown}</p>
    {:else}
      <table aria-label={words.label}>
        <colgroup>
          {#each COLUMNS as { column, width } (column)}<col style:width />{/each}
        </colgroup>
        <thead>
          <tr>
            {#each COLUMNS as { column, numeric } (column)}
              {@const sorted = sort.column === column}
              <th
                scope="col"
                class:numeric
                aria-sort={sorted ? (sort.descending ? 'descending' : 'ascending') : 'none'}
              >
                <button title={words.sortBy(words[column])} onclick={() => sortBy(column)}
                  >{words[column]}<span class="arrow" class:shown={sorted} aria-hidden="true"
                    >{sorted && sort.descending ? '↓' : '↑'}</span
                  ></button
                >
              </th>
            {/each}
          </tr>
        </thead>
        <tbody bind:this={body}>
          {#each rows as row (`${row.library.ecosystem}\n${row.library.name}`)}
            {@const { library } = row}
            {@const selected =
              selection?.kind === 'library' &&
              selection.ecosystem === library.ecosystem &&
              selection.name === library.name}
            {@const users = usersLabel(row.usedBy)}
            <tr class:selected>
              <th scope="row" class="name">
                <button
                  aria-pressed={selected}
                  title={library.name}
                  onclick={() =>
                    app.selectInStructure({
                      kind: 'library',
                      ecosystem: library.ecosystem,
                      name: library.name
                    })}>{library.name}</button
                >
                {#if ecosystems > 1}
                  <span class="ecosystem">{words.ecosystem[library.ecosystem]}</span>
                {/if}
                {#if row.status !== 'used'}
                  <span class="tag {row.status}" title={words.status[row.status]}
                    >{words.tag[row.status]}</span
                  >
                {/if}
              </th>
              <td class="version" title={row.versions.join(', ')}>{row.versions.join(', ')}</td>
              <td class="users">
                {users}
                {#if row.usedBy.length > 0 && row.usedBy.every((user) => user.testOnly)}
                  <span class="tag">{words.testsOnly}</span>
                {/if}
              </td>
              <td class="numeric">{filesOf(row) || ''}</td>
              <td
                class="licence"
                class:unknown={library.licence.kind === 'unknown'}
                title={licenceLabel(library.licence)}
              >
                {@render unbroken(licenceLabel(library.licence, 'short'))}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <footer>
    <p>{words.howToRead}</p>
    {#if java}<p>{words.javaLicence}</p>{/if}
  </footer>
</div>

<style>
  .libraries-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .tools {
    display: flex;
    flex: none;
    padding: 10px 14px;
  }

  .filter {
    display: flex;
    border: 1px solid var(--line-strong);
    border-radius: 5px;
    overflow: hidden;
  }

  .filter button {
    padding: 2px 10px;
    font-size: 12px;
  }

  .filter button + button {
    border-left: 1px solid var(--line-strong);
  }

  .filter button:hover {
    background: var(--hover);
  }

  .filter button.current {
    background: var(--selected);
    font-weight: 600;
  }

  .filter .count {
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
  }

  /* No room above the table: the rows go under its sticky heading, not past it. */
  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 14px 14px;
  }

  .empty {
    color: var(--ink-soft);
  }

  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    background: var(--paper);
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 4px 10px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    white-space: nowrap;
  }

  thead th {
    position: sticky;
    top: 0;
    background: var(--panel);
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-soft);
  }

  thead th button {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    font-weight: 600;
    color: inherit;
  }

  thead th button:hover {
    color: var(--ink);
  }

  thead th[aria-sort='ascending'],
  thead th[aria-sort='descending'] {
    color: var(--ink);
  }

  /* Always there, so that a heading does not move when its column is sorted. */
  .arrow {
    visibility: hidden;
  }

  .arrow.shown {
    visibility: visible;
  }

  .numeric {
    text-align: right;
  }

  thead .numeric button {
    flex-direction: row-reverse;
  }

  .version {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* A long name ends in an ellipsis; what is said of it goes below rather than being cut. */
  .name {
    font-weight: 400;
    white-space: normal;
  }

  .name button {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
    font-family: var(--code);
    font-size: 12px;
    font-weight: 500;
    text-align: left;
  }

  .ecosystem,
  .tag {
    white-space: nowrap;
  }

  .name button:hover {
    text-decoration: underline;
  }

  .ecosystem {
    margin-left: 6px;
    font-size: 11px;
    color: var(--ink-faint);
  }

  .tag {
    margin-left: 6px;
    padding: 0 6px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    color: var(--ink-soft);
    font-size: 11px;
  }

  /* Used without a declaration: it waits for someone to declare it. */
  .tag.undeclared {
    border-color: var(--proposed);
    color: var(--proposed);
  }

  .version {
    font-family: var(--code);
    font-size: 12px;
    color: var(--ink-soft);
  }

  /* The Components and the licence wrap rather than hide what they say. */
  .users,
  .licence {
    white-space: normal;
  }

  .users {
    font-family: var(--code);
    font-size: 12px;
  }

  .users .tag {
    font-family: var(--ui);
  }

  .word {
    white-space: nowrap;
  }

  .licence.unknown {
    color: var(--ink-faint);
    font-style: italic;
  }

  tbody tr:hover {
    background: var(--hover);
  }

  tbody tr.selected {
    background: var(--selected);
  }

  footer {
    flex: none;
    padding: 8px 14px 10px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--ink-soft);
    line-height: 1.5;
  }

  footer p + p {
    margin-top: 4px;
  }
</style>
