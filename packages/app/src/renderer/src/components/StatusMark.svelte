<script lang="ts">
  import type { Status } from '@adr-tool/core'

  // Each Status has its own shape as well as its own colour, so the list can be read
  // without telling the colours apart.
  let { status }: { status: Status | 'unknown' } = $props()
</script>

<svg class={status} viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
  {#if status === 'accepted'}
    <circle cx="6" cy="6" r="4.5" fill="currentColor" />
  {:else if status === 'proposed'}
    <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.5" />
  {:else if status === 'rejected'}
    <path d="M2.5 2.5l7 7m0-7l-7 7" fill="none" stroke="currentColor" stroke-width="1.8" />
  {:else if status === 'deprecated'}
    <circle
      cx="6"
      cy="6"
      r="4"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-dasharray="2 1.6"
    />
  {:else if status === 'superseded'}
    <path
      d="M2 2.5l4 3.5-4 3.5m4.5-7l4 3.5-4 3.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    />
  {:else}
    <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.5" />
  {/if}
</svg>

<style>
  svg {
    flex: none;
    display: block;
  }

  .proposed {
    color: var(--proposed);
  }
  .accepted {
    color: var(--accepted);
  }
  .rejected {
    color: var(--rejected);
  }
  .deprecated {
    color: var(--deprecated);
  }
  .superseded {
    color: var(--superseded);
  }
  .unknown {
    color: var(--unknown);
  }
</style>
