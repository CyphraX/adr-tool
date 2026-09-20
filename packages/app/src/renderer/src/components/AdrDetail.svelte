<script lang="ts">
  import { repairsOf, type Adr, type DecisionLog, type Relation } from '@adr-tool/core'
  import type { Decision } from '../../../shared/ipc'
  import { problemsOf } from '../lib/problems'
  import { app, statusKey } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import {
    STATUS_LABEL,
    describeCause,
    IMPLIED_NOTE,
    describeForeign,
    describeProblem,
    prefixOf,
    relationLabel,
    repairLabel
  } from '../lib/wording'
  import BodyEditor from './BodyEditor.svelte'
  import MarkdownDocument from './MarkdownDocument.svelte'
  import StatusMark from './StatusMark.svelte'
  import StatusStamp from './StatusStamp.svelte'

  let { adr, log }: { adr: Adr; log: DecisionLog } = $props()

  interface Line {
    label: string
    other: Adr
    /** A Relation of a rejected ADR never took effect. */
    void: boolean
    /** Only the other ADR's file records it: MADR notes a supersession on the superseded ADR. */
    implied: boolean
  }

  const status = $derived(statusKey(adr))
  const editing = $derived(app.editing?.adrId === adr.id)
  const problems = $derived(problemsOf(app.problemGroups, adr.id))

  // What git says: absent without git, and then there is no history to offer either.
  const git = $derived(app.active?.repository.git)
  const uncommitted = $derived(git?.changed.includes(adr.path) ?? false)

  // Both directions: what this ADR says about others, and what others say about it.
  const relations = $derived.by((): Line[] => {
    const line = (relation: Relation, side: 'from' | 'to'): Line | undefined => {
      const other = log.adrs.find(
        (candidate) => candidate.id === relation[side === 'from' ? 'to' : 'from']
      )
      if (!other) return undefined
      const successor = side === 'from' ? adr : other
      const implied =
        relation.type === 'supersedes' &&
        (successor.impliedSupersedes?.includes(relation.to) ?? false)
      return {
        label: relationLabel(relation, side),
        other,
        void: relation.state === 'void',
        implied: implied && side === 'from'
      }
    }
    return [
      ...log.relations.filter((relation) => relation.from === adr.id).map((r) => line(r, 'from')),
      ...log.relations.filter((relation) => relation.to === adr.id).map((r) => line(r, 'to'))
    ].filter((entry) => entry !== undefined)
  })

  // What can be decided depends on where the ADR stands. `superseded` is never set by hand.
  // Nothing is decided on an ADR in a foreign format: that would write to its file.
  const decisions = $derived<Decision[]>(
    adr.foreign
      ? []
      : status === 'proposed'
        ? ['accept', 'reject']
        : status === 'accepted'
          ? ['deprecate']
          : []
  )

  // A decision that has been taken changes through a new ADR, never in place.
  const canBeSuperseded = $derived(
    !adr.foreign && (status === 'accepted' || status === 'deprecated')
  )
  const canBeAmended = $derived(!adr.foreign && status === 'accepted')

  const facts = $derived(
    [
      [t.detail.created, adr.metadata.created],
      [t.detail.decided, adr.metadata.decided],
      [t.detail.decisionMakers, adr.metadata.decisionMakers.join(', ')],
      [t.detail.tags, adr.metadata.tags.join(', ')]
    ].filter((fact): fact is [string, string] => Boolean(fact[1]))
  )
</script>

<article>
  <header>
    <div class="record">
      <p class="id">
        {t.detail.adr} <span class="prefix">{prefixOf(adr)}</span>
        <span class="path">{adr.path}</span>
        {#if uncommitted}
          <span class="uncommitted" title={t.detail.uncommittedHint}>
            {t.detail.uncommitted}
          </span>
        {/if}
      </p>
      <StatusStamp {status} label={adr.metadata.rawStatus ?? STATUS_LABEL[status]} />
    </div>

    {#if adr.foreign}
      <p class="foreign">{describeForeign(adr)}</p>
    {/if}

    {#if !editing}
      <div class="actions">
        {#each decisions as decision (decision)}
          <button class:primary={decision === 'accept'} onclick={() => app.decide(decision)}>
            {t.review.decision[decision].action}
          </button>
        {/each}
        {#if canBeSuperseded}
          <button onclick={() => app.startCreating('supersedes')}>{t.detail.supersede}</button>
        {/if}
        {#if canBeAmended}
          <button onclick={() => app.startCreating('amends')}>{t.detail.amend}</button>
        {/if}
        {#if !adr.foreign}
          <button onclick={() => app.edit()}>{t.detail.edit}</button>
          <button onclick={() => app.editMetadata()}>{t.detail.metadata}</button>
        {/if}
        {#if adr.foreign && adr.noMigration === undefined}
          <button class="primary" onclick={() => app.migrate('adr')}>{t.detail.migrate}</button>
        {/if}
        {#if git}<button onclick={() => app.showHistory()}>{t.detail.history}</button>{/if}
      </div>
    {/if}

    {#if facts.length > 0}
      <dl>
        {#each facts as [name, value] (name)}
          <div>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        {/each}
      </dl>
    {/if}

    {#if relations.length > 0}
      <ul class="relations" aria-label={t.detail.relations}>
        {#each relations as relation (relation.label + relation.other.id)}
          <li class:void={relation.void}>
            <span class="kind">{relation.label}</span>
            <button onclick={() => app.select(relation.other.id)}>
              <StatusMark status={statusKey(relation.other)} />
              <span class="prefix">{prefixOf(relation.other)}</span>
              {relation.other.title ?? relation.other.id}
            </button>
            {#if relation.void}<span class="note">{t.neverTookEffect}</span>{/if}
            {#if relation.implied}<span class="note">{IMPLIED_NOTE}</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if adr.metadata.corrections.length > 0}
      <ul class="corrections" aria-label={t.detail.corrections}>
        {#each adr.metadata.corrections as correction, position (position)}
          <li>
            <span class="kind">{t.detail.corrected}</span>
            <span class="what">
              {t.detail.correction(correction.date, correction.author, correction.note)}
            </span>
            {#if git}
              <!-- The marker of a Correction leads to what it changed. -->
              <button onclick={() => app.showHistory(position)}>{t.detail.showChange}</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if problems.length > 0}
      <ul class="problems" aria-label={t.detail.problems}>
        {#each problems as { problem, cause }, position (position)}
          <li class:follows={cause !== undefined}>
            {describeProblem(problem)}
            {#if cause !== undefined}
              <button class="cause" onclick={() => app.select(cause)}>{describeCause(cause)}</button
              >
            {/if}
            {#if cause === undefined && !editing}
              <!-- The repairs that write to this ADR. One that writes to another ADR is offered there. -->
              {#each repairsOf(log, problem).filter((repair) => repair.adr === adr.id) as repair, nth (nth)}
                <button onclick={() => app.repair(repair)}>{repairLabel(repair, log)}</button>
              {/each}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </header>

  {#if editing}
    <BodyEditor {adr} />
  {:else}
    <div class="reading">
      <MarkdownDocument markdown={adr.body} />
    </div>
  {/if}
</article>

<style>
  article {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--paper);
  }

  header {
    flex: none;
    user-select: text;
    cursor: auto;
  }

  .reading {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  header {
    padding: 18px 40px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--panel-raised);
  }

  .record {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .id {
    font-size: 15px;
    font-weight: 600;
  }

  .path {
    margin-left: 10px;
    font-size: 12px;
    font-weight: 400;
    color: var(--ink-faint);
  }

  /* In a narrow pane the line breaks in front of the mark, never inside it. */
  .uncommitted {
    display: inline-block;
    margin-left: 10px;
    padding: 1px 7px;
    border-radius: 8px;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--proposed);
    background: color-mix(in srgb, var(--proposed) 14%, transparent);
  }

  /* In a narrow pane the note wraps; the marker's button stays whole. */
  .corrections li {
    flex-wrap: wrap;
  }

  .corrections .what {
    flex: 1 1 10rem;
    min-width: 0;
  }

  .corrections button {
    flex: none;
    margin-left: auto;
    white-space: nowrap;
    color: var(--ink-soft);
    text-decoration: underline;
    text-decoration-color: var(--line-strong);
    text-underline-offset: 3px;
  }

  .corrections button:hover {
    color: var(--ink);
    text-decoration-color: currentColor;
  }

  .foreign {
    max-width: 72ch;
    margin-top: 10px;
    padding-left: 10px;
    border-left: 2px solid var(--line-strong);
    font-size: 12.5px;
    color: var(--ink-soft);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .actions button {
    min-width: 76px;
    padding: 4px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .actions button:hover {
    background: var(--hover);
  }

  .actions .primary {
    border-color: var(--accepted);
    background: var(--accepted);
    color: var(--paper);
    font-weight: 500;
  }

  .actions .primary:hover {
    background: color-mix(in srgb, var(--accepted) 86%, var(--ink));
  }

  dl {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 28px;
    margin-top: 12px;
  }

  dt {
    font-size: 11.5px;
    color: var(--ink-faint);
  }

  ul {
    list-style: none;
    padding: 0;
    margin-top: 12px;
  }

  li {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-height: 22px;
  }

  .kind {
    flex: none;
    width: 112px;
    color: var(--ink-soft);
  }

  .relations button {
    min-width: 0;
    text-align: left;
    border-radius: 3px;
    text-decoration: underline;
    text-decoration-color: var(--line-strong);
    text-underline-offset: 3px;
  }

  /* The mark sits in the first line of a title that may wrap. */
  .relations button :global(svg) {
    display: inline-block;
    margin-right: 4px;
    vertical-align: -1px;
  }

  .relations button:hover {
    text-decoration-color: currentColor;
  }

  .relations .prefix {
    color: var(--ink-soft);
  }

  .void button {
    color: var(--ink-faint);
  }

  .note {
    color: var(--ink-faint);
  }

  .problems button {
    margin-left: 8px;
    padding: 1px 9px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .problems button:hover {
    background: var(--hover);
  }

  .problems .follows {
    border-left-color: var(--line-strong);
    background: var(--panel);
    color: var(--ink-soft);
  }

  .problems .cause {
    display: inline;
    margin: 0;
    text-align: left;
    padding: 0;
    border: 0;
    background: none;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .problems li {
    display: block;
    padding: 5px 10px;
    margin-top: 4px;
    border-left: 3px solid var(--problem);
    background: color-mix(in srgb, var(--problem) 9%, transparent);
  }
</style>
