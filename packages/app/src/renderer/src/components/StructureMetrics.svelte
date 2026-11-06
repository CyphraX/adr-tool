<script lang="ts">
  import { LOWER_BOUND, type StructureNode, type StructureView } from '../../../shared/ipc'
  import { app } from '../lib/state.svelte'
  import { METRICS, t, type MetricKey } from '../lib/strings'
  import { nodeLabel, opens } from '../lib/structure'

  // The metrics of the nodes of the level, one row each, with every definition in the
  // tooltip of its heading. Only a Component has metrics beyond its size.
  let { view }: { view: StructureView } = $props()

  const selection = $derived(app.active?.structure.selection)
  // Where a Component of the level counts Java, Python or Go, its numbers are a lower bound.
  const lowerBound = $derived(
    LOWER_BOUND.filter((language) =>
      view.components.some(
        (component) => component.level === view.parent && component.lowerBound.includes(language)
      )
    )
  )

  // The rows are a list the arrows move through, as every list of the window: the focus goes
  // to the next row's node, which is selected; Enter opens a Component, as a double click does.
  function onkeydown(event: KeyboardEvent): void {
    const by = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (by === 0) return
    const rows = [...(event.currentTarget as HTMLElement).querySelectorAll('button')]
    const position = rows.indexOf(event.target as HTMLButtonElement)
    const next = view.nodes[Math.max(0, Math.min(view.nodes.length - 1, position + by))]
    if (!next) return
    event.preventDefault()
    rows[view.nodes.indexOf(next)]?.focus()
    app.selectInStructure({ kind: 'node', id: next.id })
  }

  function onopen(event: KeyboardEvent, node: StructureNode): void {
    if (event.key !== 'Enter' || !opens(node)) return
    event.preventDefault()
    app.openComponent(node.id)
  }

  function valueOf(node: StructureNode, key: MetricKey): number | undefined {
    if (key === 'files') return node.files
    if (key === 'lines') return node.lines
    return node.metrics?.[key]
  }
</script>

<div class="metrics-view">
  <div class="scroll">
    <table aria-label={t.structure.metrics.label}>
      <thead>
        <tr>
          <th scope="col" class="node">{t.structure.metrics.node}</th>
          {#each METRICS as key (key)}
            <th scope="col" title={t.structure.metric[key].definition}>
              {t.structure.metric[key].short}
            </th>
          {/each}
        </tr>
      </thead>
      <!-- The keys come from the buttons of the rows, which hold the focus. -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <tbody {onkeydown}>
        {#each view.nodes as node (node.id)}
          {@const selected = selection?.kind === 'node' && selection.id === node.id}
          <tr class:selected class={node.kind}>
            <th scope="row" class="node">
              <button
                aria-pressed={selected}
                title={node.kind === 'source-file' ? node.id : nodeLabel(node)}
                onclick={() => app.selectInStructure({ kind: 'node', id: node.id })}
                ondblclick={() => opens(node) && app.openComponent(node.id)}
                onkeydown={(event) => onopen(event, node)}>{nodeLabel(node)}</button
              >
            </th>
            {#each METRICS as key (key)}
              {@const value = valueOf(node, key)}
              {#if !opens(node) && key !== 'files' && key !== 'lines'}
                <td></td>
              {:else if value === undefined}
                <td class="undefined" title={t.structure.undefinedValue}
                  >{t.structure.value(key, value)}</td
                >
              {:else}
                <td>{t.structure.value(key, value)}</td>
              {/if}
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <footer>
    <p title={t.structure.metrics.propagationCostDefinition}>
      {t.structure.metrics.propagationCost(view.propagationCost)}
    </p>
    <p>{t.structure.metrics.howToRead}</p>
    {#each lowerBound as language (language)}
      <p>{t.structure.metrics.lowerBound[language]}</p>
    {/each}
  </footer>
</div>

<style>
  .metrics-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 10px 14px 14px;
  }

  table {
    border-collapse: collapse;
    background: var(--paper);
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 4px 10px;
    border-bottom: 1px solid var(--line);
    text-align: right;
    white-space: nowrap;
  }

  thead th {
    position: sticky;
    top: 0;
    background: var(--panel);
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-soft);
    cursor: help;
  }

  .node {
    max-width: 260px;
    text-align: left;
  }

  thead .node {
    cursor: default;
  }

  tbody th button {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
    text-align: left;
  }

  tbody th button:hover {
    text-decoration: underline;
  }

  tr.source-file th button {
    font-family: var(--code);
    font-size: 12px;
    font-weight: 400;
  }

  tr.directory th button {
    font-family: var(--code);
    font-size: 12px;
  }

  tr.own-files th button,
  tr.unassigned th button {
    color: var(--ink-soft);
    font-weight: 400;
  }

  tbody tr:hover {
    background: var(--hover);
  }

  tbody tr.selected {
    background: var(--selected);
  }

  .undefined {
    color: var(--ink-faint);
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
