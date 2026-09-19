<script lang="ts">
  import type { Status } from '@adr-tool/core'

  // The one loud element of the app: a decision gets its stamp, as it would on paper.
  let { status, label }: { status: Status | 'unknown'; label: string } = $props()
</script>

<span class="stamp {status}">{label}</span>

<style>
  .stamp {
    display: inline-block;
    padding: 3px 10px 2px;
    border: 2px solid currentColor;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    white-space: nowrap;
    transform: rotate(-2deg);
  }

  .proposed {
    color: var(--proposed);
    border-style: dashed;
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
    border-style: dotted;
    text-transform: none;
    letter-spacing: 0;
  }
</style>
