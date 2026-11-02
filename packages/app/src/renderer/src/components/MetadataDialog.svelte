<script lang="ts">
  import type { Adr, RelationType } from '@adr-tool/core'
  import type { ComponentName } from '../../../shared/ipc'
  import { everyNamed, namedIn, type Named } from '../lib/references'
  import { app, statusKey } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { logName, RELATION_TYPE_LABEL, prefixOf } from '../lib/wording'
  import ChipInput from './ChipInput.svelte'
  import Picker from './Picker.svelte'
  import StatusMark from './StatusMark.svelte'

  // The Metadata a person maintains: who decided, tags, Relations, and the Components the
  // ADR affects. Status and dates are not here; they change through Accept, Reject and
  // Deprecate.
  let dialog = $state<HTMLDialogElement>()
  const editing = $derived(app.editingMetadata)
  const adrs = $derived(app.log?.adrs ?? [])
  const adr = $derived(adrs.find((candidate) => candidate.id === editing?.adrId))
  const proposed = $derived(adr !== undefined && statusKey(adr) === 'proposed')

  // What an ADR supersedes or amends is fixed once it has been decided.
  const types = $derived<RelationType[]>(
    proposed ? ['supersedes', 'amends', 'depends-on', 'relates-to'] : ['depends-on', 'relates-to']
  )

  /** Everything the ADRs of the log already use, once each: the suggestions. */
  const used = (pick: (adr: Adr) => readonly string[]): string[] =>
    adrs
      .flatMap((candidate) => [...pick(candidate)])
      .filter((item, position, all) => all.indexOf(item) === position)
  const knownDecisionMakers = $derived(used((candidate) => candidate.metadata.decisionMakers))
  const knownTags = $derived(used((candidate) => candidate.metadata.tags))

  // What the repository declares; nothing while there is only the Draft.
  const declared = $derived(app.active?.repository.components)
  const componentsLeft = $derived(
    (declared ?? []).filter((component) => !editing?.affects.includes(component.id))
  )
  /** How deep a Component lies, for the indentation of the picker. */
  const depthOf = (component: ComponentName): number => component.id.split('/').length - 1

  /**
   * The ADRs a Relation of this type can still be added to: of this Decision Log, and of the
   * other logs of the repository (docs/file-format.md, section 3).
   */
  function candidates(type: RelationType, chosen: string[]): Named[] {
    const log = app.log
    if (!log) return []
    const taken = new Set(chosen.map((id) => namedIn(log, id)?.id ?? id))
    return everyNamed(log).filter(({ id, adr: candidate }) => {
      if (id === editing?.adrId || taken.has(id)) return false
      const status = statusKey(candidate)
      // Accepting such a Relation writes to its target, and a foreign file is never written.
      if ((type === 'supersedes' || type === 'amends') && candidate.foreign) return false
      if (type === 'supersedes') return status === 'accepted' || status === 'deprecated'
      if (type === 'amends') return status === 'accepted'
      return true
    })
  }

  // The dialog steps aside while the change is reviewed, and is back, as it was, when the
  // review is cancelled.
  const shown = $derived(editing !== undefined && app.review === undefined)

  $effect(() => {
    if (shown && !dialog?.open) {
      dialog?.showModal()
      // Not the first button: that one removes something, and Enter would press it.
      dialog?.querySelector('input')?.focus()
    }
    if (!shown && dialog?.open) dialog.close()
  })
</script>

<dialog
  bind:this={dialog}
  oncancel={() => app.cancelEditingMetadata()}
  aria-labelledby="metadata-title"
>
  {#if editing && adr}
    <h1 id="metadata-title">
      {t.metadata.title(prefixOf(adr))}
      <span class="of">{adr.title ?? adr.id}</span>
    </h1>

    <!-- The lists scroll here, between the title and the buttons, when there are many. -->
    <div class="fields">
      <div class="field">
        <h2>{t.metadata.decisionMakers}</h2>
        <ChipInput
          bind:items={editing.decisionMakers}
          suggestions={knownDecisionMakers}
          label={t.metadata.decisionMakers}
          placeholder={t.metadata.decisionMakersPlaceholder}
        />
      </div>

      <div class="field">
        <h2>{t.metadata.tags}</h2>
        <ChipInput
          bind:items={editing.tags}
          suggestions={knownTags}
          label={t.metadata.tags}
          placeholder={t.metadata.tagsPlaceholder}
        />
      </div>

      {#each types as type (type)}
        {@const chosen = editing.relations[type]}
        <div class="field">
          <h2>{RELATION_TYPE_LABEL[type]} <span class="about">{t.metadata.about[type]}</span></h2>
          {#if chosen.length > 0}
            <ul aria-label={RELATION_TYPE_LABEL[type]}>
              {#each chosen as id (id)}
                {@const named = app.log && namedIn(app.log, id)}
                <li class:missing={!named}>
                  {#if named}
                    {@const other = named.adr}
                    <StatusMark status={statusKey(other)} />
                    {#if named.log !== undefined}<span class="log">{logName(named.log)}</span>{/if}
                    <span class="prefix">{prefixOf(other)}</span>
                    <span class="title">{other.title ?? other.id}</span>
                  {:else}
                    <span class="title">{t.metadata.notInLog(id)}</span>
                  {/if}
                  <button
                    aria-label={t.metadata.remove(id)}
                    onclick={() => chosen.splice(chosen.indexOf(id), 1)}>×</button
                  >
                </li>
              {/each}
            </ul>
          {/if}
          <Picker
            candidates={candidates(type, chosen)}
            label={t.metadata.addTo(RELATION_TYPE_LABEL[type])}
            placeholder={t.metadata.pickerPlaceholder}
            noneLeft={t.metadata.noneLeft}
            textOf={({ id, adr: other }) => `${id} ${prefixOf(other)} ${other.title ?? ''}`}
            newestFirst
            onpick={(id) => chosen.push(id)}
          >
            {#snippet option({ adr: other, log })}
              <StatusMark status={statusKey(other)} />
              {#if log !== undefined}<span class="log">{logName(log)}</span>{/if}
              <span class="prefix">{prefixOf(other)}</span>
              <span class="title">{other.title ?? other.id}</span>
            {/snippet}
          </Picker>
        </div>
      {/each}

      <div class="field">
        <h2>{t.metadata.components} <span class="about">{t.metadata.componentsAbout}</span></h2>
        {#if editing.affects.length > 0}
          <ul aria-label={t.metadata.components}>
            {#each editing.affects as id (id)}
              {@const component = declared?.find((candidate) => candidate.id === id)}
              <li class:missing={!component}>
                {#if component}
                  <span class="title">{component.name}</span>
                  {#if component.name !== component.id}<code>{component.id}</code>{/if}
                {:else}
                  <span class="title">{t.metadata.notDeclared(id)}</span>
                {/if}
                <button
                  aria-label={t.metadata.remove(id)}
                  onclick={() => editing.affects.splice(editing.affects.indexOf(id), 1)}>×</button
                >
              </li>
            {/each}
          </ul>
        {/if}
        {#if declared}
          <Picker
            candidates={componentsLeft}
            label={t.metadata.addTo(t.metadata.components)}
            placeholder={t.metadata.componentPlaceholder}
            noneLeft={t.metadata.noComponentLeft}
            textOf={(component) => `${component.id} ${component.name}`}
            onpick={(id) => editing.affects.push(id)}
          >
            {#snippet option(component)}
              <span class="title" style:padding-left="{depthOf(component) * 14}px"
                >{component.name}</span
              >
              {#if component.name !== component.id}<code>{component.id}</code>{/if}
            {/snippet}
          </Picker>
        {:else}
          <p class="hint inline">{t.metadata.noDeclaration}</p>
        {/if}
      </div>

      {#if !proposed}
        <p class="hint">{t.metadata.hintDecided}</p>
      {:else}
        <p class="hint">{t.metadata.hintProposed}</p>
      {/if}
    </div>

    <footer>
      <button onclick={() => app.cancelEditingMetadata()}>{t.cancel}</button>
      <button class="primary" disabled={!app.metadataDirty} onclick={() => app.saveMetadata()}>
        {t.metadata.review}
      </button>
    </footer>
  {/if}
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 80px));
    max-height: calc(100vh - 40px);
    margin: auto;
    padding: 22px 0 18px;
    /* The matches of a picker are placed in the window and hang out over the edge. */
    overflow: visible;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 18px 60px rgb(0 0 0 / 0.28);
    user-select: text;
  }

  dialog[open] {
    display: flex;
    flex-direction: column;
  }

  h1,
  footer {
    flex: none;
    padding: 0 24px;
  }

  .fields {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 24px 2px;
  }

  dialog::backdrop {
    background: rgb(12 16 24 / 0.42);
  }

  h1 {
    font-size: 16px;
    font-weight: 600;
  }

  .of {
    margin-left: 6px;
    font-weight: 400;
    color: var(--ink-soft);
  }

  .field {
    margin-top: 16px;
  }

  h2 {
    margin-bottom: 5px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-soft);
  }

  .about {
    margin-left: 6px;
    font-weight: 400;
    color: var(--ink-faint);
  }

  ul {
    list-style: none;
    padding: 0;
    margin-bottom: 5px;
  }

  li {
    display: flex;
    align-items: baseline;
    gap: 7px;
    padding: 3px 4px 3px 8px;
    border-radius: 3px;
  }

  li:hover {
    background: var(--hover);
  }

  li :global(svg) {
    flex: none;
    align-self: center;
  }

  .prefix {
    flex: none;
    color: var(--ink-soft);
  }

  .log {
    flex: none;
    font-size: 12px;
    color: var(--ink-faint);
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .missing .title {
    color: var(--problem);
  }

  code {
    flex: none;
    font-family: var(--code);
    font-size: 11.5px;
    color: var(--ink-faint);
  }

  li button {
    flex: none;
    width: 18px;
    height: 18px;
    border-radius: 3px;
    line-height: 1;
    color: var(--ink-faint);
  }

  li button:hover {
    background: var(--panel);
    color: var(--ink);
  }

  .hint {
    margin-top: 16px;
    color: var(--ink-soft);
    line-height: 1.55;
  }

  .hint.inline {
    margin-top: 0;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }

  footer button {
    min-width: 84px;
    padding: 6px 14px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
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

  footer button:disabled {
    opacity: 0.5;
  }
</style>
