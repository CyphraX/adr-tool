/**
 * The Libraries a `package.json` declares (docs/structure-format.md, section 3, "Manifests"):
 * `dependencies`, and `devDependencies`, `peerDependencies` and `optionalDependencies` as the
 * groups `dev`, `peer` and `optional`. Read as JSON, never run. What the repository holds itself
 * is no Library: a workspace package, and a specifier that points into the repository
 * (`workspace:`, `file:`, `link:`, `portal:`, a path).
 */
import type { ManifestLibrary } from '../manifests'

/** The keys of `package.json` that declare Libraries, and the group each puts them in. */
const GROUPS: readonly (readonly [string, string | undefined])[] = [
  ['dependencies', undefined],
  ['devDependencies', 'dev'],
  ['peerDependencies', 'peer'],
  ['optionalDependencies', 'optional']
]

/** A specifier that names something of the repository, not a package of a registry. */
const LOCAL = /^(?:workspace|file|link|portal):|^\.{0,2}\/|^~\//

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The Libraries of one `package.json`. `local` says which package names the repository holds
 * itself: its workspace packages and its root package.
 */
export function inPackageJson(
  manifest: string,
  text: string,
  local: (name: string) => boolean
): ManifestLibrary[] {
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    return []
  }
  if (!isRecord(document)) return []
  const lines = keyLines(text)
  const found: ManifestLibrary[] = []
  for (const [key, group] of GROUPS) {
    const declared = document[key]
    if (!isRecord(declared)) continue
    for (const [name, version] of Object.entries(declared)) {
      if (typeof version !== 'string' || LOCAL.test(version.trim()) || local(name)) continue
      const line = lines.get(`${key}\n${name}`)
      found.push({
        manifest,
        name,
        version,
        ...(group === undefined ? {} : { group }),
        ...(line === undefined ? {} : { line })
      })
    }
  }
  return found
}

/** The name a `package.json` gives its package, if it gives one. */
export function packageName(text: string | undefined): string | undefined {
  if (text === undefined) return undefined
  try {
    const document: unknown = JSON.parse(text)
    return isRecord(document) && typeof document.name === 'string' ? document.name : undefined
  } catch {
    return undefined
  }
}

/**
 * The line of every key one level inside a key of the top: `dependencies\nlodash` → 12. One
 * pass over the text, character by character, so that it takes time linear in its length; the
 * last of a key written twice, as `JSON.parse` takes it.
 */
function keyLines(text: string): Map<string, number> {
  const lines = new Map<string, number>()
  /** Per open object or array: whether it is an object, and the key its next value is under. */
  const open: { object: boolean; key: string | undefined; expectsKey: boolean }[] = []
  let line = 1
  for (let at = 0; at < text.length; at++) {
    const char = text[at]!
    if (char === '\n') {
      line++
      continue
    }
    if (char === '"') {
      const start = at + 1
      let escaped = false
      for (at = start; at < text.length && text[at] !== '"'; at++) {
        if (text[at] === '\\') {
          escaped = true
          at++
        } else if (text[at] === '\n') line++
      }
      const top = open.at(-1)
      if (top?.object && top.expectsKey) {
        const raw = text.slice(start, at)
        const key = escaped ? unescaped(raw) : raw
        top.key = key
        top.expectsKey = false
        if (open.length === 2 && key !== undefined) {
          const parent = open[0]!.key
          if (parent !== undefined) lines.set(`${parent}\n${key}`, line)
        }
      }
      continue
    }
    if (char === '{' || char === '[')
      open.push({ object: char === '{', key: undefined, expectsKey: char === '{' })
    else if (char === '}' || char === ']') open.pop()
    else if (char === ',') {
      const top = open.at(-1)
      if (top?.object) top.expectsKey = true
    }
  }
  return lines
}

/** A key with escapes in it, as JSON reads it; `undefined` where it cannot be read. */
function unescaped(raw: string): string | undefined {
  try {
    return JSON.parse(`"${raw}"`) as string
  } catch {
    return undefined
  }
}
