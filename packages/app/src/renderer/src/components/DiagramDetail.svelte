<script lang="ts">
  import { geometryOf, hasRepair, type Diagram, type Element } from '@adr-tool/diagrams'
  import { everyComponent } from '@adr-tool/structure/model'
  import type { DiagramsTab } from '../lib/diagrams-tab.svelte'
  import { wordDiagramProblem, wordDrift } from '../lib/diagram-words'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { codeSpans } from '../lib/wording'
  import Picker from './Picker.svelte'

  // What is selected on the canvas: an element with its connections, its Drift and its
  // Problems; a connection with its label and the Dependencies behind it; or, with nothing
  // selected, the Diagram itself. Every action is an edit, held until Save, or a preview.
  let { diagrams, diagram }: { diagrams: DiagramsTab; diagram: Diagram } = $props()

  const overview = $derived(diagrams.overview!)
  const entry = $derived(diagrams.entry!)
  const declared = $derived({
    origin: overview.declared.origin,
    components: overview.declared.components
  })
  const geometry = $derived(geometryOf(diagram, declared))
  const boxOf = $derived(new Map(geometry.boxes.map((box) => [box.id, box])))
  const name = (id: string): string => boxOf.get(id)?.name ?? id
  const current = $derived(diagrams.current)
  const problems = $derived(current?.problems ?? entry.problems)
  const selection = $derived(diagrams.selection)
  const element = $derived(
    selection?.kind === 'element'
      ? diagram.elements.find((one) => one.id === selection.id)
      : undefined
  )
  const connection = $derived(
    selection?.kind === 'connection'
      ? diagram.connections.find((one) => one.from === selection.from && one.to === selection.to)
      : undefined
  )
  const isDeclared = (id: string): boolean =>
    overview.declared.origin === 'declared' &&
    everyComponent(overview.declared.components).some((component) => component.id === id)

  /** The words of a box being written in the fields of the detail. */
  let words = $state<{ id: string; name: string; description: string } | undefined>(undefined)
  let label = $state<{ from: string; to: string; text: string } | undefined>(undefined)

  function wordsOf(one: Element): { id: string; name: string; description: string } {
    if (words?.id === one.id) return words
    return {
      id: one.id,
      name: one.kind === 'component' ? '' : one.name,
      description: one.kind === 'component' ? '' : (one.description ?? '')
    }
  }

  function describe(one: Element): void {
    const now = words
    words = undefined
    if (!now || now.id !== one.id || one.kind === 'component') return
    const name = now.name.trim()
    const description = now.description.trim()
    if (name === one.name && description === (one.description ?? '')) return
    app.diagrams.edit({
      kind: 'describe-element',
      id: one.id,
      ...(name !== '' && name !== one.id && { name }),
      ...(description !== '' && { description })
    })
  }

  function relabel(from: string, to: string, before: string | undefined): void {
    const now = label
    label = undefined
    if (!now || now.from !== from || now.to !== to) return
    const text = now.text.trim()
    if (text === (before ?? '')) return
    app.diagrams.edit({ kind: 'relabel-connection', from, to, ...(text !== '' && { label: text }) })
  }

  const connectable = $derived(
    element
      ? geometry.boxes.filter(
          (box) =>
            box.id !== element.id &&
            !diagram.connections.some((one) => one.from === element.id && one.to === box.id)
        )
      : []
  )
  const suggestion = $derived(
    connection
      ? current?.suggestions.find(
          (one) => one.from === connection.from && one.to === connection.to && !one.throughScope
        )
      : undefined
  )
  const enter = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur()
  }
</script>

{#snippet withCode(text: string)}
  {#each codeSpans(text) as part, position (position)}{#if part.code}<code>{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

{#snippet problemList(list: typeof problems)}
  <ul class="findings">
    {#each list as problem, position (position)}
      <li>
        <span>{@render withCode(wordDiagramProblem(problem))}</span>
        {#if hasRepair(problem) && (problem.kind !== 'component-gone' || overview.declared.origin === 'declared')}
          <button
            class="action"
            disabled={diagrams.unsaved > 0}
            title={diagrams.unsaved > 0 ? t.diagrams.saveFirst : undefined}
            onclick={() => void app.diagrams.repair(problem)}
          >
            {t.diagrams.repair}
          </button>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet option(box: { id: string; name: string })}
  <span>{box.name}</span>
  {#if box.name !== box.id}<code class="faint">{box.id}</code>{/if}
{/snippet}

<aside aria-label={t.diagrams.diagram}>
  {#if element}
    {@const box = boxOf.get(element.id)}
    {@const touching = diagram.connections.filter(
      (one) => one.from === element.id || one.to === element.id
    )}
    {@const drift = (current?.drift ?? []).filter(
      (one) => one.from === element.id || one.to === element.id
    )}
    {@const own = problems.filter(
      (problem) => 'component' in problem && problem.component === element.id
    )}
    <p class="kind">{t.diagrams.kinds[element.kind]}</p>
    <h2>{box?.name ?? element.id}</h2>
    <p><code>{element.id}</code></p>
    <div class="actions">
      {#if element.kind === 'component' && isDeclared(element.id)}
        <button class="action" onclick={() => app.showComponent(element.id)}>
          {t.diagrams.openInStructure}
        </button>
      {/if}
      <button
        class="action"
        onclick={() => app.diagrams.edit({ kind: 'remove-element', id: element.id })}
      >
        {t.diagrams.remove}
      </button>
    </div>

    {#if element.kind === 'component'}
      {#if box && box.lines.length > 0}<p class="description">{box.lines.join(' ')}</p>{/if}
      <p class="faint note">{@render withCode(t.diagrams.fromDeclaration)}</p>
    {:else}
      {@const shown = wordsOf(element)}
      <label class="field">
        <span class="faint">{t.diagrams.name}</span>
        <input
          value={shown.name}
          oninput={(event) => (words = { ...shown, name: event.currentTarget.value })}
          onblur={() => describe(element)}
          onkeydown={enter}
          autocomplete="off"
        />
      </label>
      <label class="field">
        <span class="faint">{t.diagrams.description}</span>
        <textarea
          rows="3"
          value={shown.description}
          oninput={(event) => (words = { ...shown, description: event.currentTarget.value })}
          onblur={() => describe(element)}
        ></textarea>
      </label>
    {/if}

    <h3>{t.diagrams.connections}</h3>
    {#if touching.length === 0}<p class="faint">{t.diagrams.noConnections}</p>{/if}
    <ul>
      {#each touching as one (`${one.from}\n${one.to}`)}
        <li>
          <button
            class="link"
            onclick={() => app.diagrams.select({ kind: 'connection', from: one.from, to: one.to })}
          >
            {t.diagrams.uses(name(one.from), name(one.to), one.label)}
          </button>
        </li>
      {/each}
    </ul>
    <div class="connect">
      <Picker
        candidates={connectable}
        label={t.diagrams.connectTo}
        placeholder={t.diagrams.findElement}
        noneLeft={t.diagrams.everyConnected}
        textOf={(candidate) => `${candidate.name} ${candidate.id}`}
        {option}
        onpick={(to) => {
          if (app.diagrams.edit({ kind: 'add-connection', from: element.id, to })) {
            app.diagrams.select({ kind: 'connection', from: element.id, to })
          }
        }}
      />
    </div>

    {#if drift.length > 0}
      <h3>{t.diagrams.drift}</h3>
      <ul class="findings">
        {#each drift as one, position (position)}<li>{wordDrift(one)}</li>{/each}
      </ul>
    {/if}
    {#if own.length > 0}
      <h3>{t.diagrams.problems}</h3>
      {@render problemList(own)}
    {/if}
  {:else if connection}
    {@const drift = (current?.drift ?? []).filter(
      (one) =>
        one.kind === 'connection-not-in-code' &&
        one.from === connection.from &&
        one.to === connection.to
    )}
    <p class="kind">{t.diagrams.connection}</p>
    <h2>{t.diagrams.uses(name(connection.from), name(connection.to), undefined)}</h2>
    <p><code>{connection.from} → {connection.to}</code></p>
    <div class="actions">
      <button
        class="action"
        onclick={() =>
          app.diagrams.edit({
            kind: 'remove-connection',
            from: connection.from,
            to: connection.to
          })}
      >
        {t.diagrams.remove}
      </button>
    </div>
    <label class="field">
      <span class="faint">{t.diagrams.labelField}</span>
      <input
        value={label?.from === connection.from && label.to === connection.to
          ? label.text
          : (connection.label ?? '')}
        oninput={(event) =>
          (label = { from: connection.from, to: connection.to, text: event.currentTarget.value })}
        onblur={() => relabel(connection.from, connection.to, connection.label)}
        onkeydown={enter}
        autocomplete="off"
      />
    </label>

    {#if drift.length > 0}
      <h3>{t.diagrams.drift}</h3>
      <ul class="findings">
        {#each drift as one, position (position)}<li>{wordDrift(one)}</li>{/each}
      </ul>
    {/if}

    {#if boxOf.get(connection.from)?.kind === 'component' && boxOf.get(connection.to)?.kind === 'component'}
      <h3>{t.diagrams.dependencies(suggestion?.weight ?? 0)}</h3>
      {#if !current}
        <p class="faint">{t.diagrams.notAnalysedYet}</p>
      {:else if !suggestion}
        <p class="faint">{t.diagrams.noDependencies}</p>
      {:else}
        <ul class="files">
          {#each suggestion.dependencies.slice(0, 30) as dependency (`${dependency.from}\n${dependency.to}`)}
            <li>
              <button class="path" onclick={() => app.showSourceFile(dependency.from)}>
                {dependency.from}
              </button>
              <span class="faint">→ {dependency.to}</span>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  {:else}
    <p class="kind">{t.diagrams.diagram}</p>
    <h2>{entry.title ?? entry.id}</h2>
    <p><code>{entry.id}</code> <span class="faint">· <code>{entry.path}</code></span></p>
    <div class="actions">
      <button
        class="action"
        disabled={diagrams.unsaved > 0}
        title={diagrams.unsaved > 0 ? t.diagrams.saveFirst : undefined}
        onclick={() => void app.diagrams.exportSvg()}
      >
        {t.diagrams.exportSvg}
      </button>
    </div>
    <p class="faint note">{@render withCode(t.diagrams.exportHint(entry.picture))}</p>
    <h3>{t.diagrams.new.level}</h3>
    <p>{t.diagrams.levelOf(diagram.level, diagram.scope)}</p>
    <h3>{t.diagrams.description}</h3>
    <p class:faint={!diagram.description}>{diagram.description ?? t.diagrams.noDescription}</p>
    {#if problems.length > 0}
      <h3>{t.diagrams.problems}</h3>
      {@render problemList(problems)}
    {/if}
  {/if}
</aside>

<style>
  aside {
    overflow-y: auto;
    padding: 14px 18px 24px;
    background: var(--paper);
    line-height: 1.5;
  }

  .kind {
    color: var(--ink-faint);
    font-size: 11.5px;
    font-weight: 600;
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
    gap: 4px;
    padding: 0;
    list-style: none;
  }

  code {
    font-family: var(--code);
    font-size: 0.92em;
  }

  .faint {
    color: var(--ink-faint);
  }

  .note {
    margin-top: 6px;
    font-size: 12px;
  }

  .description {
    margin-top: 6px;
    color: var(--ink-soft);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .action {
    padding: 3px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--panel-raised);
  }

  .action:hover:not(:disabled) {
    background: var(--hover);
  }

  .action:disabled {
    opacity: 0.5;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 10px;
  }

  .field input,
  .field textarea {
    padding: 4px 6px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    resize: vertical;
  }

  .link {
    color: var(--focus);
    text-align: left;
  }

  .link:hover {
    text-decoration: underline;
  }

  .connect {
    margin-top: 8px;
  }

  .findings li {
    padding-left: 8px;
    border-left: 2px solid var(--problem);
  }

  .findings .action {
    display: block;
    margin-top: 4px;
  }

  .files li {
    font-family: var(--code);
    font-size: 11.5px;
    overflow-wrap: anywhere;
  }

  .path {
    color: var(--focus);
    text-align: left;
  }

  .path:hover {
    text-decoration: underline;
  }
</style>
