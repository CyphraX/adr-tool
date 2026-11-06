/**
 * The Violations of a Rule about Libraries (docs/conformance-format.md, section 2, "library"):
 * a Component that uses a Library it may not, with the uses behind it — each Source File with
 * the lines of its imports.
 */
import {
  ecosystemOfLanguage,
  UNASSIGNED,
  type Ecosystem,
  type LibraryUse
} from '@adr-tool/structure/model'
import { matcherOf } from './component-patterns'
import { chains, type Model, type Violation } from './evaluate'
import { libraryMatcher } from './library-patterns'
import type { LibraryRule } from './rules'

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * A use as a Rule that ignores type-only uses sees it: without the lines on which every use is
 * type-only, so that no annotation stands on an import the Rule does not count.
 */
function counted(rule: LibraryRule, use: LibraryUse): LibraryUse {
  const typed = use.typeOnlyLines
  if (!rule.ignoreTypeOnly || typed === undefined) return use
  const { file, library, typeOnly } = use
  return { file, library, typeOnly, lines: use.lines.filter((line) => !typed.includes(line)) }
}

/**
 * The Violations of a Rule about Libraries, by Component and Library. A file's use stands at
 * the outermost Component of its chain the Rule is about: for `not-in`, the outermost one the
 * patterns match; for `only-in`, the outermost one that holds no Component the patterns
 * allow — the Component that owns the file where each of its chain holds one —, and
 * `(unassigned)` for a file of no Component, which nothing can have allowed.
 */
export function libraryViolations(rule: LibraryRule, model: Model): Violation[] {
  const isLibrary = libraryMatcher(rule.libraries)
  const isNamed = matcherOf(rule.components)
  const { ofFile, test, components } = chains(model.structure)
  const allowed = components.map((component) => component.id).filter(isNamed)
  const holdsAllowed = (id: string): boolean =>
    allowed.some((other) => other === id || other.startsWith(`${id}/`))

  const languageOf = new Map(model.structure.sourceFiles.map((file) => [file.path, file.language]))
  const ecosystemOf = (path: string): Ecosystem | undefined => {
    const language = languageOf.get(path)
    return language === undefined ? undefined : ecosystemOfLanguage(language)
  }

  const found = new Map<string, { component: string; library: string; uses: LibraryUse[] }>()
  for (const written of model.libraries) {
    if (!isLibrary(written.library, ecosystemOf(written.file))) continue
    if (!rule.tests && test.has(written.file)) continue
    if (rule.ignoreTypeOnly && written.typeOnly) continue
    const chain = ofFile.get(written.file)
    if (chain === undefined) continue
    let component: string | undefined
    if (rule.scope === 'only-in') {
      if (chain.some(isNamed)) continue
      component = chain.find((id) => !holdsAllowed(id)) ?? chain.at(-1) ?? UNASSIGNED
    } else {
      component = chain.find(isNamed)
      if (component === undefined) continue
    }
    const key = `${component}\n${written.library}`
    const violation = found.get(key) ?? { component, library: written.library, uses: [] }
    violation.uses.push(counted(rule, written))
    found.set(key, violation)
  }
  return [...found.values()]
    .sort((a, b) => compare(a.component, b.component) || compare(a.library, b.library))
    .map(({ component, library, uses }) => ({
      rule,
      fingerprint: { kind: 'library', rule: rule.id, component, library },
      said: {
        code: 'library',
        values: {
          component,
          library,
          scope: rule.scope,
          ...(rule.scope === 'only-in' && { allowed: rule.components })
        }
      },
      component,
      library,
      uses: uses.sort((a, b) => compare(a.file, b.file)),
      dependencies: []
    }))
}
