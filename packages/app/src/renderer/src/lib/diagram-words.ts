/**
 * What `diagrams` says — a Problem of a Diagram, a Drift, why an edit is refused — in the
 * language of the window, by its code (lib/said.ts); and the one Problem of `.arch/config.yml`,
 * which the kernel says.
 */
import { KERNEL_SENTENCES, sentenceOf, type UnreadableConfig } from '@adr-tool/kernel'
import {
  driftWording,
  saidOf,
  saidOfDrift,
  wordingOf,
  type DiagramProblem,
  type Drift
} from '@adr-tool/diagrams'
import { wordOf } from './said'

/** What a Problem of a Diagram says, in the language of the window. */
export const wordDiagramProblem = (problem: DiagramProblem): string =>
  wordOf(saidOf(problem), wordingOf(problem))

/** What a Drift says, in the language of the window. */
export const wordDrift = (drift: Drift): string => wordOf(saidOfDrift(drift), driftWording(drift))

/** What the kernel says of `.arch/config.yml` when it cannot be read. */
export const wordConfigProblem = (problem: UnreadableConfig): string =>
  wordOf(problem.said, sentenceOf(KERNEL_SENTENCES, problem.said))

/** Why an edit of the canvas was refused: a `Refusal` of `diagrams`, or what an error says. */
export function wordRefusal(error: unknown): string {
  const { message, said } = error as { message?: unknown; said?: Parameters<typeof wordOf>[0] }
  return wordOf(said, typeof message === 'string' ? message : String(error))
}
