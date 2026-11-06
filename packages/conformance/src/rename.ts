/**
 * The Rules' half of a Rename of a Component (docs/conformance-format.md, section 7): every
 * Component ID in `.arch/rules.yml` that names the old ID or one below it names the new one —
 * in the Rules, in the fingerprints of the Exceptions, in the roles of the applied Patterns.
 * As everywhere (ADR-0002) it splices: each value is rewritten where it stands, its quoting
 * kept, and what is handed out has been checked to read back as the same file under the new IDs.
 */
import { isAlias, isMap, isScalar, isSeq, parseDocument, type Scalar, type YAMLMap } from 'yaml'
import { applyEdits, plan, type FileSystem, type Plan, type TextEdit } from '@adr-tool/kernel'
import { renamedPattern } from './component-patterns'
import { RULES_PATH } from './problems'
import { readRules, scalarText } from './rules'
import { refusal } from './sentences'

/** The keys of a Rule that take Component patterns. */
const RULE_KEYS = ['from', 'to', 'of', 'among', 'inside', 'layers', 'only-in', 'not-in']
/** The keys of an Exception that take Component IDs, whatever the kind of its Rule. */
const EXCEPTION_KEYS = ['from', 'to', 'component']

/**
 * Plan the rewrite of `.arch/rules.yml` for the Rename of the Component `from` to `to`: no
 * change where the file is not there or names neither. Never writes.
 */
export function planRenameInRules(fs: FileSystem, from: string, to: string): Promise<Plan> {
  return plan(
    fs,
    (text: string) => text,
    async (pending) => {
      if ((await fs.readText(RULES_PATH)) === undefined) return
      await pending.write(RULES_PATH, (text) => renameInRules(text, from, to))
    }
  )
}

/** The edits that rename `from` to `to` in the text of `.arch/rules.yml`. */
export function renameInRules(text: string, from: string, to: string): TextEdit[] {
  if (readRules(text).problems.some((problem) => problem.kind === 'unreadable-rules')) {
    throw refusal({ code: 'rename-unreadable-rules', values: { path: RULES_PATH } })
  }
  const cannot = refusal({ code: 'cannot-rename-in-rules', values: { path: RULES_PATH, id: from } })
  const doc = parseDocument(text, { uniqueKeys: false })
  const scalars = namingScalars(doc.contents, cannot)

  const edits: TextEdit[] = []
  for (const scalar of scalars) {
    // `from: 2024` names the Component 2024, as the Rules read it.
    const value = scalarText(scalar)
    if (value === undefined) continue
    const renamed = renamedPattern(value, from, to)
    if (renamed === value) continue
    if (!scalar.range) throw cannot
    const written =
      scalar.type === 'QUOTE_DOUBLE'
        ? JSON.stringify(renamed)
        : scalar.type === 'QUOTE_SINGLE'
          ? `'${renamed.replaceAll("'", "''")}'`
          : scalar.type === 'PLAIN'
            ? renamed
            : undefined
    if (written === undefined) throw cannot
    edits.push({ start: scalar.range[0], end: scalar.range[1], insert: written })
    // What the text should read back as: the same document, with this value renamed.
    scalar.value = renamed
  }
  if (edits.length === 0) return edits

  const after = parseDocument(applyEdits(text, edits), { uniqueKeys: false })
  const expected = readsAs(doc)
  if (after.errors.length > 0 || expected === undefined || readsAs(after) !== expected) {
    throw cannot
  }
  return edits
}

/**
 * What a document reads as, to compare: its values, a number or a boolean as the text the
 * Rules read it as. `undefined` where it cannot be made out: aliases that would expand past
 * what the YAML library allows, say.
 */
function readsAs(doc: ReturnType<typeof parseDocument>): string | undefined {
  try {
    return JSON.stringify(doc.toJS(), (_key, value: unknown) =>
      typeof value === 'number' || typeof value === 'boolean' ? String(value) : value
    )
  } catch {
    return undefined
  }
}

/**
 * The scalars that name Components: under the keys of the Rules, the Exceptions and the
 * applied Patterns that do. The members of a Cycle are Component IDs only where the Cycle is
 * found among Components; inside a Component they are paths, which a Rename leaves alone.
 */
function namingScalars(contents: unknown, cannot: Error): Scalar[] {
  if (!isMap(contents)) return []
  const found: Scalar[] = []
  const collect = (node: unknown): void => {
    if (isAlias(node)) throw cannot
    if (isScalar(node)) found.push(node)
    else if (isSeq(node)) node.items.forEach(collect)
  }
  const items = (key: string): YAMLMap[] => {
    const list = valueOf(contents, key)
    return isSeq(list) ? list.items.filter(isMap) : []
  }

  const amongCycles = new Set<string>()
  for (const rule of items('rules')) {
    for (const key of RULE_KEYS) collect(valueOf(rule, key))
    const id = valueOf(rule, 'id')
    if (
      isScalar(id) &&
      valueOf(rule, 'kind') !== undefined &&
      valueOf(rule, 'among') !== undefined
    ) {
      const kind = valueOf(rule, 'kind')
      if (isScalar(kind) && kind.value === 'no-cycles') amongCycles.add(String(id.value))
    }
  }
  for (const exception of items('exceptions')) {
    for (const key of EXCEPTION_KEYS) collect(valueOf(exception, key))
    const rule = valueOf(exception, 'rule')
    if (isScalar(rule) && amongCycles.has(String(rule.value))) collect(valueOf(exception, 'cycle'))
  }
  for (const pattern of items('patterns')) {
    const roles = valueOf(pattern, 'roles')
    if (isAlias(roles)) throw cannot
    if (isMap(roles)) for (const pair of roles.items) collect(pair.value)
  }
  return found
}

/** The value of a key; the first one counts. */
function valueOf(map: YAMLMap, key: string): unknown {
  return map.items.find((pair) => isScalar(pair.key) && pair.key.value === key)?.value
}
