import { isLanguage, languageOf, type Language } from '../../../shared/language'

/** Where the language a person chose is remembered, on this machine. */
const STORED = 'language'

/** The language a person chose in the window, if any. */
export function chosenLanguage(): Language | undefined {
  try {
    const stored = globalThis.localStorage?.getItem(STORED)
    return isLanguage(stored) ? stored : undefined
  } catch {
    return undefined
  }
}

/** Remember a choice, or forget it: then the system's language counts again. */
export function chooseLanguage(language: Language | undefined): void {
  try {
    if (language === undefined) globalThis.localStorage?.removeItem(STORED)
    else globalThis.localStorage?.setItem(STORED, language)
  } catch {
    // Not remembered, then: the window keeps the system's language.
  }
}

const preferred = (): readonly string[] => {
  const browser = globalThis.navigator
  return browser?.languages?.length
    ? browser.languages
    : browser?.language
      ? [browser.language]
      : []
}

/** The language of the window, for as long as it runs: a change takes effect on a reload. */
export const language: Language = chosenLanguage() ?? languageOf(preferred())
