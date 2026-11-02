<script lang="ts">
  import {
    searchComponents,
    searchSourceFiles,
    type ComponentHit,
    type SourceFileHit
  } from '../lib/search'
  import { app, statusKey } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { searchAll, type PlacedHit } from '../lib/together'
  import { STATUS_LABEL, logName, prefixOf } from '../lib/wording'
  import StatusMark from './StatusMark.svelte'

  // Full-text search with quick jump: type, arrow, Enter. It searches every Decision Log of
  // every open repository, the one in front first, in what is already loaded — nothing is
  // read for it. Below the ADRs, the Components and Source Files of the repository in front,
  // as far as Structure's analysis knows them (docs/plan-vision.md, part 2).
  const LIMIT = 12
  const COMPONENT_LIMIT = 6
  const SOURCE_FILE_LIMIT = 8

  type Row =
    | { readonly kind: 'adr'; readonly key: string; readonly hit: PlacedHit }
    | { readonly kind: 'component'; readonly key: string; readonly hit: ComponentHit }
    | { readonly kind: 'sourceFile'; readonly key: string; readonly hit: SourceFileHit }

  let dialog = $state<HTMLDialogElement>()
  let chosen = $state(0)

  const repositories = $derived(app.tabs.map((tab) => tab.repository))
  const logs = $derived(app.active?.repository.repository.logs ?? [])
  const all = $derived(
    searchAll(
      repositories,
      app.searching?.query ?? '',
      app.activeId === undefined
        ? undefined
        : { repositoryId: app.activeId, ...(app.log && { log: app.log.path }) }
    )
  )
  // Where a hit is: its repository when several are open, its log when there are several.
  const whereOf = (hit: (typeof all)[number]): string =>
    [
      ...(repositories.length > 1 ? [hit.repository] : []),
      ...(logs.length > 1 || repositories.length > 1 ? [logName(hit.logPath)] : [])
    ].join(' · ')
  const found = $derived(all.slice(0, LIMIT))

  const outline = $derived(app.active?.outline)
  const query = $derived(app.searching?.query ?? '')
  const allComponents = $derived(
    outline?.known ? searchComponents(outline.known.components, query) : []
  )
  const allSourceFiles = $derived(
    outline?.known ? searchSourceFiles(outline.known.sourceFiles, query) : []
  )
  const components = $derived(allComponents.slice(0, COMPONENT_LIMIT))
  const sourceFiles = $derived(allSourceFiles.slice(0, SOURCE_FILE_LIMIT))
  const draft = $derived(outline?.known?.origin === 'draft')
  // What the search says of Structure: still analysing, analysing again, or why it cannot.
  const analysis = $derived(
    !outline
      ? undefined
      : outline.reading
        ? outline.known
          ? t.searching.analysingAgain
          : t.searching.analysing
        : !outline.known && outline.failed !== undefined
          ? t.searching.notAnalysed(outline.failed)
          : undefined
  )

  // One list for the keyboard, in the order it is shown: ADRs, Components, Source Files.
  const rows = $derived<Row[]>([
    ...found.map((hit) => ({
      kind: 'adr' as const,
      key: `adr:${hit.repositoryId}:${hit.logPath}:${hit.adr.id}`,
      hit
    })),
    ...components.map((hit) => ({ kind: 'component' as const, key: `component:${hit.id}`, hit })),
    ...sourceFiles.map((hit) => ({ kind: 'sourceFile' as const, key: `file:${hit.path}`, hit }))
  ])
  const sections = $derived(
    [
      { kind: 'adr' as const, heading: t.searching.adrs, shown: found.length, all: all.length },
      {
        kind: 'component' as const,
        heading: t.searching.components,
        shown: components.length,
        all: allComponents.length
      },
      {
        kind: 'sourceFile' as const,
        heading: t.searching.sourceFiles,
        shown: sourceFiles.length,
        all: allSourceFiles.length
      }
    ].filter((section) => section.shown > 0)
  )
  // The files can change under an open palette, and the list with them.
  const position = $derived(Math.min(chosen, rows.length - 1))

  /** Open a hit in its module: an ADR in Decisions, a Component or a Source File in Structure. */
  function open(row: Row): void {
    if (row.kind === 'adr') app.jumpTo(row.hit.logPath, row.hit.adr.id, row.hit.repositoryId)
    else if (row.kind === 'component') app.showComponent(row.hit.id)
    else app.showSourceFile(row.hit.path)
  }

  /** A path as its directory and its file name, to set the name apart. */
  function split(path: string): { readonly directory: string; readonly name: string } {
    const slash = path.lastIndexOf('/')
    return { directory: path.slice(0, slash + 1), name: path.slice(slash + 1) }
  }

  $effect(() => {
    if (app.searching && !dialog?.open) dialog?.showModal()
    if (!app.searching && dialog?.open) dialog.close()
  })

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      const row = rows[position]
      if (row) open(row)
      return
    }
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (step === 0 || rows.length === 0) return
    event.preventDefault()
    chosen = (position + step + rows.length) % rows.length
    document.getElementById(`hit-${chosen}`)?.scrollIntoView({ block: 'nearest' })
  }
</script>

<dialog bind:this={dialog} oncancel={() => app.stopSearching()} aria-label={t.searching.label}>
  {#if app.searching}
    <input
      bind:value={app.searching.query}
      oninput={() => (chosen = 0)}
      {onkeydown}
      type="search"
      placeholder={t.searching.placeholder}
      spellcheck="false"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={rows.length > 0}
      aria-controls={rows.length > 0 ? 'hits' : undefined}
      aria-activedescendant={rows.length > 0 ? `hit-${position}` : undefined}
    />

    {#if rows.length > 0}
      <div id="hits" class="hits" role="listbox" aria-label={t.searching.found}>
        {#each sections as section (section.kind)}
          <div class="section" role="group" aria-labelledby="hits-{section.kind}">
            <div class="heading" id="hits-{section.kind}" role="presentation">
              <span>{section.heading}</span>
              {#if section.all > section.shown}
                <span class="of">{t.searching.moreOf(section.shown, section.all)}</span>
              {/if}
            </div>
            {#each rows as row, index (row.key)}
              {#if row.kind === section.kind}
                <!-- The keyboard is handled by the input above. -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                  id="hit-{index}"
                  class="hit"
                  class:current={index === position}
                  role="option"
                  tabindex="-1"
                  aria-selected={index === position}
                  onclick={() => open(row)}
                  onmousemove={() => (chosen = index)}
                >
                  {#if row.kind === 'adr'}
                    {@const hit = row.hit}
                    {@const status = statusKey(hit.adr)}
                    <span class="line">
                      <StatusMark {status} />
                      <span class="prefix">{prefixOf(hit.adr)}</span>
                      <span class="title">{hit.adr.title ?? hit.adr.id}</span>
                      <span class="where">
                        {whereOf(hit) ? `${whereOf(hit)} · ` : ''}{hit.adr.metadata.rawStatus ??
                          STATUS_LABEL[status]}
                      </span>
                    </span>
                    {#if hit.excerpt.length > 0}
                      <span class="excerpt">
                        {#each hit.excerpt as part, nth (nth)}{#if part.match}<mark
                              >{part.text}</mark
                            >{:else}{part.text}{/if}{/each}
                      </span>
                    {/if}
                  {:else if row.kind === 'component'}
                    <span class="line">
                      <svg
                        class="glyph"
                        viewBox="0 0 12 12"
                        width="12"
                        height="12"
                        aria-hidden="true"
                      >
                        <rect x="1.5" y="2.5" width="9" height="7" rx="1.5" />
                      </svg>
                      <span class="title">{row.hit.name}</span>
                      {#if row.hit.name !== row.hit.id}
                        <code class="id">{row.hit.id}</code>
                      {/if}
                      <span class="where">
                        {draft
                          ? `${t.searching.component} · ${t.searching.draft}`
                          : t.searching.component}
                      </span>
                    </span>
                  {:else}
                    {@const path = split(row.hit.path)}
                    <span class="line">
                      <svg
                        class="glyph"
                        viewBox="0 0 12 12"
                        width="12"
                        height="12"
                        aria-hidden="true"
                      >
                        <path d="M3 1.5h4l2.5 2.5v6.5h-6.5z" />
                      </svg>
                      <code class="title path"
                        ><span class="directory">{path.directory}</span>{path.name}</code
                      >
                      <span class="where">
                        {`${t.searching.sourceFile} · ${row.hit.component ?? t.searching.unassigned}`}
                      </span>
                    </span>
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        {/each}
      </div>
      {#if all.length > found.length}
        <p class="more">{t.searching.more(found.length, all.length)}</p>
      {/if}
    {:else if query.trim() !== ''}
      <p class="none">{t.searching.none}</p>
    {/if}
    {#if analysis && query.trim() !== ''}
      <p class="analysis" role="status">{analysis}</p>
    {/if}
  {/if}
</dialog>

<style>
  dialog {
    width: min(640px, calc(100vw - 80px));
    max-height: min(560px, calc(100vh - 120px));
    margin: 60px auto auto;
    padding: 0;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 18px 60px rgb(0 0 0 / 0.28);
    overflow: hidden;
  }

  dialog[open] {
    display: flex;
    flex-direction: column;
  }

  dialog::backdrop {
    background: rgb(12 16 24 / 0.32);
  }

  input {
    flex: none;
    width: 100%;
    padding: 14px 18px;
    border: 0;
    outline: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 15px;
  }

  input::-webkit-search-cancel-button {
    display: none;
  }

  .hits {
    overflow-y: auto;
    border-top: 1px solid var(--line);
    padding: 4px 0;
  }

  .hit {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 18px;
  }

  .hit.current {
    background: var(--selected);
  }

  .section + .section {
    margin-top: 4px;
    border-top: 1px solid var(--line);
    padding-top: 4px;
  }

  .heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 18px 2px;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  .heading .of {
    font-weight: 400;
  }

  .glyph {
    fill: none;
    stroke: var(--ink-soft);
    stroke-width: 1.2;
  }

  .id,
  .path {
    font-family: var(--code);
    font-size: 12px;
  }

  .id {
    flex: none;
    max-width: 40%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--ink-soft);
  }

  .path {
    font-weight: 400;
  }

  .directory {
    color: var(--ink-faint);
  }

  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .line :global(svg) {
    flex: none;
  }

  .prefix {
    flex: none;
    color: var(--ink-soft);
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .where {
    flex: none;
    font-size: 12px;
    color: var(--ink-faint);
  }

  .excerpt {
    padding-left: 22px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 12px;
    color: var(--ink-soft);
  }

  mark {
    border-radius: 2px;
    background: color-mix(in srgb, var(--proposed) 30%, transparent);
    color: var(--ink);
  }

  .more {
    flex: none;
    padding: 6px 18px 8px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--ink-faint);
  }

  .none {
    padding: 12px 18px 16px;
    border-top: 1px solid var(--line);
    color: var(--ink-soft);
  }

  .analysis {
    flex: none;
    padding: 6px 18px 8px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--ink-soft);
  }
</style>
