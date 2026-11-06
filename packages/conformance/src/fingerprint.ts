/**
 * The fingerprint of a Violation (docs/conformance-format.md, section 3): its Rule and what it
 * is about, by the kind of the Rule, without line numbers — so that it stays when lines move.
 * An Exception names a Violation by it, and so will a Baseline and a Finding. Each variant says
 * which it is, so that one cannot be taken for another — a function's Source File and name
 * for a Component's ID.
 */
export type Fingerprint =
  /** `must-not-depend`, `may-only-depend`, `layers`: the source and the target Component. */
  | {
      readonly kind: 'dependency'
      readonly rule: string
      readonly from: string
      readonly to: string
    }
  /** `no-cycles`: the members of the Cycle, Component IDs or paths, in any order. */
  | { readonly kind: 'cycle'; readonly rule: string; readonly cycle: readonly string[] }
  /**
   * `threshold`: the Component whose metric is outside; for propagation cost, the Component
   * whose level below it is — `*` for the top level.
   */
  | { readonly kind: 'component'; readonly rule: string; readonly component: string }
  /** `threshold` on complexity: a function, by its Source File and its name there. */
  | {
      readonly kind: 'function'
      readonly rule: string
      readonly file: string
      readonly name: string
    }
  /** `threshold` on LCOM4: a class, by its Source File and its name there. */
  | { readonly kind: 'class'; readonly rule: string; readonly file: string; readonly name: string }

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The members of a Cycle as they are compared: each once, sorted. */
export const membersOf = (cycle: readonly string[]): string[] => [...new Set(cycle)].sort(compare)

/** The fingerprint on one line, for reading: `billing-not-web: billing -> web`. */
export function fingerprintText(fingerprint: Fingerprint): string {
  switch (fingerprint.kind) {
    case 'dependency':
      return `${fingerprint.rule}: ${fingerprint.from} -> ${fingerprint.to}`
    case 'cycle':
      return `${fingerprint.rule}: ${membersOf(fingerprint.cycle).join(', ')}`
    case 'component':
      return `${fingerprint.rule}: ${fingerprint.component}`
    case 'function':
    case 'class':
      return `${fingerprint.rule}: ${fingerprint.name} in ${fingerprint.file}`
  }
}

/** What two fingerprints are compared by: equal exactly when they name the same Violation. */
export function fingerprintKey(fingerprint: Fingerprint): string {
  return [
    fingerprint.kind,
    fingerprint.rule,
    ...fingerprintKeysOf(fingerprint).flatMap(([, value]) => value)
  ].join('\n')
}

/**
 * The keys an Exception names a Violation by, for each kind of fingerprint, in the order it
 * writes them (docs/conformance-format.md, section 4): a name, or the members of a Cycle. A
 * fingerprint of a new kind is one entry here, and every reader and writer of Exceptions —
 * the file's, the window's, the MCP server's — knows it.
 */
export const FINGERPRINT_SHAPES: {
  readonly [K in Fingerprint['kind']]: readonly (readonly [
    key: string,
    value: 'name' | 'members'
  ])[]
} = {
  dependency: [
    ['from', 'name'],
    ['to', 'name']
  ],
  cycle: [['cycle', 'members']],
  component: [['component', 'name']],
  function: [
    ['file', 'name'],
    ['name', 'name']
  ],
  class: [
    ['file', 'name'],
    ['name', 'name']
  ]
}

/** Every key a fingerprint names a Violation by, of whichever kind. */
export const FINGERPRINT_KEY_NAMES: readonly string[] = [
  ...new Set(Object.values(FINGERPRINT_SHAPES).flatMap((shape) => shape.map(([key]) => key)))
]

/** The kinds of fingerprints, in the order of the format. */
export const FINGERPRINT_KINDS = Object.keys(FINGERPRINT_SHAPES) as Fingerprint['kind'][]

const isMembers = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.length > 1 && value.every((item) => typeof item === 'string')

/**
 * The fingerprint of `kind` that the keys of `written` name for the Rule `rule`; `undefined` where a key of
 * the kind is missing or not what it must be — a Cycle has two members at least —, or, with
 * `only`, where a key of another kind is there as well.
 */
export function readFingerprint(
  kind: Fingerprint['kind'],
  rule: string,
  written: object,
  only = false
): Fingerprint | undefined {
  const keys = written as Readonly<Record<string, unknown>>
  const shape = FINGERPRINT_SHAPES[kind]
  const values: Record<string, unknown> = {}
  for (const [key, type] of shape) {
    const value = keys[key]
    if (type === 'members' ? !isMembers(value) : typeof value !== 'string') return undefined
    values[key] = value
  }
  if (only && FINGERPRINT_KEY_NAMES.some((key) => !(key in values) && keys[key] !== undefined)) {
    return undefined
  }
  return { kind, rule, ...values } as Fingerprint
}

/** The keys of a fingerprint as an Exception writes them, in order: a Cycle's members sorted. */
export function fingerprintKeysOf(fingerprint: Fingerprint): [string, string | string[]][] {
  const values = fingerprint as unknown as Record<string, string | readonly string[]>
  return FINGERPRINT_SHAPES[fingerprint.kind].map(([key, type]) => [
    key,
    type === 'members' ? membersOf(values[key] as readonly string[]) : (values[key] as string)
  ])
}

/**
 * A fingerprint as it comes from outside — from the window over IPC, from an agent —: its
 * `kind`, its `rule` and the keys of that kind. `undefined` for anything else.
 */
export function fingerprintFrom(value: unknown): Fingerprint | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { kind, rule } = value as Record<string, unknown>
  if (typeof rule !== 'string' || !FINGERPRINT_KINDS.includes(kind as Fingerprint['kind'])) {
    return undefined
  }
  return readFingerprint(kind as Fingerprint['kind'], rule, value as Record<string, unknown>)
}

/**
 * The kind of fingerprint the keys of an Exception are of, for a Rule that is not there to say:
 * the first kind whose keys are all there, `dependency` where none is. A function and a class
 * are named alike, and taken for a function.
 */
export function fingerprintKindOfKeys(written: object): Fingerprint['kind'] {
  const keys = written as Readonly<Record<string, unknown>>
  return (
    FINGERPRINT_KINDS.find((kind) =>
      FINGERPRINT_SHAPES[kind].every(([key]) => keys[key] !== undefined)
    ) ?? 'dependency'
  )
}

/** What a fingerprint names, without its Rule, for a title: `billing → web`, `a ⇄ b`, `parse (src/a.ts)`. */
export function fingerprintNames(fingerprint: Fingerprint): string {
  switch (fingerprint.kind) {
    case 'dependency':
      return `${fingerprint.from} → ${fingerprint.to}`
    case 'cycle':
      return membersOf(fingerprint.cycle).join(' ⇄ ')
    case 'component':
      return fingerprint.component
    case 'function':
    case 'class':
      return `${fingerprint.name} (${fingerprint.file})`
  }
}
