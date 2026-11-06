/**
 * The Libraries a Gradle build declares (docs/structure-format.md, section 3, "Manifests"),
 * read from `build.gradle` and `build.gradle.kts` as text — Gradle never runs, and a build
 * script is code that is not executed. What is read is a declaration on one line in the forms
 * most builds write — at the start of the line, or after `{` or `;` on it: a configuration, then
 * its coordinates as a string (`implementation 'g:a:v'`, `api("g:a:v")`), several of them
 * separated by commas, wrapped in `platform(…)` or `enforcedPlatform(…)`, as named
 * arguments (`group: 'g', name: 'a', version: 'v'`), as Kotlin's `kotlin("stdlib")`, or as an
 * entry of the version catalog `gradle/libs.versions.toml` (`libs.jackson.databind`,
 * `libs.bundles.x`). The configuration is the group, unless it is one of what the code needs
 * to run (`implementation`, `api`, `compile`, `runtimeOnly`, `runtime`). Not read: a
 * declaration over several lines, coordinates computed or interpolated beyond a version, a
 * project of the build (`project(':core')`), files, and the `classpath` of `buildscript`.
 *
 * Every line is read in one pass, character by character: the time is linear in its length.
 */
import { parse as parseToml } from 'smol-toml'
import type { ManifestLibrary } from '../manifests'

/** What the code needs to run, and so no group of its own. */
const MAIN = new Set(['implementation', 'api', 'compile', 'runtimeOnly', 'runtime'])
const CONFIGURATION =
  /^(?:implementation|api|compile|runtime|runtimeOnly|compileOnly|compileOnlyApi|annotationProcessor|kapt|ksp|developmentOnly|providedCompile|providedRuntime|testCompile|testRuntime|[a-z][A-Za-z0-9]*(?:Implementation|Api|CompileOnly|RuntimeOnly|AnnotationProcessor))$/
/** What a configuration takes that is the build's own, not a Library. */
const LOCAL_CALLS = new Set(['project', 'files', 'fileTree', 'gradleApi', 'localGroovy'])
const WRAPPERS = new Set(['platform', 'enforcedPlatform', 'testFixtures'])

type Token =
  | { readonly kind: 'word'; readonly text: string }
  | { readonly kind: 'string'; readonly text: string }
  | { readonly kind: 'mark'; readonly text: string }

/** The tokens of one line, up to a comment: words with dots, strings, and single marks. */
function tokensOf(line: string): Token[] {
  const tokens: Token[] = []
  let at = 0
  while (at < line.length) {
    const char = line[at]!
    if (char === ' ' || char === '\t' || char === '\r') {
      at++
    } else if (char === '/' && (line[at + 1] === '/' || line[at + 1] === '*')) {
      break
    } else if (char === '"' || char === "'") {
      let end = at + 1
      let text = ''
      while (end < line.length && line[end] !== char) {
        if (line[end] === '\\' && end + 1 < line.length) end++
        text += line[end]
        end++
      }
      tokens.push({ kind: 'string', text })
      at = end + 1
    } else if (/[A-Za-z_$]/.test(char)) {
      let end = at + 1
      while (end < line.length && /[A-Za-z0-9_.$]/.test(line[end]!)) end++
      tokens.push({ kind: 'word', text: line.slice(at, end) })
      at = end
    } else {
      tokens.push({ kind: 'mark', text: char })
      at++
    }
  }
  return tokens
}

/** A catalog's Libraries and bundles by the accessor a build names them by: `jackson.databind`. */
export interface VersionCatalog {
  readonly libraries: ReadonlyMap<string, { readonly name: string; readonly version?: string }>
  readonly bundles: ReadonlyMap<string, readonly string[]>
}

/** An alias as an accessor names it: `-`, `_` and `.` all separate. */
const accessor = (alias: string): string => alias.replace(/[-_.]/g, '.')

const tableOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

/** Read `gradle/libs.versions.toml`; `undefined` where it cannot be read. */
export function readCatalog(text: string): VersionCatalog | undefined {
  let document: Record<string, unknown>
  try {
    document = parseToml(text) as Record<string, unknown>
  } catch {
    return undefined
  }
  const versions = tableOf(document['versions'])
  // A `ref` names an entry of `[versions]`; one that names another `ref` is not followed.
  const versionOf = (value: unknown, follow = true): string | undefined => {
    if (typeof value === 'string') return value
    const table = tableOf(value)
    if (typeof table['ref'] === 'string') {
      const ref = table['ref']
      return follow && Object.hasOwn(versions, ref) ? versionOf(versions[ref], false) : undefined
    }
    for (const key of ['strictly', 'require', 'prefer']) {
      if (typeof table[key] === 'string') return table[key]
    }
    return undefined
  }
  const libraries = new Map<string, { name: string; version?: string }>()
  for (const [alias, entry] of Object.entries(tableOf(document['libraries']))) {
    let name: string | undefined
    let version: string | undefined
    if (typeof entry === 'string') {
      const parts = entry.split(':')
      if (parts.length >= 2) name = `${parts[0]}:${parts[1]}`
      version = parts[2]
    } else {
      const table = tableOf(entry)
      if (typeof table['module'] === 'string') name = table['module']
      else if (typeof table['group'] === 'string' && typeof table['name'] === 'string') {
        name = `${table['group']}:${table['name']}`
      }
      version = versionOf(table['version'])
    }
    if (name !== undefined) {
      libraries.set(accessor(alias), { name, ...(version === undefined ? {} : { version }) })
    }
  }
  const bundles = new Map<string, string[]>()
  for (const [alias, members] of Object.entries(tableOf(document['bundles']))) {
    if (!Array.isArray(members)) continue
    bundles.set(
      accessor(alias),
      members.filter((member): member is string => typeof member === 'string').map(accessor)
    )
  }
  return { libraries, bundles }
}

/** The Libraries one build file declares; `catalog` is the version catalog of the build, if any. */
export function inGradle(
  manifest: string,
  text: string,
  catalog: VersionCatalog | undefined
): ManifestLibrary[] {
  const found: ManifestLibrary[] = []
  text.split('\n').forEach((written, index) => {
    const tokens = tokensOf(written)
    // A declaration starts a line, or follows `{` or `;` on it: `dependencies { api 'g:a:v' }`.
    tokens.forEach((token, at) => {
      const before = tokens[at - 1]?.text
      if (at > 0 && before !== '{' && before !== ';') return
      if (token.kind === 'word' && CONFIGURATION.test(token.text)) {
        found.push(...declared(manifest, tokens, at, index + 1, catalog))
      }
    })
  })
  return found
}

/** The Libraries the declaration at `start` of `tokens` names, its configuration first. */
function declared(
  manifest: string,
  tokens: readonly Token[],
  start: number,
  line: number,
  catalog: VersionCatalog | undefined
): ManifestLibrary[] {
  const found: ManifestLibrary[] = []
  const configuration = tokens[start]!.text
  const group = MAIN.has(configuration) ? undefined : configuration
  const add = (name: string, version: string | undefined): void => {
    found.push({
      manifest,
      name,
      ...(version === undefined || version === '' ? {} : { version }),
      ...(group === undefined ? {} : { group }),
      line
    })
  }
  // The declaration ends where the next statement or block begins.
  let end = start + 1
  while (end < tokens.length && !['{', '}', ';'].includes(tokens[end]!.text)) end++
  let at = start + 1
  if (tokens[at]?.text === '(') at++
  let token = at < end ? tokens[at] : undefined
  if (token?.kind === 'word' && LOCAL_CALLS.has(token.text)) return found
  if (token?.kind === 'word' && WRAPPERS.has(token.text) && tokens[at + 1]?.text === '(') {
    at += 2
    token = at < end ? tokens[at] : undefined
  }
  if (token?.kind === 'string') {
    // `implementation 'g:a:1', 'h:b:2'`: each string, as long as commas join them.
    for (let next = at; next < end && tokens[next]!.kind === 'string'; next += 2) {
      const parts = tokens[next]!.text.split('@')[0]!.split(':')
      if (parts.length >= 2 && parts[0] !== '' && parts[1] !== '') {
        add(`${parts[0]}:${parts[1]}`, parts[2])
      }
      if (tokens[next + 1]?.text !== ',') break
    }
    return found
  }
  if (token?.kind !== 'word') return found
  if (token.text === 'kotlin' && tokens[at + 1]?.text === '(') {
    const module = tokens[at + 2]
    const version = tokens[at + 3]?.text === ',' ? tokens[at + 4] : undefined
    if (module?.kind === 'string') {
      add(
        `org.jetbrains.kotlin:kotlin-${module.text}`,
        version?.kind === 'string' ? version.text : undefined
      )
    }
    return found
  }
  if (token.text.startsWith('libs.')) {
    const reference = token.text.slice('libs.'.length)
    if (reference.startsWith('bundles.')) {
      for (const member of catalog?.bundles.get(reference.slice('bundles.'.length)) ?? []) {
        const library = catalog?.libraries.get(member)
        if (library) add(library.name, library.version)
      }
    } else {
      const library = catalog?.libraries.get(reference)
      if (library) add(library.name, library.version)
    }
    return found
  }
  // Named arguments: `group: 'g', name: 'a', version: 'v'`, or with `=` in Kotlin.
  const named = new Map<string, string>()
  for (let key = at; key + 2 < end; key++) {
    const [word, mark, value] = [tokens[key]!, tokens[key + 1]!, tokens[key + 2]!]
    if (
      word.kind === 'word' &&
      (mark.text === ':' || mark.text === '=') &&
      value.kind === 'string'
    ) {
      named.set(word.text, value.text)
    }
  }
  const groupId = named.get('group')
  const artifactId = named.get('name')
  if (groupId !== undefined && artifactId !== undefined) {
    add(`${groupId}:${artifactId}`, named.get('version'))
  }
  return found
}
