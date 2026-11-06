<script lang="ts">
  import { VIEW_LEVELS, type ViewLevel } from '@adr-tool/diagrams'
  import { componentsOfLevel, isElementId, scopesOf } from '../lib/diagram-canvas'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'

  // A new Diagram starts from a level of the Component hierarchy: its Components are placed as
  // Structure lays out a level, and the connections the code has between them are drawn. The
  // file is previewed whole before it is written.
  let dialog = $state<HTMLDialogElement>()
  let titleField = $state<HTMLInputElement>()
  const creating = $derived(app.diagrams.creating)
  const tab = $derived(app.tabs.find((one) => one.repository.id === creating?.repositoryId))
  const declared = $derived(tab?.diagrams.overview?.declared)
  const components = $derived(declared?.origin === 'declared' ? declared.components : [])
  const scopes = $derived(scopesOf(components))
  const shown = $derived(
    creating ? componentsOfLevel(components, creating.level, creating.scope) : []
  )
  const connections = $derived(
    (creating?.suggestions ?? []).filter(
      (one) =>
        !one.throughScope &&
        shown.some((component) => component.id === one.from) &&
        shown.some((component) => component.id === one.to)
    ).length
  )
  const taken = $derived(new Set(tab?.diagrams.overview?.diagrams.map((entry) => entry.id) ?? []))

  $effect(() => {
    if (creating && !dialog?.open) {
      dialog?.showModal()
      titleField?.focus()
    }
    if (!creating && dialog?.open) dialog.close()
  })

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    void app.diagrams.create()
  }
</script>

<dialog
  bind:this={dialog}
  oncancel={() => app.diagrams.cancelNew()}
  aria-labelledby="new-diagram-title"
>
  {#if creating}
    <form onsubmit={submit}>
      <h1 id="new-diagram-title">{t.diagrams.new.title}</h1>

      <fieldset>
        <legend>{t.diagrams.new.level}</legend>
        {#each VIEW_LEVELS as level (level)}
          <label class="choice">
            <input
              type="radio"
              name="level"
              value={level}
              checked={creating.level === level}
              onchange={() =>
                app.diagrams.describeNew({
                  level: level as ViewLevel,
                  scope: level === 'component' ? (creating.scope ?? scopes[0]?.id) : undefined
                })}
            />
            {t.diagrams.levels[level]}
          </label>
        {/each}
      </fieldset>

      {#if creating.level === 'component'}
        <label>
          <span>{t.diagrams.new.scope}</span>
          {#if scopes.length === 0}
            <p class="hint">{t.diagrams.new.noScope}</p>
          {:else}
            <select
              value={creating.scope}
              onchange={(event) => app.diagrams.describeNew({ scope: event.currentTarget.value })}
            >
              {#each scopes as scope (scope.id)}
                <option value={scope.id}>{scope.name} ({scope.id})</option>
              {/each}
            </select>
            <small>{t.diagrams.new.scopeHint}</small>
          {/if}
        </label>
      {/if}

      <label>
        <span>{t.diagrams.new.name}</span>
        <input
          bind:this={titleField}
          value={creating.title}
          oninput={(event) => app.diagrams.describeNew({ title: event.currentTarget.value })}
          type="text"
        />
      </label>

      <label>
        <span>{t.diagrams.new.id}</span>
        <input
          class="id"
          value={creating.id}
          oninput={(event) => app.diagrams.describeNew({ id: event.currentTarget.value })}
          aria-invalid={creating.id !== '' && (!isElementId(creating.id) || taken.has(creating.id))}
          spellcheck="false"
          autocomplete="off"
        />
        <small>{t.diagrams.new.idHint}</small>
      </label>

      <p class="hint" role="status">
        {#if creating.level === 'system-context'}
          {t.diagrams.new.showsRepository}
        {:else if declared?.origin !== 'declared'}
          {t.diagrams.new.noComponents}
        {:else if creating.failed !== undefined}
          {creating.failed}
        {:else if creating.suggestions === undefined}
          {t.diagrams.new.looking}
        {:else}
          {t.diagrams.new.shows(shown.length, connections)}
        {/if}
      </p>

      <footer>
        <button type="button" onclick={() => app.diagrams.cancelNew()}>{t.cancel}</button>
        <button
          type="submit"
          class="primary"
          disabled={!app.diagrams.canCreate || taken.has(creating.id)}
        >
          {t.diagrams.new.create}
        </button>
      </footer>
    </form>
  {/if}
</dialog>

<style>
  dialog {
    width: min(540px, calc(100vw - 80px));
    margin: auto;
    padding: 22px 24px 18px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 18px 60px rgb(0 0 0 / 0.28);
    user-select: text;
  }

  dialog::backdrop {
    background: rgb(12 16 24 / 0.42);
  }

  h1 {
    font-size: 16px;
    font-weight: 600;
  }

  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin-top: 16px;
    padding: 0;
    border: none;
  }

  legend {
    width: 100%;
    margin-bottom: 4px;
    font-size: 12px;
    color: var(--ink-soft);
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  label:not(.choice) {
    display: block;
    margin-top: 16px;
  }

  label > span {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    color: var(--ink-soft);
  }

  small {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--ink-faint);
  }

  input:not([type='radio']),
  select {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  input.id {
    font-family: var(--code);
    font-size: 12.5px;
  }

  input[aria-invalid='true'] {
    border-color: var(--problem);
  }

  .hint {
    margin-top: 16px;
    color: var(--ink-soft);
    line-height: 1.55;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }

  footer button {
    padding: 6px 14px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  footer button:hover {
    background: var(--hover);
  }

  footer .primary {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
    font-weight: 500;
  }

  footer .primary:hover:not(:disabled) {
    border-color: var(--focus);
    background: var(--focus);
  }

  footer .primary:disabled {
    opacity: 0.5;
  }
</style>
