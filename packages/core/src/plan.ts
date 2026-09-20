import type { Plan as KernelPlan } from '@adr-tool/kernel'

/** What planning an operation on a Decision Log yields. */
export type Plan = KernelPlan<{
  /** The ADR the operation creates, so that the caller can show it afterwards. */
  readonly created?: { readonly id: string; readonly path: string }
  /** The ID the operation changes, so that the caller can follow the ADR. */
  readonly renamed?: { readonly from: string; readonly to: string }
}>
