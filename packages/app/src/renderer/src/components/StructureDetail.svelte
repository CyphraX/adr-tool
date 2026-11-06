<script lang="ts">
  import type { Adr, DecisionLog } from '@adr-tool/core'
  import { isSegment } from '@adr-tool/structure/model'
  import type {
    StructureComponent,
    StructureEdge,
    StructureNeighbour,
    StructureNode,
    StructureView
  } from '../../../shared/ipc'
  import { wordOf } from '../lib/said'
  import { app, statusKey } from '../lib/state.svelte'
  import { METRICS, t } from '../lib/strings'
  import { firstLine, linesOf, openOf, ownersOf, placeOf } from '../lib/review'
  import { reviewing } from '../lib/reviewing.svelte'
  import { commonDirectory, nodeLabel, opens } from '../lib/structure'
  import { codeSpans, prefixOf } from '../lib/wording'
  import ComponentDiagrams from './ComponentDiagrams.svelte'
  import StatusMark from './StatusMark.svelte'
  import StructureFunctions from './StructureFunctions.svelte'

  // What the selection in the Structure view stands for: a Component with its page — the
  // declaration, the ADRs that affect it, the metrics, the Dependencies at its level, its
  // Cycles —, a directory below a Component with the same page less what only a Component
  // has, another node with its Dependencies, a line or a cell with the Source File
  // Dependencies behind it, a Cycle with its example round trip, or one of the lists of what
  // the analysis could not do.
  let { view }: { view: StructureView } = $props()

  /** The new segment being typed for a Component, while its Rename is open. */
  let renaming = $state<{ id: string; segment: string } | undefined>(undefined)
  const segmentOf = (id: string): string => id.slice(id.lastIndexOf('/') + 1)
  const parentPrefix = (id: string): string => id.slice(0, id.lastIndexOf('/') + 1)

  interface Affecting {
    log: DecisionLog
    adr: Adr
    /** The Component inside this one that the ADR names, when it does not name this one. */
    inside: string | undefined
  }

  /**
   * The ADRs that affect a Component — the opposite direction of their Traces, which only the
   * ADRs record — and then those that affect a Component inside it. Every Decision Log counts.
   */
  function affecting(id: string): Affecting[] {
    const direct: Affecting[] = []
    const below: Affecting[] = []
    for (const log of app.active?.repository.repository.logs ?? []) {
      for (const adr of log.adrs) {
        const { affects } = adr.metadata
        if (affects.includes(id)) direct.push({ log, adr, inside: undefined })
        else {
          const inside = affects.find((item) => item.startsWith(`${id}/`))
          if (inside !== undefined) below.push({ log, adr, inside })
        }
      }
    }
    return [...direct, ...below]
  }

  const nameOfComponent = (id: string): string =>
    app.active?.repository.components?.find((component) => component.id === id)?.name ?? id

  // The open Annotations on the Source Files of a Component and of those inside it (part 9).
  const review = $derived(app.active?.review)
  const owners = $derived(ownersOf(app.active?.outline.known))
  const openAnnotations = (id: string): ReturnType<typeof openOf> =>
    openOf(id, review?.known?.annotations ?? [], owners)

  const selection = $derived(app.active?.structure.selection)
  // What the code viewer shows, so that its link reads as the one that is open.
  const openPath = $derived(app.active?.structure.code?.path)
  const openLine = $derived(app.active?.structure.code?.line)
  // The matrix may show other rows than the drawing: what is in front is asked first.
  const inMatrix = $derived(app.active?.structure.show === 'matrix')
  const nodes = $derived<readonly StructureNode[]>(
    inMatrix ? [...view.matrix.rows, ...view.nodes] : [...view.nodes, ...view.matrix.rows]
  )
  const edges = $derived<readonly StructureEdge[]>(
    inMatrix ? [...view.matrix.cells, ...view.edges] : [...view.edges, ...view.matrix.cells]
  )
  const nodeOf = (id: string): StructureNode | undefined => nodes.find((node) => node.id === id)
  const edgeOf = (from: string, to: string): StructureEdge | undefined =>
    edges.find((edge) => edge.from === from && edge.to === to)
  const pageOf = (id: string): StructureComponent | undefined =>
    view.components.find((component) => component.id === id)

  function labelOf(id: string): string {
    const node = nodeOf(id)
    return node ? nodeLabel(node) : (pageOf(id)?.name ?? id)
  }

  const selectEdge = (edge: { from: string; to: string }): void =>
    app.selectInStructure({ kind: 'edge', from: edge.from, to: edge.to })
  const selectNode = (id: string): void => app.selectInStructure({ kind: 'node', id })

  /** The Cycle of the level in view with the same round trip, to select it. */
  const cycleIndex = (roundTrip: readonly { id: string }[]): number =>
    view.cycles.findIndex(
      (cycle) =>
        cycle.roundTrip.length === roundTrip.length &&
        cycle.roundTrip.every((id, position) => id === roundTrip[position]!.id)
    )
</script>

{#snippet withCode(text: string)}
  {#each codeSpans(text) as part, position (position)}{#if part.code}<code>{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

{#snippet fileLink(path: string, marks: readonly number[] = [])}
  <button
    class="path file"
    class:open={openPath === path}
    title={t.structure.viewer.open(path)}
    onclick={() => app.openSourceFile(path, marks)}>{path}</button
  >
{/snippet}

{#snippet lineLinks(path: string, lines: readonly number[])}
  <span class="faint lines"
    >{t.structure.detail.lineWord(lines.length)}
    {#each lines as line, position (line)}{#if position > 0},
      {/if}<button
        class="line"
        class:open={openPath === path && openLine === line}
        aria-label={t.structure.viewer.openAt(path, line)}
        title={t.structure.viewer.openAt(path, line)}
        onclick={() => app.openSourceFile(path, lines, line)}>{line}</button
      >{/each}</span
  >
{/snippet}

{#snippet edgeButton(edge: StructureEdge, end: 'from' | 'to')}
  <li>
    <button class="link" onclick={() => selectEdge(edge)}>{labelOf(edge[end])}</button>
    <span class="faint">{t.structure.graph.weight(edge.weight)}</span>
    {#if edge.typeOnly}<span class="tag">{t.structure.detail.typeOnly}</span>{/if}
  </li>
{/snippet}

{#snippet dependencyList(list: readonly StructureEdge[], end: 'from' | 'to')}
  {#if list.length === 0}
    <p class="faint">{t.structure.detail.nothing}</p>
  {:else}
    <ul class="edges">
      {#each list as edge (edge[end])}{@render edgeButton(edge, end)}{/each}
    </ul>
  {/if}
{/snippet}

{#snippet nodeDetail(node: StructureNode)}
  <h2>{nodeLabel(node)}</h2>
  {#if node.kind === 'source-file'}
    <p>{@render fileLink(node.id)}</p>
    <p class="faint">{t.structure.page.size(node.files, node.lines)}</p>
  {:else}
    <p class="faint">{t.structure.page.size(node.files, node.lines)}</p>
  {/if}
  <h3>{t.structure.detail.dependsOn}</h3>
  {@render dependencyList(
    edges.filter((edge) => edge.from === node.id),
    'to'
  )}
  <h3>{t.structure.detail.usedBy}</h3>
  {@render dependencyList(
    edges.filter((edge) => edge.to === node.id),
    'from'
  )}
{/snippet}

{#snippet neighbours(page: StructureComponent, list: readonly StructureNeighbour[], out: boolean)}
  {#if list.length === 0}
    <p class="faint">{t.structure.detail.nothing}</p>
  {:else}
    <ul class="edges">
      {#each list as neighbour (neighbour.id)}
        {@const from = out ? page.id : neighbour.id}
        {@const to = out ? neighbour.id : page.id}
        <li>
          {#if edgeOf(from, to)}
            <button class="link" onclick={() => selectEdge({ from, to })}
              >{nodeLabel(neighbour)}</button
            >
          {:else}
            <span>{nodeLabel(neighbour)}</span>
          {/if}
          <span class="faint">{t.structure.graph.weight(neighbour.weight)}</span>
          {#if neighbour.typeOnly}<span class="tag">{t.structure.detail.typeOnly}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet declared(page: StructureComponent)}
  <h3>{t.structure.page.decisions}</h3>
  {@const decisions = affecting(page.id)}
  {#if decisions.length === 0}
    <p class="faint">{t.structure.page.noDecision}</p>
  {:else}
    <ul class="decisions">
      {#each decisions as { log, adr, inside } (`${log.path}\n${adr.id}`)}
        <li>
          <button class="link" onclick={() => app.jumpTo(log.path, adr.id)}>
            <StatusMark status={statusKey(adr)} />
            <span class="prefix">{prefixOf(adr)}</span>
            {adr.title ?? adr.id}
          </button>
          {#if inside !== undefined}
            <span class="tag">{t.structure.page.inside(nameOfComponent(inside))}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <ComponentDiagrams id={page.id} />

  <h3>{t.annotations.component.heading}</h3>
  {@const annotations = openAnnotations(page.id)}
  {#if !review?.known}
    <p class="faint">{t.annotations.component.follow}</p>
  {:else if annotations.length === 0}
    <p class="faint">{t.annotations.component.none}</p>
  {:else}
    <ul class="annotations">
      {#each annotations as annotation (annotation.id)}
        {@const place = placeOf(annotation)}
        <li>
          <button
            class="link"
            title={t.annotations.adr.show(annotation.id)}
            onclick={() => reviewing.open(annotation.id)}
          >
            <span class="type"
              >{annotation.type ? t.annotations.types[annotation.type] : t.annotations.kind}</span
            >
            {firstLine(annotation.text) || annotation.id}
          </button>
          {#if place}
            <span class="path faint"
              >{place.path.slice(place.path.lastIndexOf('/') + 1)}:{linesOf(place)}</span
            >
          {:else}
            <span class="tag orphaned">{t.annotations.list.orphaned}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <h3>{t.structure.page.patterns}</h3>
  <dl class="patterns">
    <dt>{t.structure.page.paths}</dt>
    <dd>
      {#each page.paths as pattern (pattern)}<code>{pattern}</code>{:else}<span class="faint"
          >{t.structure.page.none}</span
        >{/each}
    </dd>
    <dt>{t.structure.page.tests}</dt>
    <dd>
      {#each page.tests as pattern (pattern)}<code>{pattern}</code>{:else}<span class="faint"
          >{t.structure.page.none}</span
        >{/each}
    </dd>
  </dl>
{/snippet}

{#snippet componentPage(page: StructureComponent)}
  {@const component = page.directory === undefined}
  {#if component}
    <p class="kind">{t.structure.page.component}</p>
    <h2>{page.name}</h2>
    <p><span class="faint">{t.structure.page.id}</span> <code>{page.id}</code></p>
  {:else}
    <p class="kind">{t.structure.page.directory}</p>
    <h2>{t.structure.graph.directory(page.name)}</h2>
    <p><span class="faint">{t.structure.page.path}</span> <code>{page.directory}/</code></p>
  {/if}
  {#if page.description}<p class="description">{page.description}</p>{/if}
  {#if page.metrics}
    <p class="faint">
      {t.structure.page.size(page.metrics.files, page.metrics.lines)}{#if page.testFiles > 0}<br
        />{t.structure.page.testFiles(page.testFiles, view.tests)}{/if}
    </p>
    <button class="action" onclick={() => app.openComponent(page.id)}>
      {t.structure.detail.showParts}
    </button>
  {:else}
    <p class="faint">{t.structure.page.empty}</p>
  {/if}
  {#if component && view.origin === 'declared' && renaming?.id !== page.id}
    <button class="action" onclick={() => (renaming = { id: page.id, segment: segmentOf(page.id) })}
      >{t.structure.page.rename}</button
    >
  {/if}
  {#if component && view.origin === 'declared' && renaming?.id === page.id}
    {@const form = renaming}
    {@const valid = isSegment(form.segment)}
    <form
      class="rename"
      onsubmit={(event) => {
        event.preventDefault()
        if (valid && form.segment !== segmentOf(page.id)) {
          void app.renameComponent(page.id, form.segment)
        }
      }}
    >
      <label>
        <span class="faint">{t.structure.page.renameLabel(page.name)}</span>
        <span class="segment">
          {#if parentPrefix(page.id)}<code>{parentPrefix(page.id)}</code>{/if}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            bind:value={form.segment}
            aria-invalid={!valid}
            spellcheck="false"
            autocomplete="off"
            autofocus
          />
        </span>
      </label>
      {#if !valid}<p class="problem">{t.structure.page.notASegment}</p>{/if}
      <p class="faint note">{t.structure.page.renameHint(page.id)}</p>
      <div class="buttons">
        <button type="button" class="action" onclick={() => (renaming = undefined)}
          >{t.cancel}</button
        >
        <button
          type="submit"
          class="action primary"
          disabled={!valid || form.segment === segmentOf(page.id)}
          >{t.structure.page.preview}</button
        >
      </div>
    </form>
  {/if}

  {#if !component}
    <p class="faint note">{t.structure.page.notAComponent}</p>
  {:else}
    {@render declared(page)}
  {/if}

  {#if page.files.length > 0}
    {@const directory = commonDirectory(page.files)}
    <h3>{t.structure.page.files}</h3>
    {#if page.metrics && page.files.length < page.metrics.files}
      <p class="faint">{t.structure.detail.firstOf(page.files.length, page.metrics.files)}</p>
    {/if}
    {#if directory}
      <p class="faint">{@render withCode(t.structure.page.filesIn(directory))}</p>
    {/if}
    <ul class="files">
      {#each page.files as path (path)}
        <li>
          <button
            class="path file"
            class:open={openPath === path}
            title={t.structure.viewer.open(path)}
            onclick={() => app.openSourceFile(path)}>{path.slice(directory.length)}</button
          >
        </li>
      {/each}
    </ul>
  {/if}

  {#if page.metrics}
    {@const metrics = page.metrics}
    <h3>{t.structure.page.metrics}</h3>
    <dl class="metrics">
      {#each METRICS.slice(2) as key (key)}
        {@const value = key === 'files' || key === 'lines' ? undefined : metrics[key]}
        <dt title={t.structure.metric[key].definition}>{t.structure.metric[key].long}</dt>
        <dd
          title={value === undefined
            ? t.structure.undefinedValue
            : t.structure.metric[key].definition}
        >
          {t.structure.value(key, value)}
        </dd>
      {/each}
    </dl>
    {#each page.lowerBound as language (language)}
      <p class="faint note">{t.structure.metrics.lowerBound[language]}</p>
    {/each}
    <StructureFunctions {page} />
  {/if}

  <p class="faint note">
    {component ? t.structure.page.atItsLevel : t.structure.page.atItsDirectoryLevel}
  </p>
  <h3>{t.structure.detail.dependsOn}</h3>
  {@render neighbours(page, page.dependsOn, true)}
  <h3>{t.structure.detail.usedBy}</h3>
  {@render neighbours(page, page.usedBy, false)}

  <h3>{t.structure.page.cycles}</h3>
  {#if page.cycles.length === 0}
    <p class="faint">{t.structure.page.noCycle}</p>
  {:else}
    <ul class="cycles">
      {#each page.cycles as cycle, position (position)}
        {@const index = page.level === view.parent ? cycleIndex(cycle.roundTrip) : -1}
        {@const trip = [...cycle.roundTrip, cycle.roundTrip[0]!].map(nodeLabel).join(' → ')}
        <li>
          {#if index >= 0}
            <button class="link" onclick={() => app.selectInStructure({ kind: 'cycle', index })}
              >{trip}</button
            >
          {:else}
            <span>{trip}</span>
          {/if}
          {#if cycle.typeOnly}<span class="tag">{t.structure.detail.typeOnly}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet cycleList()}
  <h2>{t.structure.detail.cycles}</h2>
  {#if view.cycles.length === 0}
    <p class="faint">{t.structure.detail.noCycles}</p>
  {:else}
    <ul class="cycles">
      {#each view.cycles as cycle, index (cycle.members.join('\n'))}
        <li>
          <button class="link" onclick={() => app.selectInStructure({ kind: 'cycle', index })}>
            {t.structure.detail.cycle(cycle.members.length)}
          </button>
          <span class="faint">{cycle.members.map(labelOf).join(', ')}</span>
        </li>
      {/each}
    </ul>
  {/if}
  <p class="hint">{t.structure.detail.hint}</p>
{/snippet}

<aside aria-label={t.structure.detail.label}>
  {#if selection?.kind === 'node' && (nodeOf(selection.id) || pageOf(selection.id))}
    {@const node = nodeOf(selection.id)}
    {@const page = pageOf(selection.id)}
    {#if page && (!node || opens(node))}
      {@render componentPage(page)}
    {:else if node}
      {@render nodeDetail(node)}
    {/if}
  {:else if selection?.kind === 'edge'}
    {@const edge = edgeOf(selection.from, selection.to)}
    {#if edge}
      <h2>
        <button class="link" onclick={() => selectNode(edge.from)}>{labelOf(edge.from)}</button>
        <span aria-hidden="true">→</span>
        <button class="link" onclick={() => selectNode(edge.to)}>{labelOf(edge.to)}</button>
      </h2>
      <p class="faint">{t.structure.graph.weight(edge.weight)}</p>
      <ul class="dependencies">
        {#each edge.dependencies as dependency (`${dependency.from}\n${dependency.to}`)}
          <li>
            {@render fileLink(dependency.from, dependency.lines)}
            {@render lineLinks(dependency.from, dependency.lines)}
            {#if dependency.typeOnly}<span class="tag">{t.structure.detail.typeOnly}</span>{/if}
            <span class="to"
              ><span class="arrow" aria-hidden="true">→</span>{@render fileLink(
                dependency.to
              )}</span
            >
          </li>
        {/each}
      </ul>
    {/if}
  {:else if selection?.kind === 'cycle' && view.cycles[selection.index]}
    {@const cycle = view.cycles[selection.index]!}
    <h2>{t.structure.detail.cycle(cycle.members.length)}</h2>
    {#if cycle.typeOnly}<p class="faint">{t.structure.detail.typeOnlyCycle}</p>{/if}
    <h3>{t.structure.detail.roundTrip}</h3>
    <p class="trip">
      {#each [...cycle.roundTrip, cycle.roundTrip[0]!] as member, position (position)}
        {#if position > 0}<span class="arrow" aria-hidden="true">→</span>{/if}
        <button class="link" onclick={() => selectNode(member)}>{labelOf(member)}</button>
      {/each}
    </p>
    {#if cycle.weakest}
      {@const weakest = cycle.weakest}
      <h3>{t.structure.detail.weakest}</h3>
      <p>
        <button class="link" onclick={() => selectEdge(weakest)}>
          {labelOf(weakest.from)} → {labelOf(weakest.to)}
        </button>
      </p>
    {/if}
  {:else if selection?.kind === 'not-resolved'}
    <h2>{t.structure.detail.notResolved}</h2>
    <p class="hint">{t.structure.detail.notResolvedHint}</p>
    {#if view.notResolved.length === 0}
      <p class="faint">{t.structure.detail.none}</p>
    {:else}
      {#if view.notResolved.length < view.notResolvedCount}
        <p class="faint">
          {t.structure.detail.firstOf(view.notResolved.length, view.notResolvedCount)}
        </p>
      {/if}
      <ul class="dependencies">
        {#each view.notResolved as use, position (position)}
          <li>
            {@render fileLink(use.file, [use.line])}
            {@render lineLinks(use.file, [use.line])}
            <code>{use.specifier}</code>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if selection?.kind === 'not-analysed'}
    <h2>{t.structure.detail.notAnalysed}</h2>
    <p class="hint">{t.structure.detail.notAnalysedHint}</p>
    {#if view.notAnalysed.length === 0}
      <p class="faint">{t.structure.detail.none}</p>
    {:else}
      <ul class="dependencies">
        {#each view.notAnalysed as file (file.file)}
          <li>
            {#if file.line === undefined}
              <span class="path">{file.file}</span>
              {#if file.message === undefined}
                <span class="faint">{t.structure.detail.unreadable}</span>
              {:else}
                <span>{wordOf(file.said, file.message)}</span>
              {/if}
            {:else}
              {@render fileLink(file.file, [file.line])}
              {@render lineLinks(file.file, [file.line])}
              <span>{wordOf(file.said, file.message ?? '')}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    {@render cycleList()}
  {/if}
</aside>

<style>
  aside {
    overflow-y: auto;
    padding: 14px 18px 24px;
    background: var(--paper);
    line-height: 1.5;
  }

  h2 {
    margin-bottom: 4px;
    font-size: 15px;
    font-weight: 600;
    overflow-wrap: anywhere;
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

  .faint {
    color: var(--ink-faint);
  }

  .hint {
    margin-top: 12px;
    color: var(--ink-soft);
  }

  .link {
    color: var(--focus);
    text-align: left;
  }

  .link:hover {
    text-decoration: underline;
  }

  .action {
    margin-top: 8px;
    padding: 3px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--panel-raised);
  }

  .action:hover {
    background: var(--hover);
  }

  .action + .action {
    margin-left: 6px;
  }

  .action.primary {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
  }

  .action.primary:hover:not(:disabled) {
    border-color: var(--focus);
    background: var(--focus);
  }

  .action:disabled {
    opacity: 0.5;
  }

  .rename {
    margin-top: 10px;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel-raised);
  }

  .rename label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .segment {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .segment input {
    flex: 1;
    min-width: 0;
    padding: 4px 6px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--code);
    font-size: 12px;
  }

  .segment input[aria-invalid='true'] {
    border-color: var(--problem);
  }

  .problem {
    margin-top: 4px;
    color: var(--problem);
    font-size: 12px;
  }

  .rename .buttons {
    display: flex;
    justify-content: flex-end;
  }

  .decisions li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
  }

  .decisions .link {
    color: var(--ink);
  }

  .decisions .link :global(svg) {
    display: inline-block;
    margin-right: 4px;
    vertical-align: -1px;
  }

  .decisions .prefix {
    color: var(--ink-soft);
  }

  .annotations li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
  }

  .annotations .link {
    color: var(--ink);
  }

  .annotations .type {
    margin-right: 4px;
    font-size: 12px;
    color: var(--ink-faint);
  }

  .tag.orphaned {
    border-color: var(--problem);
    color: var(--problem);
  }

  .edges li,
  .cycles li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
  }

  .dependencies li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--line);
  }

  .path,
  code {
    font-family: var(--code);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .to {
    flex-basis: 100%;
    color: var(--ink-soft);
  }

  .file {
    color: var(--ink);
    text-align: left;
  }

  .to .file {
    color: var(--ink-soft);
  }

  .file:hover,
  .line:hover {
    color: var(--focus);
    text-decoration: underline;
  }

  .file.open,
  .line.open {
    color: var(--focus);
    font-weight: 600;
  }

  .line {
    color: var(--focus);
    font-variant-numeric: tabular-nums;
  }

  .files {
    gap: 1px;
  }

  .arrow {
    margin: 0 4px 0 0;
  }

  .trip .arrow {
    margin: 0 6px;
  }

  .tag {
    padding: 0 6px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    color: var(--ink-soft);
    font-size: 11px;
  }

  .trip {
    line-height: 1.8;
  }

  .kind {
    color: var(--ink-faint);
    font-size: 11.5px;
    font-weight: 600;
  }

  .description {
    margin-top: 6px;
  }

  .note {
    margin-top: 10px;
    font-size: 12px;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 3px 14px;
    margin: 0;
  }

  dt {
    color: var(--ink-soft);
  }

  dd {
    margin: 0;
  }

  .patterns dd {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
  }

  .metrics dt {
    cursor: help;
  }

  .metrics dd {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
