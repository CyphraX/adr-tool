<script lang="ts">
  import type { Adr, RelationType } from '@adr-tool/core'
  import { app, statusKey } from '../lib/state.svelte'
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

  const ABOUT: Record<RelationType, string> = {
    supersedes: 'Replaces that decision as a whole, once this ADR is accepted.',
    amends: 'Refines or extends part of that decision, once this ADR is accepted.',
    'depends-on': 'This decision only holds while that one does.',
    'relates-to': 'Worth reading together.'
  }

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
      Metadata of ADR {prefixOf(adr)}
      <span class="of">{adr.title ?? adr.id}</span>
    </h1>

    <div class="field">
      <h2>Decision-makers</h2>
      <ChipInput
        bind:items={editing.decisionMakers}
        suggestions={knownDecisionMakers}
        label="Decision-makers"
        placeholder="A name, then Enter"
      />
    </div>

    <div class="field">
      <h2>Tags</h2>
      <ChipInput
        bind:items={editing.tags}
        suggestions={knownTags}
        label="Tags"
        placeholder="A tag, then Enter"
      />
    </div>

    {#each types as type (type)}
      {@const chosen = editing.relations[type]}
      <div class="field">
        <h2>{RELATION_TYPE_LABEL[type]} <span class="about">{ABOUT[type]}</span></h2>
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
                  <span class="title">{id} — not in this Decision Log</span>
                {/if}
                <button
                  aria-label={`Remove ${id}`}
                  onclick={() => chosen.splice(chosen.indexOf(id), 1)}>×</button
                >
              </li>
            {/each}
          </ul>
        {/if}
        <AdrPicker
          candidates={candidates(type, chosen)}
          label={`Add to ${RELATION_TYPE_LABEL[type]}`}
          onpick={(id) => chosen.push(id)}
        />
      </div>
    {/each}

    {#if !proposed}
      <p class="hint">
        What this ADR supersedes or amends was fixed when it was decided. Status and dates change
        through the actions of the ADR, never here.
      </p>
    {:else}
      <p class="hint">Status and dates change through the actions of the ADR, never here.</p>
    {/if}

    <footer>
      <button onclick={() => app.cancelEditingMetadata()}>Cancel</button>
      <button class="primary" disabled={!app.metadataDirty} onclick={() => app.saveMetadata()}>
        Review changes
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
