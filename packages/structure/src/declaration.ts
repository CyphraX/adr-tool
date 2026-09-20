import { isMap, isScalar, isSeq, parseDocument, type YAMLMap } from 'yaml'
import type { StructureProblem } from './problems'

/** A Component as `.arch/components.yml` declares it (docs/structure-format.md, section 1). */
export interface DeclaredComponent {
  /** The path of map keys, joined with `/`. */
  readonly id: string
  /** The display name; the last segment of the ID when none is given. */
  readonly name: string
  readonly description?: string
  readonly paths: readonly string[]
  readonly tests: readonly string[]
  readonly children: readonly DeclaredComponent[]
}

export type Declaration =
  /** The file is not there, or it declares no Component. The Draft applies. */
  | { readonly kind: 'absent' }
  /** The file is there and cannot be read. The Draft is shown, and nothing is written. */
  | { readonly kind: 'unreadable'; readonly detail: string }
  | {
      readonly kind: 'declared'
      readonly components: readonly DeclaredComponent[]
      /** What can be said without looking at the Source Files. */
      readonly problems: readonly StructureProblem[]
    }

const SEGMENT = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/** The value of a key the suite owns is not of the form the specification gives it. */
class WrongForm extends Error {}

export function readDeclaration(text: string | undefined): Declaration {
  if (text === undefined) return { kind: 'absent' }
  // Keys that occur twice are a Problem of their own, not a reason to give up on the file.
  const doc = parseDocument(text, { uniqueKeys: false })
  if (doc.errors.length > 0) {
    return { kind: 'unreadable', detail: `it is not valid YAML: ${doc.errors[0]!.message}` }
  }
  if (doc.contents === null) return { kind: 'absent' }
  if (!isMap(doc.contents)) return { kind: 'unreadable', detail: 'its top level must be a map' }

  const problems: StructureProblem[] = []
  try {
    const top = valueOf(doc.contents, 'components')
    if (top === undefined || top === null) return { kind: 'absent' }
    if (!isMap(top)) throw new WrongForm('"components" must be a map of Components')
    const components = readComponents(top, '', problems)
    return components.length === 0 ? { kind: 'absent' } : { kind: 'declared', components, problems }
  } catch (error) {
    if (error instanceof WrongForm) return { kind: 'unreadable', detail: error.message }
    throw error
  }
}

function readComponents(
  map: YAMLMap,
  parent: string,
  problems: StructureProblem[]
): DeclaredComponent[] {
  const components: DeclaredComponent[] = []
  const seen = new Set<string>()
  for (const pair of map.items) {
    const segment = keyText(pair.key)
    const id = parent === '' ? segment : `${parent}/${segment}`
    if (seen.has(segment)) {
      problems.push({ kind: 'duplicate-component', component: id })
      continue
    }
    seen.add(segment)
    if (!SEGMENT.test(segment)) problems.push({ kind: 'invalid-segment', component: id, segment })

    const value = emptyToNull(pair.value)
    if (value !== null && !isMap(value)) throw new WrongForm(`${id} must be a map of its keys`)
    const nested = value === null ? undefined : valueOf(value, 'components')
    if (nested !== undefined && nested !== null && !isMap(nested)) {
      throw new WrongForm(`"components" of ${id} must be a map of Components`)
    }

    const paths = value === null ? [] : listOf(value, 'paths', id)
    const children = isMap(nested) ? readComponents(nested, id, problems) : []
    if (paths.length === 0 && children.length === 0) {
      problems.push({ kind: 'empty-component', component: id })
    }
    const description = value === null ? undefined : textOf(value, 'description', id)
    components.push({
      id,
      name: (value === null ? undefined : textOf(value, 'name', id)) ?? segment,
      ...(description === undefined ? {} : { description }),
      paths,
      tests: value === null ? [] : listOf(value, 'tests', id),
      children
    })
  }
  return components
}

/** The value of a key, `undefined` when the key is not there. The first one counts. */
function valueOf(map: YAMLMap, key: string): unknown {
  const pair = map.items.find((candidate) => keyText(candidate.key) === key)
  return pair && emptyToNull(pair.value)
}

/** `key:` without a value is a scalar that holds null, not null itself. */
const emptyToNull = (node: unknown): unknown =>
  isScalar(node) && node.value === null ? null : node

const keyText = (key: unknown): string => (isScalar(key) ? String(key.value) : String(key))

/** A scalar as the text it stands for: `2` and `true` written as a name or a pattern are text. */
function scalarText(node: unknown): string | undefined {
  if (!isScalar(node) || node.value === null || typeof node.value === 'object') return undefined
  return typeof node.value === 'string' ? node.value : (node.source ?? String(node.value))
}

function textOf(map: YAMLMap, key: string, id: string): string | undefined {
  const node = valueOf(map, key)
  if (node === undefined || node === null) return undefined
  const text = scalarText(node)
  if (text === undefined) throw new WrongForm(`"${key}" of ${id} must be a text`)
  return text
}

function listOf(map: YAMLMap, key: string, id: string): string[] {
  const node = valueOf(map, key)
  if (node === undefined || node === null) return []
  if (!isSeq(node)) throw new WrongForm(`"${key}" of ${id} must be a list of patterns`)
  return node.items.map((item) => {
    const text = scalarText(item)
    if (text === undefined) throw new WrongForm(`"${key}" of ${id} must be a list of patterns`)
    return text
  })
}
