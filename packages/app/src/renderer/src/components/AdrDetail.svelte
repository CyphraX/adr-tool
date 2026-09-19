<script lang="ts">
  import type { Adr, DecisionLog, Relation } from '@adr-tool/core'
  import { renderMarkdown } from '../lib/markdown'
  import type { Decision } from '../../../shared/ipc'
  import { DECISION_LABEL, app, problemsOf, statusKey } from '../lib/state.svelte'
  import { STATUS_LABEL, describeProblem, prefixOf, relationLabel } from '../lib/wording'
  import StatusMark from './StatusMark.svelte'
  import StatusStamp from './StatusStamp.svelte'

  let { adr, log }: { adr: Adr; log: DecisionLog } = $props()

  interface Line {
    label: string
    other: Adr
    /** A Relation of a rejected ADR never took effect. */
    void: boolean
  }

  const status = $derived(statusKey(adr))
  const html = $derived(renderMarkdown(adr.body))
  const problems = $derived(problemsOf(log, adr.id))

  // Both directions: what this ADR says about others, and what others say about it.
  const relations = $derived.by((): Line[] => {
    const line = (relation: Relation, side: 'from' | 'to'): Line | undefined => {
      const other = log.adrs.find(
        (candidate) => candidate.id === relation[side === 'from' ? 'to' : 'from']
      )
      if (!other) return undefined
      return { label: relationLabel(relation, side), other, void: relation.state === 'void' }
    }
    return [
      ...log.relations.filter((relation) => relation.from === adr.id).map((r) => line(r, 'from')),
      ...log.relations.filter((relation) => relation.to === adr.id).map((r) => line(r, 'to'))
    ].filter((entry) => entry !== undefined)
  })

  // What can be decided depends on where the ADR stands. `superseded` is never set by hand.
  const decisions = $derived<Decision[]>(
    status === 'proposed' ? ['accept', 'reject'] : status === 'accepted' ? ['deprecate'] : []
  )

  const facts = $derived(
    [
      ['Created', adr.metadata.created],
      ['Decided', adr.metadata.decided],
      ['Decision-makers', adr.metadata.decisionMakers.join(', ')],
      ['Tags', adr.metadata.tags.join(', ')]
    ].filter((fact): fact is [string, string] => Boolean(fact[1]))
  )

  // Nothing navigates inside the app. A link to another ADR of this log selects it;
  // a web link opens in the system browser; everything else does nothing.
  function followLink(event: MouseEvent): void {
    const anchor = (event.target as Element).closest('a')
    const href = anchor?.getAttribute('href')
    if (!href) return
    event.preventDefault()
    if (/^https?:\/\//i.test(href)) void window.api.openExternal(href)
    else app.selectByFileName(decodeURIComponent(href.split(/[?#]/)[0]!.split('/').pop()!))
  }
</script>

<article>
  <header>
    <div class="record">
      <p class="id">
        ADR <span class="prefix">{prefixOf(adr)}</span>
        <span class="path">{adr.path}</span>
      </p>
      <StatusStamp {status} label={adr.metadata.rawStatus ?? STATUS_LABEL[status]} />
    </div>

    {#if decisions.length > 0}
      <div class="actions">
        {#each decisions as decision (decision)}
          <button class:primary={decision === 'accept'} onclick={() => app.decide(decision)}>
            {DECISION_LABEL[decision]}
          </button>
        {/each}
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
      <ul class="relations" aria-label="Relations">
        {#each relations as relation (relation.label + relation.other.id)}
          <li class:void={relation.void}>
            <span class="kind">{relation.label}</span>
            <button onclick={() => app.select(relation.other.id)}>
              <StatusMark status={statusKey(relation.other)} />
              <span class="prefix">{prefixOf(relation.other)}</span>
              {relation.other.title ?? relation.other.id}
            </button>
            {#if relation.void}<span class="note">never took effect</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if adr.metadata.corrections.length > 0}
      <ul class="corrections" aria-label="Corrections">
        {#each adr.metadata.corrections as correction, position (position)}
          <li>
            <span class="kind">Corrected</span>
            {correction.date}{correction.author ? ` by ${correction.author}` : ''}{correction.note
              ? `: ${correction.note}`
              : ''}
          </li>
        {/each}
      </ul>
    {/if}

    {#if problems.length > 0}
      <ul class="problems" aria-label="Problems">
        {#each problems as problem, position (position)}
          <li>{describeProblem(problem)}</li>
        {/each}
      </ul>
    {/if}
  </header>

  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="document" onclick={followLink}>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized in lib/markdown.ts -->
    {@html html}
  </div>
</article>

<style>
  article {
    overflow-y: auto;
    background: var(--paper);
    user-select: text;
    cursor: auto;
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

  .actions {
    display: flex;
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

  .problems li {
    display: block;
    padding: 5px 10px;
    margin-top: 4px;
    border-left: 3px solid var(--problem);
    background: color-mix(in srgb, var(--problem) 9%, transparent);
  }

  /* The ADR itself: a document, set as one. */
  .document {
    max-width: 46rem;
    padding: 28px 40px 64px;
    font-family: var(--document);
    font-size: 16px;
    line-height: 1.62;
    font-variant-numeric: normal;
  }

  .document :global(h1) {
    margin-bottom: 0.7em;
    font-size: 1.75em;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.01em;
  }

  .document :global(h2) {
    margin: 1.9em 0 0.5em;
    font-family: var(--ui);
    font-size: 0.9em;
    font-weight: 600;
    color: var(--ink-soft);
  }

  .document :global(h3),
  .document :global(h4) {
    margin: 1.5em 0 0.4em;
    font-size: 1em;
    font-weight: 600;
  }

  .document :global(p),
  .document :global(ul),
  .document :global(ol),
  .document :global(blockquote),
  .document :global(pre),
  .document :global(table) {
    margin: 0 0 1em;
  }

  .document :global(ul),
  .document :global(ol) {
    padding-left: 1.4em;
    list-style: revert;
  }

  .document :global(li) {
    display: list-item;
    min-height: 0;
    margin-bottom: 0.45em;
  }

  .document :global(a) {
    color: inherit;
    text-decoration-color: var(--focus);
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .document :global(code) {
    font-family: var(--code);
    font-size: 0.86em;
    padding: 0.1em 0.3em;
    border-radius: 3px;
    background: var(--panel);
  }

  .document :global(pre) {
    padding: 12px 14px;
    overflow-x: auto;
    border-radius: 4px;
    background: var(--panel);
    line-height: 1.5;
  }

  .document :global(pre code) {
    padding: 0;
    background: none;
  }

  .document :global(blockquote) {
    padding-left: 1em;
    border-left: 3px solid var(--line-strong);
    color: var(--ink-soft);
  }

  .document :global(table) {
    border-collapse: collapse;
    font-family: var(--ui);
    font-size: 0.85em;
  }

  .document :global(th),
  .document :global(td) {
    padding: 5px 12px 5px 0;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: top;
  }

  .document :global(hr) {
    margin: 2em 0;
    border: 0;
    border-top: 1px solid var(--line);
  }

  .document :global(input[type='checkbox']) {
    margin-right: 0.4em;
  }
</style>
