/**
 * What `core` and `structure` say — why an operation is refused, what its preview warns of,
 * what is wrong with a file, why a foreign file has no Migration — in the language of the
 * window (docs/plan-roadmap.md, part 12). Each of them says it as a code, with its English
 * sentence beside it; in English the window shows that sentence, in German it words the code.
 * What has no code — what the main process says of its own, a parser's message — is shown as
 * it comes.
 */
import {
  conformanceEnglishOf,
  saidOf as conformanceSaidOf,
  wordingOf as conformanceWordingOf,
  type ConformanceNote,
  type ConformanceProblem,
  type ConformanceSaid
} from '@adr-tool/conformance'
import type { Said } from '@adr-tool/core'
import { saidOf, wordingOf, type StructureProblem } from '@adr-tool/structure/model'
import type { Language } from '../../../shared/language'
import type { PlannedChange } from '../../../shared/ipc'
import { language } from './language'
import { inGerman } from './said.de'

/** What was said, in `language`: its English sentence, or the sentence of its code. */
export function wordIn(language: Language, said: Said | undefined, english: string): string {
  if (language === 'en' || said === undefined) return english
  return inGerman(said) ?? english
}

/** What was said, in the language of the window. */
export function wordOf(said: Said | undefined, english: string): string {
  return wordIn(language, said, english)
}

/** The warnings of a planned change, each in the language of the window. */
export function wordWarnings(change: Pick<PlannedChange, 'warnings' | 'warned'>): string[] {
  return change.warnings.map((warning, position) => wordOf(change.warned?.[position], warning))
}

/** What a Problem of Structure says, in the language of the window. */
export function wordStructureProblem(problem: StructureProblem): string {
  return wordOf(saidOf(problem), wordingOf(problem))
}

/** What `conformance` said — what a Violation is, why a Rule cannot be written — in the language of the window. */
export function wordConformance(said: ConformanceSaid): string {
  return wordOf(said, conformanceEnglishOf(said))
}

/** What a Problem or a note of the Rules file says, in the language of the window. */
export function wordConformanceProblem(problem: ConformanceProblem | ConformanceNote): string {
  return wordOf(conformanceSaidOf(problem), conformanceWordingOf(problem))
}
