<script lang="ts">
  import type { StructureEdge, StructureRow, StructureView } from '../../../shared/ipc'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { nodeLabel } from '../lib/structure'

  // The dependency structure matrix of the level: row i and column i are the same node, a
  // cell is the Dependency of its row on its column. Rows come after what they use, so below
  // the diagonal a row uses what stands above it, and above the diagonal lies only what closes
  // a Cycle. Only the cells that hold something are elements; the grid is a background.
  let { view }: { view: StructureView } = $props()

  /** The side of a cell, and the width of the band an expanded Component takes on the left. */
  const CELL = 26
  const BAND = 18
  const LABEL = 230

  const matrix = $derived(view.matrix)
  const rows = $derived(matrix.rows)
  const indexOf = $derived(new Map(rows.map((row, index) => [row.id, index])))
  const bands = $derived(Math.max(0, ...rows.map((row) => row.depth)))
  const head = $derived(bands * BAND + LABEL)
  const size = $derived(rows.length * CELL)
  const selection = $derived(app.active?.structure.selection)
  const selectedRow = $derived(selection?.kind === 'node' ? indexOf.get(selection.id) : undefined)

  const labelAt = (index: number): string => nodeLabel(rows[index]!)
  const isAbove = (cell: StructureEdge): boolean => indexOf.get(cell.from)! < indexOf.get(cell.to)!
  const isSelected = (cell: StructureEdge): boolean =>
    selection?.kind === 'edge' && selection.from === cell.from && selection.to === cell.to
  const select = (row: StructureRow): void => app.selectInStructure({ kind: 'node', id: row.id })
</script>

<div class="matrix-view">
  {#if rows.length === 0}
    <p class="empty">{t.structure.graph.empty}</p>
  {:else}
    <div class="scroll">
      <div
        class="matrix"
        role="group"
        aria-label={t.structure.matrix.label}
        style:width="{head + size + 1}px"
        style:height="{CELL + size + 1}px"
      >
        <div class="columns" style:left="{head}px" style:width="{size}px" aria-hidden="true">
          {#each rows as row, index (row.id)}
            <span
              class="number"
              class:selected={selectedRow === index}
              style:left="{index * CELL}px"
              style:width="{CELL}px"
              title={nodeLabel(row)}>{index + 1}</span
            >
          {/each}
        </div>

        <div class="rows" style:top="{CELL}px" style:width="{head}px">
          {#each matrix.groups as group (group.id)}
            <div
              class="band"
              class:selected={selection?.kind === 'node' && selection.id === group.id}
              style:left="{group.depth * BAND}px"
              style:top="{group.first * CELL}px"
              style:height="{(group.last - group.first + 1) * CELL}px"
              style:width="{BAND - 2}px"
            >
              <button
                class="toggle"
                title={t.structure.matrix.collapse(group.name)}
                aria-label={t.structure.matrix.collapse(group.name)}
                aria-expanded="true"
                onclick={() => app.expandInMatrix(group.id, false)}>▾</button
              >
              <button
                class="band-name"
                title={group.name}
                onclick={() => app.selectInStructure({ kind: 'node', id: group.id })}
                ondblclick={() => app.openComponent(group.id)}><span>{group.name}</span></button
              >
            </div>
          {/each}
          {#each rows as row, index (row.id)}
            <div
              class="row-head {row.kind}"
              class:selected={selectedRow === index}
              style:top="{index * CELL}px"
              style:left="{row.depth * BAND}px"
              style:height="{CELL}px"
              style:width="{head - row.depth * BAND}px"
            >
              {#if row.expandable}
                <button
                  class="toggle"
                  title={t.structure.matrix.expand(row.name)}
                  aria-label={t.structure.matrix.expand(row.name)}
                  aria-expanded="false"
                  onclick={() => app.expandInMatrix(row.id, true)}>▸</button
                >
              {:else}
                <span class="toggle"></span>
              {/if}
              <button
                class="label"
                title={row.kind === 'source-file' ? row.id : nodeLabel(row)}
                aria-pressed={selectedRow === index}
                onclick={() => select(row)}
                ondblclick={() => row.kind === 'component' && app.openComponent(row.id)}
                >{nodeLabel(row)}</button
              >
              <span class="number">{index + 1}</span>
            </div>
          {/each}
        </div>

        <div
          class="cells"
          style:left="{head}px"
          style:top="{CELL}px"
          style:width="{size + 1}px"
          style:height="{size + 1}px"
          style:--cell="{CELL}px"
        >
          {#if selectedRow !== undefined}
            <div
              class="cross"
              style:top="{selectedRow * CELL}px"
              style:height="{CELL}px"
              style:width="{size}px"
            ></div>
            <div
              class="cross"
              style:left="{selectedRow * CELL}px"
              style:width="{CELL}px"
              style:height="{size}px"
            ></div>
          {/if}
          {#each rows as row, index (row.id)}
            <span
              class="diagonal"
              style:left="{index * CELL}px"
              style:top="{index * CELL}px"
              style:width="{CELL}px"
              style:height="{CELL}px"
            ></span>
          {/each}
          {#each matrix.groups as group (group.id)}
            <div
              class="box group"
              style:left="{group.first * CELL}px"
              style:top="{group.first * CELL}px"
              style:width="{(group.last - group.first + 1) * CELL}px"
              style:height="{(group.last - group.first + 1) * CELL}px"
            ></div>
          {/each}
          {#each matrix.cycles as cycle, position (position)}
            <div
              class="box cycle"
              style:left="{cycle.first * CELL}px"
              style:top="{cycle.first * CELL}px"
              style:width="{(cycle.last - cycle.first + 1) * CELL}px"
              style:height="{(cycle.last - cycle.first + 1) * CELL}px"
            ></div>
          {/each}
          {#each matrix.cells as cell (`${cell.from}\n${cell.to}`)}
            {@const row = indexOf.get(cell.from)!}
            {@const column = indexOf.get(cell.to)!}
            <button
              class="cell"
              class:above={isAbove(cell)}
              class:type-only={cell.typeOnly}
              class:selected={isSelected(cell)}
              style:left="{column * CELL}px"
              style:top="{row * CELL}px"
              style:width="{CELL}px"
              style:height="{CELL}px"
              title={t.structure.matrix.cell(labelAt(row), labelAt(column), cell.weight)}
              aria-label={t.structure.matrix.cell(labelAt(row), labelAt(column), cell.weight)}
              onclick={() => app.selectInStructure({ kind: 'edge', from: cell.from, to: cell.to })}
              >{cell.weight}</button
            >
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <footer>
    <p class="reading">{t.structure.matrix.howToRead}</p>
    <ul class="legend" aria-label={t.structure.matrix.legend}>
      <li><span class="sample">3</span>{t.structure.matrix.below}</li>
      <li><span class="sample above">1</span>{t.structure.matrix.above}</li>
      <li><span class="sample type-only">2</span>{t.structure.graph.typeOnly}</li>
      <li><span class="sample box-sample"></span>{t.structure.matrix.cycle}</li>
    </ul>
  </footer>
</div>

<style>
  .matrix-view {
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

  .matrix {
    position: relative;
  }

  .columns,
  .rows,
  .cells {
    position: absolute;
  }

  .columns {
    top: 0;
    height: 26px;
  }

  .columns .number {
    position: absolute;
    bottom: 3px;
    text-align: center;
    font-size: 11px;
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
  }

  .number.selected {
    color: var(--focus);
    font-weight: 600;
  }

  .rows {
    left: 0;
  }

  .row-head {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 2px;
    padding-right: 6px;
    border-top: 1px solid var(--line);
  }

  .row-head.selected {
    background: var(--selected);
  }

  .row-head .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: left;
    font-weight: 500;
  }

  .row-head.source-file .label {
    font-family: var(--code);
    font-size: 12px;
    font-weight: 400;
  }

  .row-head.own-files .label,
  .row-head.unassigned .label {
    color: var(--ink-soft);
    font-weight: 400;
  }

  .row-head .label:hover {
    text-decoration: underline;
  }

  .row-head .number {
    flex: none;
    min-width: 22px;
    text-align: right;
    font-size: 11px;
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
  }

  .toggle {
    flex: none;
    width: 16px;
    color: var(--ink-faint);
    font-size: 11px;
    text-align: center;
  }

  button.toggle:hover {
    color: var(--focus);
  }

  .band {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--panel);
    overflow: hidden;
  }

  .band.selected {
    border-color: var(--focus);
    background: var(--selected);
  }

  .band .toggle {
    flex: none;
    height: 18px;
  }

  .band-name {
    flex: 1;
    width: 100%;
    min-height: 0;
    overflow: hidden;
    color: var(--ink-soft);
    font-size: 11px;
    font-weight: 600;
  }

  .band-name span {
    display: inline-block;
    max-height: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
  }

  .cells {
    background-color: var(--paper);
    background-image:
      linear-gradient(to right, var(--line) 1px, transparent 1px),
      linear-gradient(to bottom, var(--line) 1px, transparent 1px);
    background-size: var(--cell) var(--cell);
  }

  .cells > * {
    position: absolute;
  }

  .cross {
    background: var(--selected);
    opacity: 0.6;
  }

  .diagonal {
    background: var(--line-strong);
    opacity: 0.45;
  }

  .box {
    pointer-events: none;
  }

  .box.group {
    border: 1px solid var(--ink-faint);
  }

  .box.cycle {
    border: 2px solid var(--problem);
    border-radius: 2px;
    opacity: 0.7;
  }

  .cell {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }

  .cell:hover {
    background: var(--hover);
  }

  .cell.above {
    background: color-mix(in srgb, var(--problem) 14%, transparent);
    color: var(--problem);
    font-weight: 600;
  }

  .cell.type-only {
    font-style: italic;
    color: var(--ink-soft);
  }

  .cell.above.type-only {
    color: var(--problem);
  }

  .cell.selected {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  footer {
    flex: none;
    padding: 8px 14px 10px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--ink-soft);
  }

  footer .reading {
    margin: 0 0 6px;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 18px;
    padding: 0;
    list-style: none;
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sample {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 18px;
    border: 1px solid var(--line);
    background: var(--paper);
    font-size: 11px;
  }

  .sample.above {
    background: color-mix(in srgb, var(--problem) 14%, var(--paper));
    color: var(--problem);
    font-weight: 600;
  }

  .sample.type-only {
    font-style: italic;
  }

  .sample.box-sample {
    border: 2px solid var(--problem);
    opacity: 0.7;
  }

  .empty {
    max-width: 34rem;
    padding: 18px 14px;
    color: var(--ink-soft);
    line-height: 1.55;
  }
</style>
