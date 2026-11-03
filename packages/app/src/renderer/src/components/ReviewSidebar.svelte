<script lang="ts">
  import { ANNOTATION_STATES, ANNOTATION_TYPES } from '@adr-tool/review'
  import { facetCounts, ownersOf, type Facet, type ReviewFilter } from '../lib/review'
  import { reviewing } from '../lib/reviewing.svelte'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'

  // What there is of Review in the repository in front: the Problems of the repository, and the
  // Annotations by state, by what became of their Anchors, by type, by Component and by author,
  // each row a filter with the count it would show (docs/plan-vision.md, part 9).
  const tab = $derived(app.active)
  const review = $derived(tab?.review)
  const known = $derived(review?.known)
  const filter = $derived<ReviewFilter>(review?.filter ?? {})
  const owners = $derived(ownersOf(tab?.outline.known))
  const counts = $derived(facetCounts(known?.annotations ?? [], filter, owners))
  const problems = $derived(app.repositoryProblems)
  const components = $derived(
    [...counts.components.entries()].sort(([a], [b]) =>
      a === null ? 1 : b === null ? -1 : a < b ? -1 : 1
    )
  )
  const nameOf = (id: string): string =>
    tab?.outline.known?.components.find((component) => component.id === id)?.name ?? id
  const authors = $derived(
    [...counts.authors.entries()].sort(([a], [b]) =>
      a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)
    )
  )
  const empty = $derived((known?.annotations.length ?? 0) === 0)
</script>

{#snippet row<F extends Facet>(
  facet: F,
  value: ReviewFilter[F],
  label: string,
  count: number,
  problem = false,
  hint: string | undefined = undefined
)}
  <button
    class="row"
    class:current={filter[facet] === value}
    class:none={count === 0}
    aria-pressed={filter[facet] === value}
    title={hint}
    onclick={() => reviewing.filterBy(facet, value)}
  >
    <span class="label">{label}</span>
    <span class="count" class:some={problem && count > 0}>{count}</span>
  </button>
{/snippet}

<nav aria-label={t.annotations.sidebar}>
  <section>
    <h2>{t.repositoryProblems.check}</h2>
    <button
      class="row"
      class:current={review?.problems}
      aria-pressed={review?.problems}
      title={t.repositoryProblems.entryHint}
      onclick={() => app.showRepositoryProblems()}
    >
      <span class="label">{t.repositoryProblems.entry}</span>
      <span class="count" class:some={(problems?.count ?? 0) > 0}>{problems?.count ?? 0}</span>
    </button>
  </section>

  <section>
    <h2>{t.annotations.heading}</h2>
    <button
      class="row"
      class:current={Object.keys(filter).length === 0 && !review?.problems}
      aria-pressed={Object.keys(filter).length === 0 && !review?.problems}
      onclick={() => reviewing.clearFilter()}
    >
      <span class="label">{t.annotations.all}</span>
      <span class="count">{known?.annotations.length ?? 0}</span>
    </button>
    {#if review?.reading && !known}
      <p class="about" role="status">{t.annotations.reading}</p>
    {:else if known?.finding}
      <p class="about" role="status">{t.annotations.finding}</p>
    {/if}
  </section>

  {#if !empty}
    <section>
      <h2>{t.annotations.stateHeading}</h2>
      {#each ANNOTATION_STATES as state (state)}
        {@render row('state', state, t.annotations.states[state], counts.states.get(state) ?? 0)}
      {/each}
    </section>

    <section>
      <h2>{t.annotations.anchorHeading}</h2>
      {@render row(
        'anchor',
        'moved',
        t.annotations.moved,
        counts.anchors.get('moved') ?? 0,
        false,
        t.annotations.movedHint
      )}
      {@render row(
        'anchor',
        'orphaned',
        t.annotations.orphaned,
        counts.anchors.get('orphaned') ?? 0,
        true,
        t.annotations.orphanedHint
      )}
    </section>

    <section>
      <h2>{t.annotations.typeHeading}</h2>
      {#each ANNOTATION_TYPES as type (type)}
        {@render row('type', type, t.annotations.types[type], counts.types.get(type) ?? 0)}
      {/each}
    </section>

    <section>
      <h2>{t.annotations.componentHeading}</h2>
      {#if !tab?.outline.known}
        <p class="about">{t.annotations.componentsFollow}</p>
      {/if}
      {#each components as [id, count] (id ?? '')}
        {@render row('component', id, id === null ? t.annotations.noComponent : nameOf(id), count)}
      {/each}
    </section>

    <section>
      <h2>{t.annotations.authorHeading}</h2>
      {#each authors as [author, count] (author)}
        {@render row('author', author, author === '' ? t.annotations.nobody : author, count)}
      {/each}
    </section>
  {/if}
</nav>

<style>
  nav {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding: 6px 0 12px;
    background: var(--panel);
    border-right: 1px solid var(--line);
  }

  h2 {
    padding: 12px 14px 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  .about {
    padding: 2px 14px 6px;
    color: var(--ink-soft);
    font-size: 12px;
    line-height: 1.5;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 26px;
    padding: 0 14px;
    text-align: left;
  }

  .row:hover {
    background: var(--hover);
  }

  .row.current {
    background: var(--selected);
  }

  .row.none .label {
    color: var(--ink-faint);
  }

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .count {
    color: var(--ink-faint);
  }

  .count.some {
    min-width: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--problem);
    color: var(--paper);
    font-size: 10.5px;
    font-weight: 600;
    line-height: 16px;
    text-align: center;
  }
</style>
