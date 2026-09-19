<script lang="ts">
  import type { Adr, RelationType } from '@adr-tool/core'
  import { app, statusKey } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { RELATION_TYPE_LABEL, prefixOf } from '../lib/wording'
  import AdrPicker from './AdrPicker.svelte'
  import ChipInput from './ChipInput.svelte'
  import StatusMark from './StatusMark.svelte'

  // The Metadata a person maintains: who decided, tags, and Relations. Status and dates are
  // not here; they change through Accept, Reject and Deprecate.
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

  /** The ADRs a Relation of this type can still be added to. */
  function candidates(type: RelationType, chosen: string[]): Adr[] {
    return adrs.filter((candidate) => {
      if (candidate.id === editing?.adrId || chosen.includes(candidate.id)) return false
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
              {@const other = adrs.find((candidate) => candidate.id === id)}
              <li class:missing={!other}>
                {#if other}
                  <StatusMark status={statusKey(other)} />
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
        <AdrPicker
          candidates={candidates(type, chosen)}
          label={t.metadata.addTo(RELATION_TYPE_LABEL[type])}
          onpick={(id) => chosen.push(id)}
        />
      </div>
    {/each}

    {#if !proposed}
      <p class="hint">{t.metadata.hintDecided}</p>
    {:else}
      <p class="hint">{t.metadata.hintProposed}</p>
    {/if}

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
    margin: auto;
    padding: 22px 24px 18px;
    /* The matches of a picker may hang out of the dialog. */
    overflow: visible;
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
