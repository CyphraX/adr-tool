<script lang="ts">
  import type { Diagram, Drift } from '@adr-tool/diagrams'
  import type { DeclaredComponent } from '@adr-tool/structure/model'
  import type { DiagramsTab } from '../lib/diagrams-tab.svelte'
  import {
    componentsOfLevel,
    idFromName,
    isElementId,
    placed,
    readingOrder
  } from '../lib/diagram-canvas'
  import { wordDiagramProblem, wordDrift } from '../lib/diagram-words'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { codeSpans } from '../lib/wording'
  import { geometryOf } from '@adr-tool/diagrams'
  import DiagramCanvas from './DiagramCanvas.svelte'
  import Picker from './Picker.svelte'

  // The centre of the Diagrams module: the Diagram on the canvas, with its tools at the head,
  // beside it the list that says it in sentences and names its Drift, and its legend at the foot.
  let { diagrams, diagram }: { diagrams: DiagramsTab; diagram: Diagram } = $props()

  const overview = $derived(diagrams.overview!)
  const entry = $derived(diagrams.entry!)
  const declared = $derived({
    origin: overview.declared.origin,
    components: overview.declared.components
  })
  const current = $derived(diagrams.current)
  const geometry = $derived(geometryOf(diagram, declared))
  const nameOf = $derived(new Map(geometry.boxes.map((box) => [box.id, box.name])))
  const name = (id: string): string => nameOf.get(id) ?? id
  const ids = $derived(new Set(diagram.elements.map((element) => element.id)))

  /** What a tool of the head has open: the picker of Components, or the form of an External System. */
  let adding = $state<'component' | 'external' | undefined>(undefined)
  let external = $state({ name: '', description: '', id: '', idWritten: false })

  const candidates = $derived(
    overview.declared.origin === 'declared'
      ? componentsOfLevel(overview.declared.components, diagram.level, diagram.scope).filter(
          (component) => !ids.has(component.id)
        )
      : []
  )
  const externalId = $derived(external.idWritten ? external.id : idFromName(external.name, ids))
  const externalValid = $derived(
    external.name.trim() !== '' && isElementId(externalId) && !ids.has(externalId)
  )

  function addComponent(id: string): void {
    if (
      app.diagrams.edit({
        kind: 'add-element',
        element: placed({ kind: 'component', id }, geometry.boxes, declared)
      })
    ) {
      app.diagrams.select({ kind: 'element', id })
    }
    adding = undefined
  }

  function addExternal(event: SubmitEvent): void {
    event.preventDefault()
    if (!externalValid) return
    const id = externalId
    const description = external.description.trim()
    const added = app.diagrams.edit({
      kind: 'add-element',
      element: placed(
        {
          kind: 'external',
          id,
          ...(external.name.trim() !== id && { name: external.name.trim() }),
          ...(description !== '' && { description })
        },
        geometry.boxes,
        declared
      )
    })
    if (added) {
      app.diagrams.select({ kind: 'element', id })
      external = { name: '', description: '', id: '', idWritten: false }
      adding = undefined
    }
  }

  const sentences = $derived(readingOrder(geometry.boxes))
  const driftOf = (one: Drift): string => wordDrift(one)
  const hasConnection = (one: Drift): boolean =>
    one.kind === 'connection-not-in-code' &&
    diagram.connections.some(
      (connection) => connection.from === one.from && connection.to === one.to
    )
  const drawable = (one: Drift): boolean =>
    one.kind === 'dependency-not-in-diagram' && ids.has(one.from) && ids.has(one.to)
  const kinds = $derived(
    (['component', 'external', 'repository'] as const).filter((kind) =>
      geometry.boxes.some((box) => box.kind === kind)
    )
  )
  const title = $derived(entry.title ?? entry.id)
</script>

{#snippet withCode(text: string)}
  {#each codeSpans(text) as part, position (position)}{#if part.code}<code>{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

{#snippet option(component: DeclaredComponent)}
  <span>{component.name}</span>
  {#if component.name !== component.id}<code class="faint">{component.id}</code>{/if}
{/snippet}

<div class="center">
  <div class="head">
    <h2 title={entry.path}>{title}</h2>
    <div class="tools" role="toolbar" aria-label={t.diagrams.tools}>
      <button
        class:current={adding === 'component'}
        aria-expanded={adding === 'component'}
        onclick={() => (adding = adding === 'component' ? undefined : 'component')}
      >
        {t.diagrams.addComponent}
      </button>
      <button
        class:current={adding === 'external'}
        aria-expanded={adding === 'external'}
        onclick={() => (adding = adding === 'external' ? undefined : 'external')}
      >
        {t.diagrams.addExternal}
      </button>
      <button
        disabled={diagrams.unsaved === 0}
        title={t.diagrams.undoHint}
        onclick={() => app.diagrams.undo()}
      >
        {t.diagrams.undo}
      </button>
      <button
        disabled={diagrams.unsaved > 0}
        title={diagrams.unsaved > 0 ? t.diagrams.saveFirst : undefined}
        onclick={() => void app.diagrams.exportSvg()}
      >
        {t.diagrams.exportSvg}
      </button>
      <button
        class="primary"
        disabled={diagrams.unsaved === 0}
        title={t.diagrams.saveHint}
        onclick={() => void app.diagrams.save()}
      >
        {t.save}
      </button>
    </div>
  </div>

  {#if adding === 'component'}
    <div class="adding">
      {#if diagram.level === 'system-context'}
        <p class="faint">{t.diagrams.noComponentHere}</p>
      {:else if overview.declared.origin !== 'declared'}
        <p class="faint">{t.diagrams.new.noComponents}</p>
      {:else}
        <Picker
          {candidates}
          label={t.diagrams.addComponentLabel}
          placeholder={t.diagrams.findComponent}
          noneLeft={t.diagrams.everyComponentShown}
          textOf={(component) => `${component.name} ${component.id}`}
          {option}
          onpick={addComponent}
        />
      {/if}
    </div>
  {:else if adding === 'external'}
    <form class="adding external" onsubmit={addExternal}>
      <label>
        <span>{t.diagrams.externalName}</span>
        <input bind:value={external.name} spellcheck="false" autocomplete="off" />
      </label>
      <label class="wide">
        <span>{t.diagrams.externalDescription}</span>
        <input bind:value={external.description} autocomplete="off" />
      </label>
      <label title={t.diagrams.externalIdHint}>
        <span>{t.diagrams.externalId}</span>
        <input
          class="id"
          value={externalId}
          oninput={(event) =>
            (external = { ...external, id: event.currentTarget.value, idWritten: true })}
          aria-invalid={external.name.trim() !== '' && !externalValid}
          spellcheck="false"
          autocomplete="off"
        />
      </label>
      <button type="submit" disabled={!externalValid}>{t.diagrams.add}</button>
    </form>
  {/if}

  {#if diagrams.held?.conflict}
    <div class="conflict" role="alert">
      <span>{diagrams.held.conflict}</span>
      <button onclick={() => app.diagrams.discard()}>{t.diagrams.discardChanges}</button>
    </div>
  {:else if diagrams.unsaved > 0}
    <p class="unsaved" role="status">{t.diagrams.unsaved(diagrams.unsaved)}</p>
  {/if}

  <div class="body">
    <DiagramCanvas {diagram} {declared} drift={current?.drift} selection={diagrams.selection} />

    <aside class="says" aria-label={t.diagrams.says}>
      <h3>{t.diagrams.says}</h3>
      {#if diagram.description}<p class="what">{diagram.description}</p>{/if}
      {#if sentences.length === 0}<p class="faint">{t.diagrams.saysNothing}</p>{/if}
      <ul>
        {#each sentences as box (box.id)}
          <li>
            <button
              class:selected={diagrams.selection?.kind === 'element' &&
                diagrams.selection.id === box.id}
              onclick={() => app.diagrams.select({ kind: 'element', id: box.id })}
            >
              {t.diagrams.isElement(box.name, box.kind, box.lines.join(' ') || undefined)}
            </button>
          </li>
        {/each}
        {#each diagram.connections as connection (`${connection.from}\n${connection.to}`)}
          <li>
            <button
              class:selected={diagrams.selection?.kind === 'connection' &&
                diagrams.selection.from === connection.from &&
                diagrams.selection.to === connection.to}
              onclick={() =>
                app.diagrams.select({
                  kind: 'connection',
                  from: connection.from,
                  to: connection.to
                })}
            >
              {t.diagrams.uses(name(connection.from), name(connection.to), connection.label)}
            </button>
          </li>
        {/each}
      </ul>

      <h3>{t.diagrams.drift}</h3>
      {#if overview.declared.origin === 'draft'}
        <p class="faint">{t.diagrams.draftNoDrift}</p>
      {:else if !current}
        <p class="faint" role="status">{t.diagrams.analysing}</p>
      {:else if current.drift.length === 0}
        <p class="faint">{t.diagrams.noDrift}</p>
      {:else}
        <ul class="drift">
          {#each current.drift as one, position (position)}
            <li>
              {#if hasConnection(one) && one.kind === 'connection-not-in-code'}
                <button
                  onclick={() =>
                    app.diagrams.select({ kind: 'connection', from: one.from, to: one.to })}
                >
                  {driftOf(one)}
                </button>
              {:else}
                <span>{driftOf(one)}</span>
              {/if}
              {#if drawable(one) && one.kind === 'dependency-not-in-diagram'}
                <button
                  class="draw"
                  onclick={() => {
                    if (app.diagrams.edit({ kind: 'add-connection', from: one.from, to: one.to })) {
                      app.diagrams.select({ kind: 'connection', from: one.from, to: one.to })
                    }
                  }}
                >
                  {t.diagrams.draw}
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      {#if (current?.problems ?? entry.problems).length > 0}
        <h3>{t.diagrams.problems}</h3>
        <ul class="drift">
          {#each current?.problems ?? entry.problems as problem, position (position)}
            <li><span>{@render withCode(wordDiagramProblem(problem))}</span></li>
          {/each}
        </ul>
      {/if}
    </aside>
  </div>

  <footer>
    <p class="reading">{t.diagrams.howToRead}</p>
    <ul class="legend" aria-label={t.diagrams.legend}>
      {#each kinds as kind (kind)}
        <li><span class="swatch {kind}"></span>{t.diagrams.kinds[kind]}</li>
      {/each}
      <li>
        <svg width="34" height="10" aria-hidden="true">
          <path class="line" d="M1 5H30" />
          <path class="tip" d="M28 1.5L33 5L28 8.5z" />
        </svg>
        {t.diagrams.connection}
      </li>
      <li>
        <svg width="34" height="10" aria-hidden="true">
          <path class="line not-in-code" d="M1 5H30" />
          <path class="tip not-in-code" d="M28 1.5L33 5L28 8.5z" />
        </svg>
        {t.diagrams.notInCode}
      </li>
      <li>
        <svg width="34" height="10" aria-hidden="true">
          <path class="line perhaps" d="M1 5H30" />
          <path class="tip not-in-code" d="M28 1.5L33 5L28 8.5z" />
        </svg>
        {t.diagrams.perhapsNotInCode}
      </li>
      <li>
        <svg width="34" height="10" aria-hidden="true">
          <path class="line left-out" d="M1 5H30" />
          <path class="tip not-in-code left-out" d="M28 1.5L33 5L28 8.5z" />
        </svg>
        {t.diagrams.leftOut}
      </li>
    </ul>
  </footer>
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
    padding: 4px 14px;
    border-bottom: 1px solid var(--line);
  }

  h2 {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .tools button,
  .adding button,
  .conflict button,
  .draw {
    padding: 3px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
    white-space: nowrap;
  }

  .tools button:hover:not(:disabled),
  .adding button:hover:not(:disabled),
  .conflict button:hover,
  .draw:hover {
    background: var(--hover);
  }

  .tools button.current {
    background: var(--selected);
  }

  .tools button:disabled,
  .adding button:disabled {
    opacity: 0.5;
  }

  .tools .primary {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
    font-weight: 500;
  }

  .tools .primary:hover:not(:disabled) {
    border-color: var(--focus);
    background: var(--focus);
  }

  .adding {
    flex: none;
    padding: 8px 14px;
    border-bottom: 1px solid var(--line);
    background: var(--paper);
  }

  .adding.external {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px 12px;
  }

  .adding label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: var(--ink-soft);
  }

  .adding label.wide {
    flex: 1;
    min-width: 200px;
  }

  .adding input {
    padding: 3px 6px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
    color: var(--ink);
    font-size: 13px;
  }

  .adding input.id {
    width: 150px;
    font-family: var(--code);
    font-size: 12px;
  }

  .adding input[aria-invalid='true'] {
    border-color: var(--problem);
  }

  .conflict {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
    padding: 6px 14px;
    border-bottom: 1px solid var(--line);
    border-left: 3px solid var(--problem);
    line-height: 1.5;
  }

  .unsaved {
    flex: none;
    padding: 3px 14px;
    border-bottom: 1px solid var(--line);
    color: var(--proposed);
    font-size: 12px;
  }

  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .says {
    flex: none;
    width: 230px;
    overflow-y: auto;
    padding: 6px 12px 16px;
    border-left: 1px solid var(--line);
    background: var(--paper);
    font-size: 12.5px;
    line-height: 1.45;
  }

  .says h3 {
    margin: 10px 0 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  .says ul {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0;
    list-style: none;
  }

  .says li > button:not(.draw) {
    width: 100%;
    padding: 2px 4px;
    margin-left: -4px;
    border-radius: 3px;
    text-align: left;
  }

  .says li > button:not(.draw):hover {
    background: var(--hover);
  }

  .says li > button.selected {
    background: var(--selected);
  }

  .says .drift li {
    padding: 4px 0 4px 8px;
    border-left: 2px solid var(--problem);
  }

  .draw {
    margin-top: 4px;
    font-size: 12px;
  }

  .what {
    color: var(--ink-soft);
  }

  .faint {
    color: var(--ink-faint);
  }

  code {
    font-family: var(--code);
    font-size: 0.92em;
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

  .swatch {
    width: 24px;
    height: 14px;
    border: 1.2px solid var(--ink-faint);
    border-radius: 3px;
    background: var(--paper);
  }

  .swatch.external {
    border-style: dashed;
  }

  .swatch.repository {
    border-width: 2px;
  }

  .legend .line {
    fill: none;
    stroke: var(--ink-soft);
    stroke-width: 1.4;
  }

  .legend .tip {
    fill: var(--ink-soft);
  }

  .legend .not-in-code {
    stroke: var(--problem);
  }

  .legend .tip.not-in-code {
    fill: var(--problem);
    stroke: none;
  }

  .legend .perhaps {
    stroke: var(--problem);
    stroke-dasharray: 6 4;
  }

  .legend .left-out {
    stroke: var(--problem);
    stroke-dasharray: 3 4;
    opacity: 0.55;
  }
</style>
