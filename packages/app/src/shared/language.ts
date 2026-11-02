/**
 * The languages the window speaks (docs/plan-roadmap.md, part 12). The system's language
 * chooses, the first of its preferred languages the window speaks; a setting overrides it.
 * `adr lint` and the MCP server stay in English.
 */
export const LANGUAGES = ['en', 'de'] as const
export type Language = (typeof LANGUAGES)[number]

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)

/** The first of the preferred languages — `de-AT`, `en_GB`, `de` — that the window speaks. */
export function languageOf(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split(/[-_]/)[0]
    if (isLanguage(base)) return base
  }
  return 'en'
}
