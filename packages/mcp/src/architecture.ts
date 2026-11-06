/**
 * The tools of Structure and Conformance (docs/mcp.md): the Dependencies, Cycles and metrics of
 * the Components as data, the Rules of `.arch/rules.yml` and their Violations — also those of
 * an import before it is written —, and Rules and Exceptions planned as change sets, as the
 * ADR tools plan theirs. The code is analysed as `adr check` analyses it, and the Rules are
 * checked through the same composition (`@adr-tool/cli`); what each file says is remembered by
 * its content while the server runs, so that a second call reads only what changed.
 */
import { createHash } from 'node:crypto'
import {
  analyseRepository,
  extractorFor,
  listRepository,
  type Analysed
} from '@adr-tool/cli/analysis'
import { conformanceOf, decisionsOf } from '@adr-tool/cli/conformance'
import {
  checkPlannedImport,
  conformanceEnglishOf,
  FINGERPRINT_SHAPES,
  findException,
  fingerprintKeysOf,
  fingerprintKeysSaid,
  fingerprintKindOf,
  fingerprintKindOfKeys,
  fingerprintText,
  METRICS,
  needsModel,
  planAddException,
  planAddRule,
  planChangeRule,
  planConformanceRepair,
  planRemoveRule,
  readFingerprint,
  readRules,
  repairOf,
  RULE_KIND_NAMES,
  RULES_PATH,
  sentenceAt,
  wordingOf,
  draftOf,
  type CheckedViolation,
  type ConformanceNote,
  type ConformanceProblem,
  type ConformanceReport,
  type Fingerprint,
  type MetricName,
  type Rule,
  type RuleDraft,
  type RulesFile
} from '@adr-tool/conformance'
import { normalizePath, type Plan, type Repository, type WritableFileSystem } from '@adr-tool/core'
import { prepareResolver, type Extract, type Extraction } from '@adr-tool/structure'
import {
  DECLARATION_PATH,
  everyComponent,
  languageOf,
  levelOf,
  metricsOf,
  readDeclaration,
  sizeOf,
  type Dependency
} from '@adr-tool/structure/model'
import { PLAN, READ, Refusal, type Tool } from './protocol'
import { flag, list, number, object, oneOf, required, text } from './schema'

export interface ArchitectureContext {
  /** The repository: the directory the server was started for. */
  readonly root: string
  readonly fs: WritableFileSystem
  /** The Decision Logs as they are now: the ADRs an Exception can be justified by. */
  readonly repository: () => Promise<Repository>
  /** Hold a plan and show it, as the ADR tools do; `apply_change` writes it. */
  readonly preview: (plan: Plan) => Record<string, unknown>
}

/** How many Violations, imports and Dependencies a result lists before it counts the rest. */
const AT_MOST = 50
/** How many imports behind one Dependency or Violation are listed. */
const IMPORTS_AT_MOST = 10

const COMPONENTS = list(
  'Component IDs or patterns, as list_components and .arch/components.yml name them: "billing", "features/*".'
)
const RULE_ID = required(
  'The Rule\'s ID: lowercase letters, digits and dashes, e.g. "billing-not-web".'
)

/** The first `AT_MOST` of a list, and how many more there are. */
function capped<T>(items: readonly T[], key: string, limit = AT_MOST): Record<string, unknown> {
  return {
    [key]: items.slice(0, limit),
    ...(items.length > limit && { [`${key}NotListed`]: items.length - limit })
  }
}

/** A share or a ratio, to three places: what an agent needs of it. */
const rounded = (value: number | undefined): number | undefined =>
  value === undefined ? undefined : Math.round(value * 1000) / 1000

/** Each import behind some Source File Dependencies: the file, the line, what it imports. */
const importsOf = (dependencies: readonly Dependency[]): Record<string, unknown>[] =>
  dependencies.flatMap((dependency) =>
    dependency.lines.map((line) => ({ file: dependency.from, line, imports: dependency.to }))
  )

/** A fingerprint as an Exception writes it, and as plan_exception takes it: without its kind. */
const exceptionKeysOf = (fingerprint: Fingerprint): Record<string, unknown> => ({
  rule: fingerprint.rule,
  ...Object.fromEntries(fingerprintKeysOf(fingerprint))
})

/** A Rule as list_rules gives it, in the keys plan_rule takes: its draft, with its line. */
function ruleOf(rule: Rule): Record<string, unknown> {
  const { tests, ...draft } = draftOf(rule)
  const { ignoreTypeOnly, ...keys } = draft as typeof draft & { ignoreTypeOnly?: boolean }
  const named: Record<string, unknown> = { ...keys }
  if (keys.kind === 'no-cycles') {
    delete named.scope
    delete named.components
    named[keys.scope] = keys.components
  }
  return {
    ...named,
    ...(tests && { tests: true }),
    ...(ignoreTypeOnly && { ignoreTypeOnly: true }),
    line: rule.line
  }
}

/** A Violation: what it is, in a sentence, what an Exception names it by, and its imports. */
function violationOf(violation: CheckedViolation): Record<string, unknown> {
  const imports = importsOf(violation.dependencies)
  return {
    rule: violation.rule.id,
    kind: violation.rule.kind,
    sentence: sentenceAt(violation),
    fingerprint: exceptionKeysOf(violation.fingerprint),
    ...(violation.cycle && { cycle: violation.cycle }),
    ...(violation.component !== undefined && { component: violation.component }),
    ...(violation.file !== undefined && { file: violation.file }),
    ...(violation.name !== undefined && { name: violation.name }),
    ...(violation.line !== undefined && { line: violation.line }),
    ...(violation.value !== undefined && { value: rounded(violation.value) }),
    ...(violation.exception && {
      acceptedBy: {
        line: violation.exception.line,
        reason: violation.exception.reason,
        ...(violation.exception.justifiedBy && {
          justifiedBy: violation.exception.justifiedBy.adr
        })
      }
    }),
    ...capped(imports, 'imports', IMPORTS_AT_MOST)
  }
}

/** A Problem or a note of the Rules file, with the arguments of plan_exception that repair it. */
function problemOf(found: ConformanceProblem | ConformanceNote): Record<string, unknown> {
  const repair = repairOf(found)
  return {
    code: found.kind,
    line: found.line,
    message: wordingOf(found),
    ...(repair && {
      repair: {
        tool: 'plan_exception',
        arguments: {
          action: repair.kind === 'remove-exception' ? 'remove' : 'narrow',
          ...exceptionKeysOf(repair.fingerprint),
          line: repair.line,
          ...(repair.kind === 'narrow-exception' && { members: repair.members })
        }
      }
    })
  }
}

/** Why the Rules were not checked, where they were not. */
function notCheckedOf(report: ConformanceReport): Record<string, unknown> {
  if (report.evaluated || report.rules.length === 0) return {}
  return {
    note:
      report.problems[0] !== undefined
        ? `The Rules are not checked: ${wordingOf(report.problems[0])}`
        : `The Rules are not checked: ${DECLARATION_PATH} declares no Components.`
  }
}

const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.map(String) : undefined

/** The kinds of a Rule whose keys carry over when a change turns one into the other. */
const familyOf = (kind: unknown): unknown => (kind === 'may-only-depend' ? 'must-not-depend' : kind)

/** Each key of plan_rule that, given, replaces the keys a Rule had beside it. */
const REPLACES: Readonly<Record<string, readonly string[]>> = {
  among: ['inside'],
  inside: ['among'],
  max: ['min'],
  min: ['max']
}

/**
 * The Rule `input` describes, for plan_rule: what it says, and for a change what the Rule said
 * where it says nothing (`ruleOf`) — of another kind, only its why and its options. The keys
 * are merged first and then read as one.
 */
function ruleDraft(input: Record<string, unknown>, id: string, current?: Rule): RuleDraft {
  const before: Record<string, unknown> = current ? ruleOf(current) : {}
  const kind = (input.kind ?? before.kind) as Rule['kind'] | undefined
  if (kind === undefined) {
    throw new Refusal(`A new Rule needs a "kind": one of ${RULE_KIND_NAMES.join(', ')}.`)
  }
  if (kind === 'no-cycles' && input.among !== undefined && input.inside !== undefined) {
    throw new Refusal('A Rule of the kind no-cycles has either "among" or "inside", not both.')
  }
  const kept: Record<string, unknown> =
    familyOf(before.kind) === familyOf(kind)
      ? { ...before }
      : { why: before.why, tests: before.tests, ignoreTypeOnly: before.ignoreTypeOnly }
  for (const [key, replaced] of Object.entries(REPLACES)) {
    if (input[key] !== undefined) for (const other of replaced) delete kept[other]
  }
  const keys: Record<string, unknown> = {
    ...kept,
    ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined))
  }

  const why = keys.why
  if (typeof why !== 'string' || why.trim() === '') {
    throw new Refusal('A Rule needs a "why": the reason it exists, in a sentence.')
  }
  const need = <T>(value: T | undefined, key: string): T => {
    if (value === undefined) throw new Refusal(`A Rule of the kind ${kind} needs "${key}".`)
    return value
  }
  const common = { id, why, ...(keys.tests === true && { tests: true }) }
  const options = { ...common, ...(keys.ignoreTypeOnly === true && { ignoreTypeOnly: true }) }
  switch (kind) {
    case 'must-not-depend':
    case 'may-only-depend':
      return {
        ...options,
        kind,
        from: need(strings(keys.from), 'from'),
        to: need(strings(keys.to), 'to')
      }
    case 'layers':
      return {
        ...options,
        kind,
        layers: need(
          Array.isArray(keys.layers)
            ? keys.layers.map((layer) =>
                Array.isArray(layer) ? layer.map(String) : [String(layer)]
              )
            : undefined,
          'layers'
        ),
        mode: (keys.mode as 'relaxed' | 'strict' | undefined) ?? 'relaxed'
      }
    case 'no-cycles': {
      const scope =
        keys.among !== undefined
          ? ('among' as const)
          : keys.inside !== undefined
            ? ('inside' as const)
            : undefined
      return {
        ...options,
        kind,
        scope: need(scope, 'among" or "inside'),
        components: need(strings(keys[scope ?? 'among']), scope ?? 'among')
      }
    }
    case 'threshold': {
      const max = keys.max as number | undefined
      const min = keys.min as number | undefined
      if (max === undefined && min === undefined) {
        throw new Refusal('A Rule of the kind threshold needs "max", "min" or both.')
      }
      return {
        ...common,
        kind,
        metric: need(keys.metric as MetricName | undefined, 'metric'),
        ...(max !== undefined && { max }),
        ...(min !== undefined && { min }),
        of: need(strings(keys.of), 'of')
      }
    }
  }
}

/** Keys of the Rules file as a sentence names them: `"from" and "to"`. */
const quotedKeys = (keys: readonly string[]): string => {
  const quoted = keys.map((key) => `"${key}"`)
  return quoted.length < 2
    ? (quoted[0] ?? '')
    : `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}`
}

/**
 * The Violation `input` names, for plan_exception: by the keys its Rule's kind names a
 * Violation by (FINGERPRINT_SHAPES) — of a Rule that is not in the file, by the keys it was
 * given.
 */
function fingerprintFrom(input: Record<string, unknown>, file: RulesFile): Fingerprint {
  const rule = String(input.rule)
  const known = file.rules.find((candidate) => candidate.id === rule)
  const kind = known ? fingerprintKindOf(known) : fingerprintKindOfKeys(input)
  const fingerprint = readFingerprint(kind, rule, input)
  if (fingerprint !== undefined) return fingerprint
  const said = known
    ? fingerprintKeysSaid(known)
    : { keys: FINGERPRINT_SHAPES[kind].map(([key]) => key), topLevel: undefined }
  const top = said.topLevel === undefined ? '' : `, or "${said.topLevel}" for the top level`
  throw new Refusal(
    `An Exception from ${rule} names its Violation by ${quotedKeys(said.keys)}${top}, as list_violations gives them in "fingerprint".`
  )
}

/**
 * The tools that read — beside list_components — and the two that plan, beside the plans of
 * ADRs; `apply_change` and `discard_change` take their changes as they take any other.
 */
export function architectureTools(context: ArchitectureContext): {
  readonly reads: Tool[]
  readonly plans: Tool[]
} {
  const { fs } = context

  /** What each Source File says, by its content: what the app caches on disk, kept in memory. */
  const remembered = new Map<string, { readonly hash: string; readonly extraction?: Extraction }>()
  const analyse = async (extra: readonly string[] = []): Promise<Analysed> => {
    const analysed = await analyseRepository(context.root, fs, {
      extra,
      extract: async (structure): Promise<Extract> => {
        const extract = await extractorFor(structure)
        return (path, text) => {
          const hash = createHash('sha256').update(text, 'utf8').digest('base64')
          const held = remembered.get(path)
          if (held?.hash === hash) return held.extraction
          const extraction = extract(path, text)
          remembered.set(path, { hash, ...(extraction && { extraction }) })
          return extraction
        }
      }
    })
    const files = new Set(analysed.files)
    for (const path of remembered.keys()) if (!files.has(path)) remembered.delete(path)
    return analysed
  }

  /** The Rules of the file, checked against the code as it is, or with `extra` files planned. */
  const check = async (
    extra: readonly string[] = []
  ): Promise<{
    file: RulesFile
    analysed: Analysed
    repository: Repository
    report: ConformanceReport
  }> => {
    const file = readRules(await fs.readText(RULES_PATH))
    const [analysed, repository] = await Promise.all([analyse(extra), context.repository()])
    const model = needsModel(file, analysed.structure) ? analysed.dependencies : undefined
    return {
      file,
      analysed,
      repository,
      report: conformanceOf(file, analysed.structure, model, repository)
    }
  }

  /** A path of the repository as an agent names it. */
  const pathOf = (value: unknown, key: string): string => {
    const path = normalizePath(String(value).trim())
    if (path === undefined || path === '') {
      throw new Refusal(`"${key}" is no file of the repository: name it relative to its root.`)
    }
    return path
  }

  /** The Violations an import would be part of, before it is written. */
  const planned = async (input: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const from = pathOf(input.from, 'from')
    const written = String(input.to).trim()
    const asPath = normalizePath(written)
    // A file of the repository named by its path, with the extension of a Source File, is
    // taken as one, written yet or not: what is planned may be two new files.
    const listed = await listRepository(context.root)
    const topOf = (path: string): string => path.slice(0, path.indexOf('/') + 1)
    const newFile =
      asPath !== undefined &&
      !written.startsWith('.') &&
      asPath.includes('/') &&
      languageOf(asPath) !== undefined &&
      !listed.includes(asPath) &&
      listed.some((path) => path.startsWith(topOf(asPath)))
    let { file, analysed, repository } = await check(newFile ? [from, asPath] : [from])
    const source = analysed.structure.sourceFiles.find((one) => one.path === from)
    if (source === undefined) {
      throw new Refusal(
        `${from} is no Source File: the suite reads the imports of TypeScript, JavaScript, Svelte, Java, Python and Go.`
      )
    }
    const isSource = (path: string | undefined): boolean =>
      path !== undefined && analysed.structure.sourceFiles.some((one) => one.path === path)
    let to = isSource(asPath) ? asPath : undefined
    // A specifier is resolved as TypeScript resolves it; from Java, Python or Go, the file is named.
    if (to === undefined && (source.language === 'typescript' || source.language === 'svelte')) {
      const resolution = (await prepareResolver(fs, analysed.files)).resolve(written, from)
      const outside = (note: string): Record<string, unknown> => ({
        import: { from, to: written },
        violations: [],
        note
      })
      switch (resolution.kind) {
        case 'source-file':
          to = resolution.path
          break
        case 'library':
          return outside(
            `${written} is the Library ${resolution.name}: the Rules are about Components, and no Rule is about a Library.`
          )
        case 'built-in':
          return outside(`${written} is a module of Node.js: no Rule is about it.`)
        case 'ignored':
          return outside(
            `${written} is a file of the repository, but no Source File: no Dependency is counted on it.`
          )
        case 'not-resolved':
          break
      }
    }
    if (to === undefined && asPath !== undefined && !written.startsWith('.')) {
      // A file that is not written yet either, named by its path.
      ;({ file, analysed, repository } = await check([from, asPath]))
      if (isSource(asPath)) to = asPath
    }
    if (to === undefined) {
      throw new Refusal(
        `${written} cannot be resolved from ${from}. Name the file it would import, relative to the repository root, e.g. "src/web/format.ts".`
      )
    }
    const typeOnly = input.typeOnly === true
    const model = analysed.dependencies
    const report = checkPlannedImport(
      file,
      analysed.structure,
      model,
      { from, to, typeOnly },
      decisionsOf(repository)
    )
    const owner = (path: string): string | undefined =>
      analysed.structure.sourceFiles.find((one) => one.path === path)?.component
    const breaks = report.violations.filter((violation) => violation.exception === undefined)
    return {
      import: {
        from,
        to,
        ...(written !== to && { written }),
        ...(owner(from) !== undefined && { fromComponent: owner(from) }),
        ...(owner(to) !== undefined && { toComponent: owner(to) }),
        ...(typeOnly && { typeOnly }),
        exists: report.exists
      },
      checked: report.evaluated,
      breaks: breaks.length,
      ...capped(report.violations.map(violationOf), 'violations'),
      ...notCheckedOf(report),
      next:
        breaks.length > 0
          ? 'The import would break the Rules above. Write it another way, or ask the person: an Exception that accepts it is planned with plan_exception, once they agree.'
          : report.violations.length > 0
            ? 'The import breaks no Rule that an Exception does not accept already.'
            : 'The import breaks no Rule.'
    }
  }

  const reads: Tool[] = [
    {
      name: 'read_structure',
      title: 'Read the Structure',
      description:
        'The Dependencies between the Components of one level of the hierarchy — the top, or the children of "component" —, their Cycles, and the metrics of each Component, as the app shows them. Below a Component without children, its Source Files and directories. Test files are left out unless "tests" is true.',
      inputSchema: object({
        component: text('The Component whose children are shown; the top level when left out.'),
        tests: flag('Count test files as well.')
      }),
      annotations: { title: 'Read the Structure', ...READ },
      run: async (input) => {
        const { structure, dependencies } = await analyse()
        const parent = typeof input.component === 'string' ? input.component : undefined
        const options = { tests: input.tests === true }
        const level = levelOf(structure, dependencies.dependencies, parent, options)
        if (level === undefined) {
          throw new Refusal(
            `There is no Component ${parent ?? ''}. list_components lists the Components there are.`
          )
        }
        const metrics = metricsOf(
          structure,
          dependencies.dependencies,
          dependencies.lineCounts,
          options
        )
        return {
          ...(parent !== undefined && { component: parent }),
          components: structure.origin,
          ...(structure.origin === 'draft' && {
            note: `${DECLARATION_PATH} declares no Components: these are the Draft, the Components the suite proposes from the directories.`
          }),
          nodes: level.nodes.map((node) => {
            // A Component's own Source Files and Unassigned have a size and no other metric, as
            // in the app: their ID is that of the Component they stand beside.
            const measured =
              node.kind === 'component' || node.kind === 'directory'
                ? metrics.get(node.id)
                : undefined
            return {
              id: node.id,
              kind: node.kind,
              ...(measured
                ? {
                    files: measured.files,
                    lines: measured.lines,
                    efferentCoupling: measured.efferent,
                    afferentCoupling: measured.afferent,
                    instability: rounded(measured.instability),
                    fanOut: measured.fanOut,
                    fanIn: measured.fanIn,
                    cohesion: rounded(measured.cohesion),
                    internalShare: rounded(measured.internalShare)
                  }
                : sizeOf(node.files, dependencies.lineCounts))
            }
          }),
          dependencies: level.edges.map((edge) => ({
            from: edge.from,
            to: edge.to,
            weight: edge.weight,
            ...(edge.typeOnly && { typeOnly: true }),
            ...capped(importsOf(edge.dependencies), 'imports', IMPORTS_AT_MOST)
          })),
          cycles: level.cycles,
          ...(dependencies.notAnalysed.length > 0 && {
            ...capped(
              dependencies.notAnalysed.map((one) => ({
                file: one.file,
                ...(one.line !== undefined && { line: one.line }),
                ...(one.message !== undefined && { message: one.message })
              })),
              'notAnalysed'
            )
          })
        }
      }
    },
    {
      name: 'list_rules',
      title: 'List the Rules',
      description: `The Rules of ${RULES_PATH} — what the code of the repository must keep to, and why —, how many Violations each has and how many of them Exceptions accept, the Exceptions, and what is wrong with the file, with the Repair where the suite knows one. Read them before writing code that adds imports.`,
      inputSchema: object({}),
      annotations: { title: 'List the Rules', ...READ },
      run: async () => {
        const { file, report } = await check()
        const count = (rule: Rule, accepted: boolean): number =>
          report.violations.filter(
            (violation) =>
              violation.rule.id === rule.id && (violation.exception !== undefined) === accepted
          ).length
        return {
          path: RULES_PATH,
          present: report.present,
          checked: report.evaluated,
          rules: report.rules.map((rule) => ({
            ...ruleOf(rule),
            ...(report.evaluated && {
              violations: count(rule, false),
              accepted: count(rule, true)
            })
          })),
          exceptions: file.exceptions.map((exception) => ({
            line: exception.line,
            rule: exception.rule,
            ...(exception.from !== undefined && { from: exception.from }),
            ...(exception.to !== undefined && { to: exception.to }),
            ...(exception.cycle !== undefined && { cycle: exception.cycle }),
            ...(exception.component !== undefined && { component: exception.component }),
            reason: exception.reason,
            ...(exception.justifiedBy && { justifiedBy: exception.justifiedBy.adr })
          })),
          problems: report.problems.map(problemOf),
          notes: report.notes.map(problemOf),
          ...notCheckedOf(report)
        }
      }
    },
    {
      name: 'list_violations',
      title: 'List the Violations',
      description:
        'The Violations of the Rules in the code as it is — each with its sentence, its imports and the fingerprint an Exception names it by —, those an Exception accepts marked. With "from" and "to", the Violations an import would be part of before it is written: which Rules it would break. Ask before you write an import from one Component into another.',
      inputSchema: object({
        rule: text('Only the Violations of this Rule.'),
        component: text(
          'Only the Violations about this Component or one inside it: from it, to it, of it, or of a Cycle it is in.'
        ),
        from: text(
          'With "to": the file the import is planned in, relative to the repository root; it need not be written yet.'
        ),
        to: text(
          'With "from": what it would import — the file, relative to the repository root, or the specifier as the import would say it, e.g. "../core/src/index" or "@acme/core".'
        ),
        typeOnly: flag('With "from" and "to": the import is `import type`.')
      }),
      annotations: { title: 'List the Violations', ...READ },
      run: async (input) => {
        if ((input.from === undefined) !== (input.to === undefined)) {
          throw new Refusal('A planned import needs both "from" and "to".')
        }
        if (input.from !== undefined) return planned(input)
        const { report, analysed } = await check()
        const component = typeof input.component === 'string' ? input.component : undefined
        const about = (id: string | undefined): boolean =>
          id !== undefined &&
          component !== undefined &&
          (id === component || id.startsWith(`${component}/`))
        // A function or a class is of the Component its file belongs to.
        const ownerOf = (path: string | undefined): string | undefined =>
          path === undefined
            ? undefined
            : analysed.structure.sourceFiles.find((one) => one.path === path)?.component
        const violations = report.violations.filter(
          (violation) =>
            (input.rule === undefined || violation.rule.id === input.rule) &&
            (component === undefined ||
              about(violation.from) ||
              about(violation.to) ||
              about(violation.component) ||
              about(ownerOf(violation.file)) ||
              (violation.cycle?.members.some(about) ?? false))
        )
        return {
          checked: report.evaluated,
          breaks: violations.filter((violation) => violation.exception === undefined).length,
          ...capped(violations.map(violationOf), 'violations'),
          ...notCheckedOf(report)
        }
      }
    }
  ]

  const plans: Tool[] = [
    {
      name: 'plan_rule',
      title: 'Plan a Rule',
      description: `Plan to add a Rule to ${RULES_PATH}, to change one, or to remove one with its Exceptions. A change keeps what it does not name. The file is written in the lines the change touches only, its comments kept; where that cannot be done, the plan says why. Writes nothing; returns the change to show and apply.`,
      inputSchema: object(
        {
          action: oneOf(['add', 'change', 'remove'], 'What is planned; "add" when left out.'),
          id: RULE_ID,
          newId: text('For a change: the ID the Rule is to have instead; its Exceptions follow.'),
          why: text('Why the Rule exists, in a sentence: what a person reads on a Violation.'),
          kind: oneOf(RULE_KIND_NAMES, 'The kind of the Rule.'),
          from: COMPONENTS,
          to: COMPONENTS,
          layers: {
            type: 'array',
            description:
              'For layers: the layers from the top down, each a list of Component IDs or patterns.',
            items: { type: 'array', items: { type: 'string' } }
          },
          mode: oneOf(
            ['relaxed', 'strict'],
            'For layers: strict forbids skipping a layer as well; relaxed when left out.'
          ),
          among: COMPONENTS,
          inside: COMPONENTS,
          metric: oneOf(METRICS, 'For threshold: the metric.'),
          max: number('For threshold: the highest value allowed.'),
          min: number('For threshold: the lowest value allowed.'),
          of: COMPONENTS,
          tests: flag('Test files count as well.'),
          ignoreTypeOnly: flag('Type-only imports do not count. Not for threshold.')
        },
        ['id']
      ),
      annotations: { title: 'Plan a Rule', ...PLAN },
      run: async (input) => {
        const id = String(input.id).trim()
        const action = (input.action as string | undefined) ?? 'add'
        if (action === 'remove') return context.preview(await planRemoveRule(fs, id))
        const declaration = readDeclaration(await fs.readText(DECLARATION_PATH))
        const declared =
          declaration.kind === 'declared'
            ? everyComponent(declaration.components).map((component) => component.id)
            : undefined
        if (action === 'add') {
          return context.preview(await planAddRule(fs, ruleDraft(input, id), declared))
        }
        const file = readRules(await fs.readText(RULES_PATH))
        const current = file.rules.find((rule) => rule.id === id)
        if (current === undefined) {
          throw new Refusal(
            conformanceEnglishOf({ code: 'no-rule', values: { path: RULES_PATH, id } })
          )
        }
        const newId = typeof input.newId === 'string' ? input.newId.trim() : id
        return context.preview(
          await planChangeRule(fs, id, ruleDraft(input, newId, current), declared)
        )
      }
    },
    {
      name: 'plan_exception',
      title: 'Plan an Exception',
      description: `Plan an Exception in ${RULES_PATH} that accepts a Violation the person decided to live with, named by its fingerprint as list_violations gives it, with the reason and, where there is one, the ADR behind it. "remove" takes one out, "narrow" narrows one of a Cycle to "members": the Repairs list_rules offers. Writes nothing; returns the change to show and apply.`,
      inputSchema: object(
        {
          action: oneOf(['add', 'remove', 'narrow'], 'What is planned; "add" when left out.'),
          rule: RULE_ID,
          from: text('Of a Dependency: its source Component.'),
          to: text('Of a Dependency: its target Component.'),
          cycle: list('Of a Cycle: its members.'),
          component: text(
            'Of a threshold on a Component: the Component; of propagation cost, the Component the level lies below, "/" for the top level.'
          ),
          file: text('Of a threshold on a function or a class: its Source File.'),
          name: text(
            'Of a threshold on a function or a class: its name in that file, as list_violations gives it.'
          ),
          reason: text('For add: why the Violation is accepted, in a sentence.'),
          justifiedBy: text(
            'For add: the ADR that justifies it, by the directory of its Decision Log and its ID, e.g. "docs/adr/0007-use-kafka".'
          ),
          line: number(
            'For remove and narrow: the line of the Exception, as list_rules gives it, where the same one is written twice.'
          ),
          members: list('For narrow: the members of the Cycle it accepts now.')
        },
        ['rule']
      ),
      annotations: { title: 'Plan an Exception', ...PLAN },
      run: async (input) => {
        const file = readRules(await fs.readText(RULES_PATH))
        const fingerprint = fingerprintFrom(input, file)
        const action = (input.action as string | undefined) ?? 'add'
        if (action === 'add') {
          if (typeof input.reason !== 'string' || input.reason.trim() === '') {
            throw new Refusal('An Exception needs a "reason": why the Violation is accepted.')
          }
          const justifiedBy = typeof input.justifiedBy === 'string' ? input.justifiedBy : undefined
          const decisions = decisionsOf(await context.repository())
          return context.preview(
            await planAddException(
              fs,
              { fingerprint, reason: input.reason, ...(justifiedBy && { justifiedBy }) },
              decisions
            )
          )
        }
        const written =
          typeof input.line === 'number'
            ? file.exceptions.find((exception) => exception.line === input.line)
            : findException(file, fingerprint)
        const line = written?.line ?? (typeof input.line === 'number' ? input.line : undefined)
        if (line === undefined) {
          throw new Refusal(
            conformanceEnglishOf({
              code: 'no-such-exception',
              values: { path: RULES_PATH, fingerprint: fingerprintText(fingerprint) }
            })
          )
        }
        if (action === 'remove') {
          return context.preview(
            await planConformanceRepair(fs, { kind: 'remove-exception', line, fingerprint })
          )
        }
        const members = strings(input.members)
        if (members === undefined || members.length < 2) {
          throw new Refusal('Narrowing an Exception of a Cycle needs the "members" it accepts now.')
        }
        return context.preview(
          await planConformanceRepair(fs, { kind: 'narrow-exception', line, fingerprint, members })
        )
      }
    }
  ]
  return { reads, plans }
}
