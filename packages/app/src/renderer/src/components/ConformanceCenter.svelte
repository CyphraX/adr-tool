<script lang="ts">
  import type { ConformanceView } from '../../../shared/ipc'
  import { edgeKey, exceptionNames, violationsOnLevel } from '../lib/conformance'
  import { wordConformance } from '../lib/said'
  import { app, type StructureSelection } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import CodeViewer from './CodeViewer.svelte'
  import StructureGraph from './StructureGraph.svelte'

  // The middle of Conformance: the Violations of every Rule, or of the one chosen in the
  // sidebar, as a list or drawn red on Structure's drawing of a level; or the Exceptions. A
  // file opened from the details — a Source File at an import, the Rules file at a Rule —
  // takes their place until the way back is chosen.
  let { view }: { view: ConformanceView } = $props()

  const conformance = $derived(app.active?.conformance)
  const show = $derived(conformance?.show ?? 'list')
  const code = $derived(conformance?.code)
  const rule = $derived(conformance?.rule)
  const selection = $derived(conformance?.selection)
  const shown = $derived(
    rule === undefined ? view.violations : view.violations.filter((one) => one.rule === rule)
  )
  const open = $derived(shown.filter((violation) => !violation.exception))
  const accepted = $derived(shown.filter((violation) => violation.exception))
  // The keyboard goes through the list in the order it shows: the open Violations first.
  const ordered = $derived([...open, ...accepted])
  const graph = $derived(conformance?.graph)
  const onLevel = $derived(graph && violationsOnLevel(graph, shown))
  const switches = ['list', 'graph'] as const

  const selectedKey = $derived(selection?.kind === 'violation' ? selection.key : undefined)
  const selectedLine = $derived(selection?.kind === 'exception' ? selection.line : undefined)
  // What the drawing marks as selected: what was clicked in it, or the line or box of the
  // Violation selected in the list or the details.
  const graphSelection = $derived.by((): StructureSelection | undefined => {
    if (conformance?.graphSelection) return conformance.graphSelection
    if (!onLevel || selectedKey === undefined) return undefined
    for (const [key, list] of onLevel.edges) {
      if (list.some((violation) => violation.key === selectedKey)) {
        const [from, to] = key.split('\n') as [string, string]
        return { kind: 'edge', from, to }
      }
    }
    for (const [id, list] of onLevel.nodes) {
      if (list.some((violation) => violation.key === selectedKey)) return { kind: 'node', id }
    }
    return undefined
  })

  const idOf = (key: string): string =>
    `violation-${Array.from(key, (character) => character.charCodeAt(0).toString(36)).join('')}`

  // Wherever the selection came from — the Component page, an ADR, the graph — the list shows it.
  $effect(() => {
    const id =
      selectedKey !== undefined
        ? idOf(selectedKey)
        : selectedLine !== undefined
          ? `exception-${selectedLine}`
          : undefined
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'nearest' })
  })

  function step(event: KeyboardEvent): number {
    return event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
  }

  function onViolationKey(event: KeyboardEvent): void {
    const by = step(event)
    if (by === 0 || ordered.length === 0) return
    event.preventDefault()
    const position = ordered.findIndex((violation) => violation.key === selectedKey)
    const next = ordered[Math.max(0, Math.min(ordered.length - 1, position + by))]
    if (next) app.selectInConformance({ kind: 'violation', key: next.key })
  }

  function onExceptionKey(event: KeyboardEvent): void {
    const by = step(event)
    if (by === 0 || view.exceptions.length === 0) return
    event.preventDefault()
    const position = view.exceptions.findIndex((exception) => exception.line === selectedLine)
    const next = view.exceptions[Math.max(0, Math.min(view.exceptions.length - 1, position + by))]
    if (next) app.selectInConformance({ kind: 'exception', line: next.line })
  }

  /** In the drawing: a line or a box, with the first Violation behind it. */
  function selectInGraph(selected: StructureSelection): void {
    const found =
      selected.kind === 'edge'
        ? onLevel?.edges.get(edgeKey(selected))
        : selected.kind === 'node'
          ? onLevel?.nodes.get(selected.id)
          : undefined
    app.selectInConformanceGraph(selected, found?.[0]?.key)
  }

  const title = $derived(
    show === 'exceptions'
      ? t.conformance.center.exceptions
      : rule === undefined
        ? t.conformance.center.all
        : t.conformance.center.ofRule(rule)
  )
</script>

{#snippet violationRow(violation: (typeof ordered)[number])}
  <!-- The keyboard is handled by the listbox around the rows. -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    id={idOf(violation.key)}
    class="row"
    class:accepted={violation.exception}
    class:selected={violation.key === selectedKey}
    role="option"
    tabindex="-1"
    aria-selected={violation.key === selectedKey}
    onclick={() => app.selectInConformance({ kind: 'violation', key: violation.key })}
  >
    <span class="sentence">{wordConformance(violation.said)}</span>
    <span class="facts">
      <code>{violation.rule}</code>
      {#if violation.dependencies.length > 0}
        <span>{t.structure.graph.weight(violation.dependencies.length)}</span>
      {/if}
    </span>
  </div>
{/snippet}

<div class="center">
  <div class="head">
    {#if show === 'graph' && graph && !code}
      <nav class="way" aria-label={t.structure.graph.way}>
        {#if graph.path.length === 0}
          <span class="here">{title}</span>
        {:else}
          <button onclick={() => app.openInConformanceGraph(undefined)}>{title}</button>
          {#each graph.path as step, position (step.id)}
            <span class="between" aria-hidden="true">›</span>
            {#if position === graph.path.length - 1}
              <span class="here">{step.name}</span>
            {:else}
              <button onclick={() => app.openInConformanceGraph(step.id)}>{step.name}</button>
            {/if}
          {/each}
        {/if}
      </nav>
    {:else}
      <h2>{title}</h2>
    {/if}
    <span class="tools">
      {#if show !== 'exceptions'}
        <span class="switch" role="group" aria-label={t.conformance.center.show}>
          {#each switches as candidate (candidate)}
            <button
              class:current={!code && show === candidate}
              aria-pressed={!code && show === candidate}
              onclick={() => app.showInConformance(candidate)}
            >
              {t.conformance.center[candidate]}
            </button>
          {/each}
        </span>
      {/if}
      <button class="tool" title={t.conformance.newRuleHint} onclick={() => app.startRule()}>
        {t.conformance.newRule}
      </button>
    </span>
  </div>

  {#if code}
    <CodeViewer
      {code}
      back={{ label: t.conformance.center.back(show), go: () => app.closeConformanceCode() }}
    />
  {:else if show === 'exceptions'}
    {#if view.exceptions.length === 0}
      <p class="empty">{t.conformance.center.noExceptions}</p>
    {:else}
      <div
        class="rows"
        role="listbox"
        tabindex="0"
        aria-label={t.conformance.center.exceptions}
        aria-activedescendant={selectedLine === undefined ? undefined : `exception-${selectedLine}`}
        onkeydown={onExceptionKey}
      >
        {#each view.exceptions as exception (exception.line)}
          <!-- The keyboard is handled by the listbox around the rows. -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            id="exception-{exception.line}"
            class="row exception"
            class:unmatched={exception.accepts.length === 0}
            class:selected={exception.line === selectedLine}
            role="option"
            tabindex="-1"
            aria-selected={exception.line === selectedLine}
            onclick={() => app.selectInConformance({ kind: 'exception', line: exception.line })}
          >
            <span class="sentence"><code>{exceptionNames(exception)}</code></span>
            <span class="facts">
              <code>{exception.rule}</code>
              <span class="reason">{exception.reason}</span>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  {:else if !view.present || view.rules.length === 0}
    <p class="empty">{t.conformance.center.noRules}</p>
  {:else if show === 'graph'}
    {#if graph && onLevel}
      <StructureGraph
        view={graph}
        selection={graphSelection}
        onselect={selectInGraph}
        onopen={(id) => app.openInConformanceGraph(id)}
        violations={onLevel}
      />
    {:else}
      <p class="empty" role="status">{t.structure.analysing}</p>
    {/if}
  {:else if shown.length === 0}
    <p class="empty">
      {rule === undefined ? t.conformance.center.none : t.conformance.center.noneOfRule}
    </p>
  {:else}
    {#if open.length === 0}
      <p class="empty">{t.conformance.center.allAccepted}</p>
    {/if}
    <div
      class="rows"
      role="listbox"
      tabindex="0"
      aria-label={title}
      aria-activedescendant={selectedKey === undefined ? undefined : idOf(selectedKey)}
      onkeydown={onViolationKey}
    >
      {#each open as violation (violation.key)}{@render violationRow(violation)}{/each}
      {#if accepted.length > 0}
        <div role="group" aria-labelledby="accepted-head">
          <h3 id="accepted-head" role="presentation">{t.conformance.center.accepted}</h3>
          {#each accepted as violation (violation.key)}{@render violationRow(violation)}{/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .center {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--panel-raised);
    border-right: 1px solid var(--line);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
    min-height: 37px;
    padding: 6px 14px;
    border-bottom: 1px solid var(--line);
  }

  h2 {
    min-width: 0;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .way {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 6px;
    min-width: 0;
  }

  .way button {
    color: var(--focus);
  }

  .way button:hover {
    text-decoration: underline;
  }

  .here {
    font-weight: 600;
  }

  .between {
    color: var(--ink-faint);
  }

  .tools {
    display: flex;
    flex: none;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  .tool {
    padding: 3px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .tool:hover {
    background: var(--hover);
  }

  .switch {
    display: flex;
    border: 1px solid var(--line-strong);
    border-radius: 5px;
    overflow: hidden;
  }

  .switch button {
    padding: 2px 10px;
    font-size: 12px;
  }

  .switch button + button {
    border-left: 1px solid var(--line-strong);
  }

  .switch button:hover {
    background: var(--hover);
  }

  .switch button.current {
    background: var(--selected);
    font-weight: 600;
  }

  .rows {
    flex: 1;
    overflow-y: auto;
  }

  .row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 7px 14px 7px 11px;
    border-left: 3px solid var(--problem);
    border-bottom: 1px solid var(--line);
    cursor: default;
  }

  /* An Exception that accepts nothing is a Problem; one that accepts something is fine. */
  .row.accepted,
  .row.exception {
    border-left-color: var(--line-strong);
  }

  .row.exception.unmatched {
    border-left-color: var(--problem);
  }

  .row:hover {
    background: var(--hover);
  }

  .row.selected {
    background: var(--selected);
  }

  .sentence {
    line-height: 1.45;
  }

  .row.accepted .sentence {
    color: var(--ink-soft);
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0 10px;
    color: var(--ink-faint);
    font-size: 12px;
  }

  .reason {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  code {
    font-family: var(--code);
    font-size: 0.92em;
  }

  h3 {
    padding: 14px 14px 6px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  .empty {
    padding: 18px 14px;
    color: var(--ink-soft);
    line-height: 1.5;
  }
</style>
