<script lang="ts">
  import { onMount } from 'svelte'
  import AdrDetail from './components/AdrDetail.svelte'
  import AdrList from './components/AdrList.svelte'
  import ChangeDialog from './components/ChangeDialog.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import TabBar from './components/TabBar.svelte'
  import { app } from './lib/state.svelte'
  import { describeProblem } from './lib/wording'

  onMount(() => void app.start())

  const repository = $derived(app.active?.repository.repository)
</script>

{#if app.ready}
  <div class="window">
    <TabBar />

    {#if !app.active || !repository}
      <main class="message">
        <h1>No repository open</h1>
        <p>Open the folder of a git repository to read its Architecture Decision Records.</p>
        <button class="primary" onclick={() => app.open()}>Open repository</button>
      </main>
    {:else if repository.logs.length === 0}
      <main class="message">
        {#if repository.problems.length > 0}
          <h1>This repository's ADR configuration cannot be used</h1>
          {#each repository.problems as problem, position (position)}
            <p>{describeProblem(problem)}</p>
          {/each}
        {:else}
          <h1>No ADRs found in {app.active.repository.name}</h1>
          <p>
            ADR Tool looks for <code>.adr/config.yml</code>, then for adr-tools'
            <code>.adr-dir</code>, then for the folders <code>docs/adr</code>, <code>doc/adr</code>
            and <code>docs/decisions</code>. As soon as one of them appears, the ADRs show up here.
          </p>
        {/if}
      </main>
    {:else}
      <div class="panes" class:wide-editor={app.editing?.mode === 'split'}>
        <Sidebar />
        <AdrList />
        {#if app.selected && app.log}
          <AdrDetail adr={app.selected} log={app.log} />
        {:else}
          <main class="message on-paper">
            <p>Select an ADR to read it.</p>
          </main>
        {/if}
      </div>
    {/if}
  </div>
  <ChangeDialog />
{/if}

<style>
  .window {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
  }

  .panes {
    display: grid;
    grid-template-columns: 210px minmax(340px, 1fr) minmax(0, 1.4fr);
    min-height: 0;
  }

  /* Source and preview side by side need room; the list steps aside while they are open. */
  .panes.wide-editor {
    grid-template-columns: 210px minmax(0, 1fr);
  }

  .panes.wide-editor > :global(.list) {
    display: none;
  }

  .message {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 10px;
    max-width: 34rem;
    margin: 0 auto;
    padding: 0 32px;
    color: var(--ink-soft);
    line-height: 1.55;
  }

  .message.on-paper {
    max-width: none;
    margin: 0;
    align-items: center;
    background: var(--paper);
  }

  h1 {
    font-size: 17px;
    font-weight: 600;
    color: var(--ink);
  }

  code {
    font-family: var(--code);
    font-size: 0.92em;
  }

  .primary {
    margin-top: 8px;
    padding: 6px 14px;
    border-radius: 4px;
    background: var(--ink);
    color: var(--paper);
    font-weight: 500;
  }

  .primary:hover {
    background: var(--focus);
  }
</style>
