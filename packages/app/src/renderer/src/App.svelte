<script lang="ts">
  import { onMount, type Snippet } from 'svelte'
  import AdrDetail from './components/AdrDetail.svelte'
  import AdrList from './components/AdrList.svelte'
  import AnnotationDetail from './components/AnnotationDetail.svelte'
  import AnnotationDialog from './components/AnnotationDialog.svelte'
  import BoardView from './components/BoardView.svelte'
  import BranchAdrDetail from './components/BranchAdrDetail.svelte'
  import BranchList from './components/BranchList.svelte'
  import ChangeDialog from './components/ChangeDialog.svelte'
  import CommitDialog from './components/CommitDialog.svelte'
  import ConformanceCenter from './components/ConformanceCenter.svelte'
  import ConformanceDetail from './components/ConformanceDetail.svelte'
  import ConformanceSidebar from './components/ConformanceSidebar.svelte'
  import DashboardView from './components/DashboardView.svelte'
  import DiagramDetail from './components/DiagramDetail.svelte'
  import DiagramsCenter from './components/DiagramsCenter.svelte'
  import DiagramsSidebar from './components/DiagramsSidebar.svelte'
  import HistoryDialog from './components/HistoryDialog.svelte'
  import MetadataDialog from './components/MetadataDialog.svelte'
  import NewAdrDialog from './components/NewAdrDialog.svelte'
  import NewDiagramDialog from './components/NewDiagramDialog.svelte'
  import PaneDivider from './components/PaneDivider.svelte'
  import ProblemsList from './components/ProblemsList.svelte'
  import RelationsGraph from './components/RelationsGraph.svelte'
  import RepositoryProblems from './components/RepositoryProblems.svelte'
  import ReviewCenter from './components/ReviewCenter.svelte'
  import ReviewSidebar from './components/ReviewSidebar.svelte'
  import SearchPalette from './components/SearchPalette.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import StructureDetail from './components/StructureDetail.svelte'
  import StructureCenter from './components/StructureCenter.svelte'
  import StructureSidebar from './components/StructureSidebar.svelte'
  import TabBar from './components/TabBar.svelte'
  import TimelineView from './components/TimelineView.svelte'
  import TogetherView from './components/TogetherView.svelte'
  import {
    LIMITS,
    fitMiddle,
    fitSidebar,
    maxMiddle,
    readSizes,
    type MiddlePane,
    type PaneSizes
  } from './lib/panes'
  import type { Module } from './lib/modules'
  import { reviewing } from './lib/reviewing.svelte'
  import { app } from './lib/state.svelte'
  import { t } from './lib/strings'
  import { wordDiagramProblem } from './lib/diagram-words'
  import { codeSpans, describeProblem } from './lib/wording'

  onMount(() => {
    void app.start()
    reviewing.start()
  })

  /** The tab in front, with a repository open. */
  type Active = NonNullable<typeof app.active>

  // Each module of the suite has its three panes here (lib/modules.ts): what there is, how it
  // hangs together, and what this one is (docs/design.md, "The frame").
  const FRAMES: Record<Module, Snippet<[Active]>> = {
    decisions: decisionsFrame,
    structure: structureFrame,
    conformance: conformanceFrame,
    diagrams: diagramsFrame,
    review: reviewFrame
  }

  // The main process holds the window open while there is something to lose — text in the
  // editor, what a dialog holds — and asks back.
  $effect(() => void window.api.setUnsaved(app.holdsUnsaved))

  const repository = $derived(app.active?.repository.repository)

  // The panes are as wide as they were dragged, within what leaves the others readable;
  // a pane nobody dragged keeps the proportions of the layout. Remembered for this person
  // on this machine, and the window works the same when nothing can be remembered.
  const STORED_SIZES = 'pane-sizes'
  let sizes = $state<PaneSizes>(readStoredSizes())
  let panesWidth = $state(0)
  // The graph, the timeline, the board and the dashboard want room: they share one width,
  // and so do the centres of Structure and Conformance, which draw.
  const wide = $derived(
    app.active?.module !== 'decisions' ||
      ['graph', 'timeline', 'board', 'dashboard'].includes(app.active.view)
  )
  const middlePane = $derived<MiddlePane>(wide ? 'graph' : 'list')
  // Before the window has been measured there is nothing to fit a width into.
  const sidebarWidth = $derived(
    sizes.sidebar === undefined
      ? LIMITS.sidebar.default
      : panesWidth === 0
        ? sizes.sidebar
        : fitSidebar(sizes.sidebar, panesWidth)
  )
  const middleWidth = $derived.by(() => {
    const asked = sizes[middlePane]
    if (asked === undefined || panesWidth === 0) return asked
    return fitMiddle(asked, panesWidth, sidebarWidth, middlePane)
  })

  function readStoredSizes(): PaneSizes {
    try {
      return readSizes(localStorage.getItem(STORED_SIZES))
    } catch {
      return {}
    }
  }

  function resize(pane: keyof PaneSizes, width: number | undefined): void {
    sizes[pane] = width
    try {
      localStorage.setItem(STORED_SIZES, JSON.stringify(sizes))
    } catch {
      // Not remembered, then.
    }
  }

  // Ctrl+K, or Cmd+K on a Mac: search from anywhere — but not over another dialog. Exactly
  // that chord: on a Mac Ctrl+K deletes to the end of the line in the editor, and with
  // Shift it deletes the line everywhere. AltGr is Ctrl+Alt on Windows.
  function onkeydown(event: KeyboardEvent): void {
    const mac = window.api.platform === 'darwin'
    const chord = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
    if (event.key.toLowerCase() !== 'k' || !chord || event.altKey || event.shiftKey) return
    if (event.defaultPrevented || document.querySelector('dialog[open]')) return
    event.preventDefault()
    app.startSearching()
  }
</script>

<svelte:window {onkeydown} />

{#snippet withCode(text: string)}
  {#each codeSpans(text) as part, position (position)}{#if part.code}<code>{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

{#if app.ready}
  <div class="window">
    <TabBar />

    {#if !app.active || !repository}
      <main class="message">
        <h1>{t.welcome.noRepository}</h1>
        <p>{t.welcome.noRepositoryLead}</p>
        <button class="primary" onclick={() => app.open()}>{t.tabs.open}</button>
      </main>
    {:else}
      {@render FRAMES[app.active.module](app.active)}
    {/if}
  </div>
  <NewAdrDialog />
  <MetadataDialog />
  <HistoryDialog />
  <CommitDialog />
  <NewDiagramDialog />
  <AnnotationDialog />
  <SearchPalette />
  <ChangeDialog />
{/if}

<!-- The dividers between the panes of Structure and Conformance, as in Decisions. -->
{#snippet sidebarDivider()}
  <PaneDivider
    label={t.panes.sidebar}
    min={LIMITS.sidebar.min}
    max={fitSidebar(LIMITS.sidebar.max, panesWidth)}
    onresize={(width) => resize('sidebar', fitSidebar(width, panesWidth))}
    onreset={() => resize('sidebar', undefined)}
  />
{/snippet}

{#snippet middleDivider()}
  <PaneDivider
    label={t.panes.middle}
    min={LIMITS.middle.min}
    max={maxMiddle(panesWidth, sidebarWidth, middlePane)}
    onresize={(width) => resize(middlePane, fitMiddle(width, panesWidth, sidebarWidth, middlePane))}
    onreset={() => resize(middlePane, undefined)}
  />
{/snippet}

{#snippet structureFrame(active: Active)}
  {@const structure = active.structure}
  <!-- The sidebar stands from the start: the Problems of the repository are reached from it
       while the level is still being analysed, or could not be. -->
  <div
    class="panes drawing"
    bind:clientWidth={panesWidth}
    style:--sidebar="{sidebarWidth}px"
    style:--detail-beside-graph="{LIMITS.detail.besideGraph}px"
    style:--middle={middleWidth === undefined ? undefined : `${middleWidth}px`}
  >
    <StructureSidebar />
    {@render sidebarDivider()}
    {#if structure.problems}
      <RepositoryProblems />
    {:else if structure.view}
      <StructureCenter view={structure.view} />
    {:else if structure.error}
      <main class="message">
        <h1>{t.structure.failed}</h1>
        <p>{structure.error}</p>
      </main>
    {:else}
      <main class="message">
        <p>{t.structure.analysing}</p>
      </main>
    {/if}
    {#key structure.problems}{@render middleDivider()}{/key}
    {#if structure.view}
      <StructureDetail view={structure.view} />
    {:else}
      <aside class="no-detail"></aside>
    {/if}
  </div>
{/snippet}

{#snippet conformanceFrame(active: Active)}
  {@const conformance = active.conformance}
  <!-- As Structure's: the sidebar stands from the start, while the Rules are checked. -->
  <div
    class="panes drawing"
    bind:clientWidth={panesWidth}
    style:--sidebar="{sidebarWidth}px"
    style:--detail-beside-graph="{LIMITS.detail.besideGraph}px"
    style:--middle={middleWidth === undefined ? undefined : `${middleWidth}px`}
  >
    <ConformanceSidebar />
    {@render sidebarDivider()}
    {#if conformance.problems}
      <RepositoryProblems />
    {:else if conformance.view}
      <ConformanceCenter view={conformance.view} />
    {:else if conformance.failed !== undefined && !conformance.reading}
      <main class="message">
        <h1>{t.conformance.failed}</h1>
        <p>{conformance.failed}</p>
      </main>
    {:else}
      <main class="message">
        <p>{t.conformance.analysing}</p>
      </main>
    {/if}
    {#key conformance.problems}{@render middleDivider()}{/key}
    {#if conformance.view}
      <ConformanceDetail view={conformance.view} />
    {:else}
      <aside class="no-detail"></aside>
    {/if}
  </div>
{/snippet}

{#snippet diagramsFrame(active: Active)}
  {@const diagrams = active.diagrams}
  {@const overview = diagrams.overview}
  {@const diagram = diagrams.diagram}
  <!-- What there is: the Diagrams with their Drift; how it hangs together: the canvas; what
       this one is: the selected element or connection, or the Diagram (docs/plan-vision.md,
       part 7). -->
  <div class="panes diagrams" style:--sidebar="{sidebarWidth}px">
    <DiagramsSidebar />
    {#if diagrams.problems}
      <RepositoryProblems />
    {:else if diagram?.readable}
      <DiagramsCenter {diagrams} {diagram} />
    {:else if diagram}
      <main class="message">
        <h1>{diagrams.entry?.title ?? diagrams.entry?.id}</h1>
        {#each diagram.problems as problem, position (position)}
          <p>{wordDiagramProblem(problem)}</p>
        {/each}
      </main>
    {:else if overview && overview.directory !== undefined && overview.diagrams.length === 0}
      <main class="message">
        <h1>{t.diagrams.empty.title}</h1>
        <p>{t.diagrams.empty.lead}</p>
        <button class="primary" onclick={() => app.diagrams.startNew()}>
          {t.diagrams.newDiagram}
        </button>
      </main>
    {:else if diagrams.failed}
      <main class="message"><p>{t.diagrams.failed(diagrams.failed)}</p></main>
    {:else}
      <main class="message"><p>{overview ? t.diagrams.select : t.diagrams.analysing}</p></main>
    {/if}
    {#if diagram?.readable}
      <DiagramDetail {diagrams} {diagram} />
    {:else}
      <aside class="no-detail"></aside>
    {/if}
  </div>
{/snippet}

{#snippet reviewFrame(active: Active)}
  <!-- What the Annotations are, by state, Anchor, type, Component and author; the ones the
       filters leave, or a Source File with them beside their lines; and the one selected. -->
  <div
    class="panes review"
    class:code={active.review.code !== undefined}
    style:--sidebar="{sidebarWidth}px"
  >
    <ReviewSidebar />
    <ReviewCenter />
    <AnnotationDetail />
  </div>
{/snippet}

{#snippet decisionsFrame(active: Active)}
  {@const repository = active.repository.repository}
  {#if repository.logs.length === 0}
    <main class="message">
      {#if repository.problems.length > 0}
        <h1>{t.welcome.badConfiguration}</h1>
        {#each repository.problems as problem, position (position)}
          <p>{describeProblem(problem)}</p>
        {/each}
      {:else}
        <h1>{t.welcome.noAdrs(active.repository.name)}</h1>
        <p>{@render withCode(t.welcome.whereItLooks)}</p>
        <p>{@render withCode(t.welcome.orStartHere)}</p>
        <button class="primary" onclick={() => app.startCreating()}>{t.welcome.createFirst}</button>
      {/if}
    </main>
  {:else}
    <div class="body">
      {#if repository.problems.length > 0}
        <!-- A log loads, another one or a setting of the configuration does not. -->
        <div class="configuration" role="status">
          <strong>{t.welcome.partOfConfiguration}</strong>
          {#each repository.problems as problem, position (position)}
            <span>{describeProblem(problem)}</span>
          {/each}
        </div>
      {/if}
      <div
        class="panes"
        class:wide-editor={app.editing?.mode === 'split'}
        class:wide-middle={wide}
        bind:clientWidth={panesWidth}
        style:--sidebar="{sidebarWidth}px"
        style:--detail-beside-graph="{LIMITS.detail.besideGraph}px"
        style:--middle={middleWidth === undefined ? undefined : `${middleWidth}px`}
      >
        <Sidebar />
        <PaneDivider
          label={t.panes.sidebar}
          min={LIMITS.sidebar.min}
          max={fitSidebar(LIMITS.sidebar.max, panesWidth)}
          onresize={(width) => resize('sidebar', fitSidebar(width, panesWidth))}
          onreset={() => resize('sidebar', undefined)}
        />
        {#if active.view === 'problems'}
          <ProblemsList />
        {:else if active.view === 'repository-problems'}
          <RepositoryProblems />
        {:else if active.view === 'branches'}
          <BranchList />
        {:else if active.view === 'graph' && app.log}
          <RelationsGraph log={app.log} />
        {:else if active.view === 'timeline' && app.log}
          <TimelineView log={app.log} />
        {:else if active.view === 'board' && app.log}
          <BoardView log={app.log} />
        {:else if active.view === 'dashboard' && app.log}
          <DashboardView log={app.log} />
        {:else if active.view === 'all-adrs' || active.view === 'all-problems'}
          <TogetherView />
        {:else}
          <AdrList />
        {/if}
        {#if app.editing?.mode !== 'split'}
          <!-- A divider watches the pane in front of it: another pane, another divider. -->
          {#key active.view}
            <PaneDivider
              label={t.panes.middle}
              min={LIMITS.middle.min}
              max={maxMiddle(panesWidth, sidebarWidth, middlePane)}
              onresize={(width) =>
                resize(middlePane, fitMiddle(width, panesWidth, sidebarWidth, middlePane))}
              onreset={() => resize(middlePane, undefined)}
            />
          {/key}
        {/if}
        {#if active.view === 'branches'}
          {@const branches = active.branches}
          {#if branches.selected && branches.adr}
            <BranchAdrDetail
              adr={branches.adr}
              sha={branches.selected.sha}
              branch={branches.selected.branch}
            />
          {:else}
            <main class="message on-paper">
              <p>
                {branches.selected === undefined
                  ? t.branches.select
                  : branches.adr === null
                    ? t.branches.gone
                    : t.branches.reading}
              </p>
            </main>
          {/if}
        {:else if app.selected && app.log}
          <AdrDetail adr={app.selected} log={app.log} />
        {:else}
          <main class="message on-paper">
            <p>
              {active.view === 'problems' || active.view === 'repository-problems'
                ? t.welcome.selectToSeeProblems
                : active.view === 'all-adrs' || active.view === 'all-problems'
                  ? t.together.hint
                  : t.welcome.selectToRead}
            </p>
          </main>
        {/if}
      </div>
    </div>
  {/if}
{/snippet}

<style>
  .window {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
  }

  .body {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .body > .panes {
    flex: 1;
  }

  .configuration {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--line);
    border-left: 3px solid var(--proposed);
    background: color-mix(in srgb, var(--proposed) 10%, transparent);
    line-height: 1.5;
  }

  .panes {
    display: grid;
    /* Between the panes stand their dividers, which take no room of their own. What a pane
       needs at least is lib/panes.ts' to say; 340px is how the layout shares the room out
       while nobody has dragged the list, not a limit. */
    grid-template-columns:
      var(--sidebar) 0 var(--middle, minmax(340px, 1fr))
      0 minmax(0, 1.4fr);
    min-height: 0;
  }

  /* The Diagrams: the canvas wants the room; the detail is there to be glanced at. */
  .panes.diagrams {
    grid-template-columns: var(--sidebar) minmax(0, 3fr) minmax(260px, 1fr);
  }

  /* Review: the filters, the Annotations or a Source File, and the Annotation selected. The
     code viewer wants the room a list does not. */
  .panes.review {
    grid-template-columns: var(--sidebar) minmax(0, 1.25fr) minmax(340px, 1fr);
  }

  .panes.review.code {
    grid-template-columns: var(--sidebar) minmax(0, 1.8fr) minmax(320px, 1fr);
  }

  /* A drawing needs room; the ADR next to it is there to be glanced at. So it is in Structure —
     the level as drawing, matrix or table — and in Conformance, beside what is selected. */
  .panes.drawing,
  .panes.wide-middle {
    grid-template-columns:
      var(--sidebar) 0 var(--middle, minmax(0, 2fr))
      0 minmax(var(--detail-beside-graph), 1fr);
  }

  /* Source and preview side by side need room; the list steps aside while they are open. */
  .panes.wide-editor {
    grid-template-columns: var(--sidebar) 0 minmax(0, 1fr);
  }

  .panes.wide-editor > :global(.list),
  .panes.wide-editor > :global(.graph),
  .panes.wide-editor > :global(.timeline),
  .panes.wide-editor > :global(.board),
  .panes.wide-editor > :global(.dashboard) {
    display: none;
  }

  .message {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 10px;
    max-width: 34rem;
    margin: 0 auto;
    padding: 0 32px;
    color: var(--ink-soft);
    line-height: 1.55;
  }

  .no-detail {
    border-left: 1px solid var(--line);
    background: var(--paper);
  }

  .message.on-paper {
    max-width: none;
    margin: 0;
    align-items: center;
    background: var(--paper);
  }

  h1 {
    font-size: 17px;
    font-weight: 600;
    color: var(--ink);
  }

  code {
    font-family: var(--code);
    font-size: 0.92em;
  }

  .primary {
    margin-top: 8px;
    padding: 6px 14px;
    border-radius: 4px;
    background: var(--ink);
    color: var(--paper);
    font-weight: 500;
  }

  .primary:hover {
    background: var(--focus);
  }
</style>
