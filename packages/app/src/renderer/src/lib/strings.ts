import { language } from './language'
import { de } from './strings.de'
import { en } from './strings.en'

export { METRICS, type MetricKey } from './strings.en'

/** What the window says, in every language it speaks the same shape. */
export type Strings = typeof en

/** What the window says, in its language (lib/language.ts). */
export const t: Strings = language === 'de' ? de : en
