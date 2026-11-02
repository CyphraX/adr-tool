<script lang="ts">
  import { app, type Module } from '../lib/state.svelte'
  import { t } from '../lib/strings'

  // The modules of the suite, for the repository in front. More of them follow.
  const MODULES: readonly Module[] = ['decisions', 'structure']
</script>

<header>
  <div class="tabs" role="tablist" aria-label={t.tabs.label}>
    {#each app.tabs as tab (tab.repository.id)}
      {@const id = tab.repository.id}
      <div class="tab" class:active={id === app.activeId}>
        <button
          class="name"
          role="tab"
          aria-selected={id === app.activeId}
          title={tab.repository.root}
          onclick={() => app.activate(id)}
        >
          {tab.repository.name}
        </button>
        <button
          class="close"
          aria-label={t.tabs.close(tab.repository.name)}
          onclick={() => app.close(id)}
        >
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
            <path d="M2 2l6 6m0-6l-6 6" stroke="currentColor" stroke-width="1.4" />
          </svg>
        </button>
      </div>
    {/each}
  </div>
  {#if app.active}
    <div class="modules" role="group" aria-label={t.modules.label}>
      {#each MODULES as module (module)}
        <button
          class:current={app.active.module === module}
          aria-pressed={app.active.module === module}
          onclick={() => app.showModule(module)}
        >
          {t.modules[module]}
        </button>
      {/each}
    </div>
  {/if}
  <button class="open" onclick={() => app.open()}>{t.tabs.open}</button>
</header>

<style>
  header {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    height: 34px;
    border-bottom: 1px solid var(--line-strong);
    background: var(--panel);
  }

  .tabs {
    display: flex;
    min-width: 0;
  }

  .tab {
    display: flex;
    align-items: center;
    min-width: 0;
    border-right: 1px solid var(--line);
    color: var(--ink-soft);
  }

  .tab.active {
    background: var(--paper);
    color: var(--ink);
    font-weight: 500;
    /* The tab in front sits on the paper it belongs to. */
    margin-bottom: -1px;
  }

  .name {
    height: 100%;
    padding: 0 6px 0 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .close {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    margin-right: 8px;
    border-radius: 3px;
    color: var(--ink-faint);
  }

  .close:hover {
    background: var(--hover);
    color: var(--ink);
  }

  .modules {
    display: flex;
    flex: none;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    padding: 0 10px;
  }

  .modules button {
    padding: 3px 12px;
    border-radius: 4px;
    color: var(--ink-soft);
  }

  .modules button:hover {
    background: var(--hover);
    color: var(--ink);
  }

  .modules button.current {
    background: var(--paper);
    color: var(--ink);
    font-weight: 500;
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }

  .open {
    flex: none;
    padding: 0 14px;
    color: var(--ink-soft);
    border-left: 1px solid var(--line);
  }

  .open:hover {
    background: var(--hover);
    color: var(--ink);
  }
</style>
