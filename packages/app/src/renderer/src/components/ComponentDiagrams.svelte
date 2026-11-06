<script lang="ts">
  import { readDiagram } from '@adr-tool/diagrams'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'

  // On the page of a Component: the Diagrams that show it, as their files say. A click opens
  // the Diagram with its box selected.
  let { id }: { id: string } = $props()

  const overview = $derived(app.active?.diagrams.overview)
  const showing = $derived(
    (overview?.diagrams ?? []).filter((entry) => {
      const diagram = readDiagram(entry.path, entry.text)
      return (
        diagram.readable &&
        diagram.elements.some((element) => element.kind === 'component' && element.id === id)
      )
    })
  )
</script>

<h3>{t.diagrams.shownIn}</h3>
{#if showing.length === 0}
  <p class="faint">{t.diagrams.shownInNone}</p>
{:else}
  <ul>
    {#each showing as entry (entry.path)}
      <li>
        <button
          class="link"
          title={entry.path}
          onclick={() => app.diagrams.reveal(entry.path, { kind: 'element', id })}
        >
          {entry.title ?? entry.id}
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  h3 {
    margin: 16px 0 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0;
    list-style: none;
  }

  .faint {
    color: var(--ink-faint);
  }

  .link {
    color: var(--focus);
    text-align: left;
  }

  .link:hover {
    text-decoration: underline;
  }
</style>
