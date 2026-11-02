<script lang="ts">
  import type { DecisionLog } from '@adr-tool/core'
  import { problemsOf } from '../lib/problems'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { boardOf, moveOf, type StatusKey } from '../lib/views'
  import { STATUS_LABEL, prefixOf } from '../lib/wording'
  import StatusMark from './StatusMark.svelte'

  // The ADRs of the Decision Log in view by Status, one column each (docs/plan-roadmap.md,
  // part 11). Dragging a card to another column is the operation that move stands for,
  // previewed as from the ADR's detail; the detail has the same operations as buttons.
  let { log }: { log: DecisionLog } = $props()

  const columns = $derived(boardOf(log.adrs))
  const selectedId = $derived(app.selected?.id)
  const changed = $derived(app.active?.repository.git?.changed ?? [])

  /** The type of what a card carries while it is dragged: its ID, for the board alone. */
  const CARD = 'application/x-softarch-adr'

  /** The card being dragged, and the column it is over. */
  let dragging = $state<string | undefined>(undefined)
  let over = $state<StatusKey | undefined>(undefined)
  const dragged = $derived(log.adrs.find((adr) => adr.id === dragging))

  /** What dropping the dragged card on a column would do, in a few words. */
  function hintFor(status: StatusKey): string | undefined {
    if (!dragged) return undefined
    const move = moveOf(dragged, status)
    if (move.kind === 'decide') return t.board.drop[move.decision]
    if (move.kind === 'supersede') return t.board.drop.supersede
    return undefined
  }

  function ondragstart(event: DragEvent, id: string): void {
    dragging = id
    // Not as text: dropped on the editor beside the board, a card would be typed into the ADR.
    event.dataTransfer?.setData(CARD, id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  function ondragover(event: DragEvent, status: StatusKey): void {
    if (!dragged || moveOf(dragged, status).kind === 'stay') return
    // Every other column takes the drop: one that is no move says why.
    event.preventDefault()
    over = status
  }

  function ondrop(event: DragEvent, status: StatusKey): void {
    event.preventDefault()
    const id = dragging
    dragging = undefined
    over = undefined
    if (id) app.move(id, status)
  }

  function ondragend(): void {
    dragging = undefined
    over = undefined
  }
</script>

<div class="board">
  <div class="head">
    <h2>{t.sidebar.board}</h2>
    <span class="tools">
      <button onclick={() => app.startSearching()}>{t.search}</button>
      <button onclick={() => app.show('adrs')}>{t.backToAdrs}</button>
    </span>
  </div>
  <p class="lead">{t.board.lead}</p>

  <div class="columns" aria-label={t.board.label}>
    {#each columns as column (column.status)}
      {@const hint = hintFor(column.status)}
      <section
        class="column {column.status}"
        class:open={hint !== undefined}
        class:closed={dragged !== undefined &&
          hint === undefined &&
          moveOf(dragged, column.status).kind !== 'stay'}
        class:over={over === column.status}
        aria-label={STATUS_LABEL[column.status]}
        ondragover={(event) => ondragover(event, column.status)}
        ondragleave={() => (over = over === column.status ? undefined : over)}
        ondrop={(event) => ondrop(event, column.status)}
      >
        <h3>
          <StatusMark status={column.status} />
          {STATUS_LABEL[column.status]}
          <span class="count">{column.adrs.length}</span>
        </h3>
        {#if hint}
          <p class="hint">{hint}</p>
        {/if}
        <ul>
          {#each column.adrs as adr (adr.id)}
            {@const problems = problemsOf(app.problemGroups, adr.id).filter(
              (own) => !own.cause
            ).length}
            <li>
              <button
                id="card-{adr.id}"
                class="card"
                class:selected={adr.id === selectedId}
                class:dragging={adr.id === dragging}
                aria-current={adr.id === selectedId}
                draggable="true"
                ondragstart={(event) => ondragstart(event, adr.id)}
                {ondragend}
                onclick={() => app.select(adr.id)}
              >
                <span class="prefix">{prefixOf(adr)}</span>
                <span class="title">{adr.title ?? adr.id}</span>
                <span class="facts">
                  {adr.metadata.decided ?? adr.metadata.created ?? ''}
                  {#if changed.includes(adr.path)}
                    <span class="uncommitted" title={t.list.uncommitted}></span>
                  {/if}
                  {#if problems > 0}
                    <span class="problems" title={t.problemCount(problems)}>{problems}</span>
                  {/if}
                </span>
              </button>
            </li>
          {:else}
            <li class="none">{t.board.empty}</li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
</div>

<style>
  .board {
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
    justify-content: space-between;
    flex: none;
    padding: 6px 14px;
    border-bottom: 1px solid var(--line);
  }

  h2 {
    font-size: 13px;
    font-weight: 600;
  }

  .tools {
    display: flex;
    gap: 8px;
  }

  .head button {
    padding: 3px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .head button:hover {
    background: var(--hover);
  }

  .lead {
    flex: none;
    padding: 8px 14px;
    color: var(--ink-soft);
  }

  .columns {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(11rem, 1fr);
    gap: 10px;
    padding: 0 14px 14px;
    overflow: auto;
  }

  .column {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel);
    transition: opacity 0.1s;
  }

  .column.open {
    border-color: var(--focus);
    border-style: dashed;
  }

  .column.over {
    background: var(--selected);
  }

  .column.closed {
    opacity: 0.55;
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px 6px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .count {
    margin-left: auto;
    color: var(--ink-faint);
    font-weight: 400;
  }

  .hint {
    margin: 0 10px 6px;
    color: var(--focus);
    font-size: 12px;
  }

  ul {
    flex: 1;
    min-height: 2rem;
    list-style: none;
    margin: 0;
    padding: 0 8px 8px;
    overflow-y: auto;
  }

  li + li {
    margin-top: 6px;
  }

  .none {
    padding: 4px 2px;
    color: var(--ink-faint);
  }

  .card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 2px 6px;
    width: 100%;
    padding: 7px 9px;
    border: 1px solid var(--line-strong);
    border-radius: 5px;
    background: var(--paper);
    text-align: left;
    cursor: grab;
  }

  .card:hover {
    background: var(--hover);
  }

  .card.selected {
    border-color: var(--focus);
    background: var(--selected);
  }

  .card.dragging {
    opacity: 0.5;
  }

  .prefix {
    color: var(--ink-soft);
    font-family: var(--code);
    font-size: 12px;
    line-height: 1.6;
  }

  .title {
    line-height: 1.35;
  }

  .facts {
    grid-column: 2;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-faint);
    font-size: 11.5px;
    white-space: nowrap;
  }

  .uncommitted {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--proposed);
  }

  .problems {
    padding: 0 5px;
    border-radius: 8px;
    background: var(--rejected);
    color: var(--paper);
    font-size: 11px;
  }
</style>
