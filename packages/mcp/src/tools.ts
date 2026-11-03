import { createHash, randomUUID } from 'node:crypto'
import { createTwoFilesPatch } from 'diff'
import {
  DEFAULT_LOG_PATHS,
  RELATION_TYPES,
  firstLog,
  normalizePath,
  STATUSES,
  applyChangeSet,
  describeConsequences,
  describeProblem,
  groupProblems,
  listTemplates,
  openRepository,
  parseReference,
  planAccept,
  planCreate,
  planDeprecate,
  planEditBody,
  planEditMetadata,
  planMigration,
  planReject,
  planRepair,
  repairsOf,
  type Adr,
  type ChangeSet,
  type DecisionLog,
  type FileChange,
  type Plan,
  type Problem,
  type RelationType,
  type Repair,
  type Repository,
  type WritableFileSystem
} from '@adr-tool/core'
import { DECLARATION_PATH, everyComponent, readDeclaration } from '@adr-tool/structure/model'
import { gitIn } from '@adr-tool/cli/git'
import { architectureTools } from './architecture'
import { repositoryFiles } from './files'
import { PLAN, READ, Refusal, type Tool } from './protocol'
import { list, object, required, text } from './schema'

/** How many planned changes wait at most; the oldest is forgotten first. */
const MAX_PLANNED = 50

export interface ToolOptions {
  /** The repository the tools work on: the directory the server was started for. */
  readonly root: string
  /** Today's date, `YYYY-MM-DD`, as the person sees it. */
  readonly today?: () => string
  /** Who a Correction is recorded for when the agent names nobody: git's `user.name`. */
  readonly author?: () => Promise<string | undefined>
}

interface Planned {
  readonly changeSet: ChangeSet
  readonly created?: { readonly id: string; readonly path: string }
  readonly renamed?: { readonly from: string; readonly to: string }
  /** The Decision Log of a plan of an ADR. */
  readonly log?: string
}

const LOG = text(
  'The directory of the Decision Log, e.g. "docs/adr"; "." for a log at the top of the repository. Can be left out when the repository has one log, or when the ID is found in one log only.'
)

/** How a log is named to the agent: its directory, `.` for the top of the repository. */
const shown = (path: string): string => (path === '' ? '.' : path)

/** What identifies the body of an ADR as it was read: an edit of it starts from that. */
const revisionOf = (body: string): string =>
  createHash('sha256').update(body, 'utf8').digest('hex').slice(0, 16)
const ID = required(
  'The ADR\'s ID: its file name without ".md", e.g. "0007-use-kafka". "<log>/<ID>" names an ADR of another log.'
)

/**
 * The tools of the server (docs/mcp.md): reading the Decision Logs, their ADRs and Problems,
 * the Structure, the Rules and their Violations, and every write as a change set — planned and
 * shown first, written only by `apply_change`.
 * Each call reads the repository afresh, as the app does before it plans.
 */
export function toolsFor(options: ToolOptions): Tool[] {
  const fs: WritableFileSystem = repositoryFiles(options.root)
  const today = options.today ?? localDate
  // git's `user.name`, read through the one module that runs git (ADR-0020).
  const author = options.author ?? (() => gitIn(options.root).userName())
  const planned = new Map<string, Planned>()

  const open = async (): Promise<{ repository: Repository; components: string[] | undefined }> => {
    const declaration = readDeclaration(await fs.readText(DECLARATION_PATH))
    const components =
      declaration.kind === 'declared'
        ? everyComponent(declaration.components).map((component) => component.id)
        : undefined
    const repository = await openRepository(fs, components ? { components } : {})
    return { repository, components }
  }

  /** Where the first ADR goes, in a repository without a Decision Log. */
  const first = async (): Promise<DecisionLog> => {
    const found = await firstLog(fs)
    if ('reason' in found) throw new Refusal(found.reason)
    return found.log
  }

  /** The log a call means: named, implied by a qualified ID, the only one, or the one with the ID. */
  const logFor = async (
    repository: Repository,
    input: Record<string, unknown>,
    purpose: 'adr' | 'log' | 'create'
  ): Promise<{ log: DecisionLog; id: string | undefined }> => {
    const logs = repository.logs
    let path: string | undefined
    if (typeof input.log === 'string') {
      path = normalizePath(input.log)
      if (path === undefined) throw new Refusal(`${input.log} is no directory of the repository.`)
    }
    let id = typeof input.id === 'string' ? input.id : undefined
    if (id !== undefined && id.includes('/')) {
      const reference = parseReference(id)
      if (path !== undefined && path !== reference.log) {
        throw new Refusal(
          `${id} names an ADR of ${shown(reference.log ?? '')}, not of ${shown(path)}.`
        )
      }
      path = reference.log
      id = reference.id
    }
    const paths = logs.map((log) => shown(log.path)).join(', ')
    if (path !== undefined) {
      const log = logs.find((candidate) => candidate.path === path)
      if (log) return { log, id }
      if (purpose === 'create' && logs.length === 0) {
        const log = await first()
        if (log.path === path) return { log, id }
      }
      throw new Refusal(
        logs.length === 0
          ? `There is no Decision Log at ${shown(path)}: the repository has none yet.`
          : `There is no Decision Log at ${shown(path)}. The repository has: ${paths}.`
      )
    }
    if (logs.length === 0) {
      if (purpose === 'create') return { log: await first(), id }
      throw new Refusal(
        `The repository has no Decision Log yet: none is configured in .adr/config.yml or .adr-dir, and none of ${DEFAULT_LOG_PATHS.join(', ')} exists. plan_create_adr starts the first one.`
      )
    }
    if (logs.length === 1) return { log: logs[0]!, id }
    if (purpose === 'adr' && id !== undefined) {
      const holding = logs.filter((log) => log.adrs.some((adr) => adr.id === id))
      if (holding.length === 1) return { log: holding[0]!, id }
      if (holding.length === 0) throw new Refusal(`No Decision Log has an ADR ${id}.`)
    }
    throw new Refusal(`The repository has several Decision Logs: ${paths}. Say which one in "log".`)
  }

  const adrIn = (log: DecisionLog, id: string | undefined): Adr => {
    const adr = log.adrs.find((candidate) => candidate.id === id)
    if (!adr) throw new Refusal(`There is no ADR ${id ?? ''} in ${shown(log.path)}.`)
    return adr
  }

  /**
   * Hold a plan, and show it: what each file becomes, as a diff, and what to look out for.
   * `log` is the Decision Log of a plan of an ADR.
   */
  const preview = (log: DecisionLog | undefined, plan: Plan): Record<string, unknown> => {
    if (!plan.ok) throw new Refusal(plan.reason)
    const changeId = randomUUID()
    planned.set(changeId, {
      changeSet: plan.changeSet,
      ...(log && { log: log.path }),
      ...(plan.created && { created: plan.created }),
      ...(plan.renamed && { renamed: plan.renamed })
    })
    while (planned.size > MAX_PLANNED) planned.delete(planned.keys().next().value!)
    return {
      changeId,
      files: plan.changeSet.files.map(fileOf),
      warnings: plan.warnings ?? [],
      ...(plan.created && { created: { log: shown(log?.path ?? ''), ...plan.created } }),
      ...(plan.renamed && { renamed: plan.renamed }),
      next: 'Nothing is written yet. Show the person the files and the warnings; apply_change with this changeId writes them, discard_change drops them.'
    }
  }

  const architecture = architectureTools({
    root: options.root,
    fs,
    repository: async () => (await open()).repository,
    preview: (plan) => preview(undefined, plan)
  })

  return [
    {
      name: 'list_decision_logs',
      title: 'List the Decision Logs',
      description:
        'The Decision Logs of the repository — the directories its ADRs are in — with how many ADRs and Problems each has, and the Problems of the repository as a whole, such as configuration that cannot be used.',
      inputSchema: object({}),
      annotations: { title: 'List the Decision Logs', ...READ },
      run: async () => {
        const { repository } = await open()
        return {
          root: options.root,
          discoveredBy: repository.discoveredBy,
          logs: repository.logs.map((log) => ({
            path: shown(log.path),
            naming: log.naming,
            adrs: log.adrs.length,
            problems: groupProblems(log).length
          })),
          problems: repository.problems.map((problem) => ({
            code: problem.kind,
            message: describeProblem(problem)
          }))
        }
      }
    },
    {
      name: 'list_adrs',
      title: 'List ADRs',
      description:
        'The ADRs of a Decision Log, oldest first, with number, title, Status and dates. Leave out "log" to list every log.',
      inputSchema: object({
        log: LOG,
        status: {
          type: 'string',
          enum: [...STATUSES, 'unknown'],
          description:
            'Only the ADRs with this Status; "unknown" for those whose Status cannot be read.'
        }
      }),
      annotations: { title: 'List ADRs', ...READ },
      run: async (input) => {
        const { repository } = await open()
        const logs =
          input.log === undefined ? repository.logs : [(await logFor(repository, input, 'log')).log]
        const adrs = logs.flatMap((log) =>
          log.adrs
            .filter(
              (adr) =>
                input.status === undefined || (adr.metadata.status ?? 'unknown') === input.status
            )
            .map((adr) => summaryOf(log, adr))
        )
        return { adrs }
      }
    },
    {
      name: 'read_adr',
      title: 'Read an ADR',
      description:
        'One ADR: its Metadata, its Relations with their state, its Problems, and its body as Markdown with its revision, which plan_edit_body takes.',
      inputSchema: object({ id: ID, log: LOG }, ['id']),
      annotations: { title: 'Read an ADR', ...READ },
      run: async (input) => {
        const { repository } = await open()
        const { log, id } = await logFor(repository, input, 'adr')
        const adr = adrIn(log, id)
        const { metadata } = adr
        return {
          ...summaryOf(log, adr),
          decisionMakers: metadata.decisionMakers,
          relations: metadata.relations,
          backReferences: metadata.backReferences,
          affects: metadata.affects,
          corrections: metadata.corrections,
          ...(adr.foreign && { foreign: adr.foreign }),
          ...(adr.noMigration && { noMigration: `${adr.id} ${adr.noMigration}` }),
          relationsInLog: log.relations
            .filter((relation) => relation.from === adr.id || relation.to === adr.id)
            .map(({ type, from, to, state }) => ({ type, from, to, state })),
          problems: problemsOf(log).filter(
            (group) => group.adr === adr.id || group.consequences.some((one) => one.adr === adr.id)
          ),
          body: adr.body,
          revision: revisionOf(adr.body)
        }
      }
    },
    {
      name: 'search_adrs',
      title: 'Search ADRs',
      description:
        'The ADRs of every Decision Log whose ID, title, tags or text contain all the words of the query, case and accents aside; the best matches first, with the line that matched.',
      inputSchema: object({ query: required('The words to look for.') }, ['query']),
      annotations: { title: 'Search ADRs', ...READ },
      run: async (input) => {
        const { repository } = await open()
        return { adrs: search(repository, String(input.query)) }
      }
    },
    {
      name: 'list_problems',
      title: 'List the Problems',
      description:
        'What is wrong in a Decision Log, as `adr lint` reports it: each root cause with what only follows from it, and the Repairs the tool offers for it. A Repair is planned with plan_repair. Leave out "log" for every log.',
      inputSchema: object({ log: LOG }),
      annotations: { title: 'List the Problems', ...READ },
      run: async (input) => {
        const { repository } = await open()
        const logs =
          input.log === undefined ? repository.logs : [(await logFor(repository, input, 'log')).log]
        return {
          problems: logs.flatMap((log) =>
            problemsOf(log).map((group) => ({ log: shown(log.path), ...group }))
          ),
          repository: repository.problems.map((problem) => ({
            code: problem.kind,
            message: describeProblem(problem)
          }))
        }
      }
    },
    {
      name: 'list_templates',
      title: 'List the Templates',
      description:
        "The Templates a new ADR can be created from: the repository's own under .adr/templates, then the built-in ones, and which one is used when none is named.",
      inputSchema: object({}),
      annotations: { title: 'List the Templates', ...READ },
      run: async () => {
        const { templates, defaultName } = await listTemplates(fs)
        return { templates: [...templates], default: defaultName }
      }
    },
    {
      name: 'list_components',
      title: 'List the Components',
      description:
        'The Components the repository declares in .arch/components.yml: what an ADR can name in "affects".',
      inputSchema: object({}),
      annotations: { title: 'List the Components', ...READ },
      run: async () => {
        const declaration = readDeclaration(await fs.readText(DECLARATION_PATH))
        if (declaration.kind !== 'declared') {
          return {
            components: [],
            note:
              declaration.kind === 'absent'
                ? `${DECLARATION_PATH} declares no Component.`
                : `${DECLARATION_PATH} cannot be read: ${declaration.detail}`
          }
        }
        return {
          components: everyComponent(declaration.components).map((component) => ({
            id: component.id,
            name: component.name,
            ...(component.description !== undefined && { description: component.description })
          }))
        }
      }
    },
    ...architecture.reads,
    {
      name: 'plan_create_adr',
      title: 'Plan a new ADR',
      description:
        'Plan a new ADR, proposed, from a Template: the tool gives it the next number and writes its Metadata. In a repository without a Decision Log it starts one in docs/adr. Writes nothing; returns the change to show and apply.',
      inputSchema: object(
        {
          title: required('The title of the decision, e.g. "Use Kafka for order events".'),
          log: LOG,
          template: text(
            'The name of a Template from list_templates; the default one when left out.'
          ),
          supersedes: text('The ID of an accepted or deprecated ADR the new one is to supersede.'),
          amends: text('The ID of an accepted ADR the new one is to amend.')
        },
        ['title']
      ),
      annotations: { title: 'Plan a new ADR', ...PLAN },
      run: async (input) => {
        if (input.supersedes !== undefined && input.amends !== undefined) {
          throw new Refusal('A new ADR either supersedes or amends another one, not both.')
        }
        const { repository } = await open()
        const { log } = await logFor(repository, input, 'create')
        const template =
          typeof input.template === 'string' && input.template !== ''
            ? input.template
            : (await listTemplates(fs)).defaultName
        const target = input.supersedes ?? input.amends
        const relation =
          typeof target === 'string'
            ? {
                type:
                  input.supersedes !== undefined ? ('supersedes' as const) : ('amends' as const),
                target
              }
            : undefined
        return preview(
          log,
          await planCreate(fs, log, {
            title: String(input.title).trim(),
            template,
            today: today(),
            ...(relation && { relation })
          })
        )
      }
    },
    {
      name: 'plan_decision',
      title: 'Plan a decision',
      description:
        'Plan to accept or reject a proposed ADR, or to deprecate an accepted one. Accepting writes the Back-references into the ADRs it supersedes or amends and marks what it supersedes as superseded. Writes nothing; returns the change to show and apply.',
      inputSchema: object(
        {
          id: ID,
          decision: {
            type: 'string',
            enum: ['accept', 'reject', 'deprecate'],
            description: 'What is decided.'
          },
          log: LOG
        },
        ['id', 'decision']
      ),
      annotations: { title: 'Plan a decision', ...PLAN },
      run: async (input) => {
        const { repository } = await open()
        const { log, id } = await logFor(repository, input, 'adr')
        const adr = adrIn(log, id)
        const when = { today: today() }
        const plan =
          input.decision === 'accept'
            ? await planAccept(fs, log, adr.id, when)
            : input.decision === 'reject'
              ? await planReject(fs, log, adr.id, when)
              : await planDeprecate(fs, log, adr.id)
        return preview(log, plan)
      }
    },
    {
      name: 'plan_edit_body',
      title: 'Plan an edit of the text',
      description:
        'Plan to replace the body of an ADR — the Markdown after the frontmatter — with a new one. Only the lines that differ are written. Once an ADR is no longer proposed, the edit is a Correction: a "note" says what was corrected, and it is recorded with the author. Writes nothing; returns the change to show and apply.',
      inputSchema: object(
        {
          id: ID,
          body: {
            type: 'string',
            description: 'The whole new body, as read_adr returns it, changed.'
          },
          revision: required(
            'The revision read_adr returned with the body the edit starts from. When the body changed since, the edit is refused: read it again.'
          ),
          log: LOG,
          note: text('What was corrected, for an ADR that is no longer proposed.'),
          author: text("Who corrects; git's user.name when left out.")
        },
        ['id', 'body', 'revision']
      ),
      annotations: { title: 'Plan an edit of the text', ...PLAN },
      run: async (input) => {
        const { repository } = await open()
        const { log, id } = await logFor(repository, input, 'adr')
        const adr = adrIn(log, id)
        // What a person changed since the agent read it is not to be written over.
        if (revisionOf(adr.body) !== input.revision) {
          throw new Refusal(
            `The body of ${adr.id} changed since it was read, or the revision is not one read_adr returned. Read it again and edit what it says now.`
          )
        }
        const who =
          typeof input.author === 'string' && input.author.trim() !== ''
            ? input.author.trim()
            : await author()
        return preview(
          log,
          await planEditBody(fs, log, adr.id, {
            base: adr.body,
            body: String(input.body),
            today: today(),
            note: typeof input.note === 'string' ? input.note.trim() : '',
            ...(who !== undefined && { author: who })
          })
        )
      }
    },
    {
      name: 'plan_edit_metadata',
      title: 'Plan an edit of the Metadata',
      description:
        "Plan to change the lists of an ADR's Metadata a person maintains: decision-makers, tags, Relations and the Components it affects. Each list given is the list as it should be; a list left out stays as it is. supersedes and amends change only while the ADR is proposed. Writes nothing; returns the change to show and apply.",
      inputSchema: object(
        {
          id: ID,
          log: LOG,
          decisionMakers: list('Who decides.'),
          tags: list('The tags.'),
          relations: object(
            Object.fromEntries(
              RELATION_TYPES.map((type) => [
                type,
                list(`The IDs this ADR ${type.replace('-', ' ')}.`)
              ])
            )
          ),
          affects: list('The IDs of the Components the decision affects, from list_components.')
        },
        ['id']
      ),
      annotations: { title: 'Plan an edit of the Metadata', ...PLAN },
      run: async (input) => {
        const { repository, components } = await open()
        const { log, id } = await logFor(repository, input, 'adr')
        const adr = adrIn(log, id)
        const relations = input.relations as Partial<Record<RelationType, string[]>> | undefined
        return preview(
          log,
          await planEditMetadata(
            fs,
            log,
            adr.id,
            {
              ...(input.decisionMakers !== undefined && {
                decisionMakers: input.decisionMakers as string[]
              }),
              ...(input.tags !== undefined && { tags: input.tags as string[] }),
              ...(relations !== undefined && { relations }),
              ...(input.affects !== undefined && { affects: input.affects as string[] })
            },
            components
          )
        )
      }
    },
    {
      name: 'plan_repair',
      title: 'Plan a Repair',
      description:
        'Plan one of the Repairs list_problems offers for a Problem, passed as it was listed. Writes nothing; returns the change to show and apply.',
      inputSchema: object(
        {
          repair: {
            type: 'object',
            description: 'A Repair exactly as list_problems lists it.',
            properties: {
              kind: {
                type: 'string',
                enum: [
                  'lowercase-status',
                  'remove-item',
                  'add-back-reference',
                  'set-status',
                  'renumber'
                ]
              },
              adr: { type: 'string' },
              key: { type: 'string' },
              item: { type: 'string' },
              status: { type: 'string', enum: ['superseded', 'accepted'] }
            },
            required: ['kind', 'adr'],
            additionalProperties: false
          },
          log: LOG
        },
        ['repair']
      ),
      annotations: { title: 'Plan a Repair', ...PLAN },
      run: async (input) => {
        const { repository } = await open()
        const repair = input.repair as Repair
        const { log } = await logFor(repository, { ...input, id: repair.adr }, 'adr')
        return preview(log, await planRepair(fs, log, repair))
      }
    },
    {
      name: 'plan_migration',
      title: 'Plan a Migration',
      description:
        'Plan to convert ADRs written in a foreign format — MADR, log4brains, adr-tools — into the tool\'s own: one ADR, or every foreign ADR of the log when "id" is left out. Writes nothing; returns the change to show and apply.',
      inputSchema: object({
        log: LOG,
        id: text('The ADR to migrate; every foreign one when left out.')
      }),
      annotations: { title: 'Plan a Migration', ...PLAN },
      run: async (input) => {
        const { repository } = await open()
        const { log, id } = await logFor(repository, input, input.id === undefined ? 'log' : 'adr')
        return preview(log, await planMigration(fs, log, id))
      }
    },
    ...architecture.plans,
    {
      name: 'apply_change',
      title: 'Apply a planned change',
      description:
        'Write a change a plan_* tool returned, after the person has seen it. Nothing is written when a file it touches changed on disk since it was planned: plan it again then.',
      inputSchema: object({ changeId: required('The changeId a plan_* tool returned.') }, [
        'changeId'
      ]),
      annotations: {
        title: 'Apply a planned change',
        readOnlyHint: false,
        // It overwrites and renames files: what a client asks a person about.
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      },
      run: async (input) => {
        const changeId = String(input.changeId)
        const held = planned.get(changeId)
        if (!held) {
          throw new Refusal(
            'There is no planned change with this changeId: it was applied or discarded already, or the server was restarted. Plan it again.'
          )
        }
        // Held until it is written or refused. A change the disk refused stays held: nothing
        // of it is written, and it can be applied again once the disk lets it.
        const result = await applyChangeSet(fs, held.changeSet)
        if (result.applied || 'conflicts' in result) planned.delete(changeId)
        if (!result.applied && 'conflicts' in result) {
          throw new Refusal(
            `Nothing was written: ${result.conflicts.join(', ')} changed on disk after the change was planned. Plan it again to see the change against the current files.`
          )
        }
        // What the file system said, as a sentence of its own.
        const said = (failed: string): string => (/[.!?]$/.test(failed) ? failed : `${failed}.`)
        if (!result.applied && result.stranded.length === 0) {
          throw new Refusal(
            `Nothing was written. ${said(result.failed)} Every file is as it was before; apply_change with this changeId tries again.`
          )
        }
        if (!result.applied) {
          const files = result.stranded.map(({ path, textAt }) =>
            textAt === undefined
              ? `${path}, which is new`
              : `${path}, whose text is now in ${textAt}`
          )
          throw new Refusal(
            `The change is written in part. ${said(result.failed)} Undoing it failed as well, and these files are not as they were: ${files.join('; ')}. Put them back by hand before planning it again.`
          )
        }
        return {
          applied: true,
          files: held.changeSet.files.map((file) => file.renameTo ?? file.path),
          ...(held.created && { created: { log: shown(held.log ?? ''), ...held.created } }),
          ...(held.renamed && { renamed: held.renamed })
        }
      }
    },
    {
      name: 'discard_change',
      title: 'Discard a planned change',
      description: 'Drop a change a plan_* tool returned, without writing it.',
      inputSchema: object({ changeId: required('The changeId a plan_* tool returned.') }, [
        'changeId'
      ]),
      annotations: { title: 'Discard a planned change', ...READ },
      run: async (input) => ({ discarded: planned.delete(String(input.changeId)) })
    }
  ]
}

/** An ADR in a list: what tells it apart. */
function summaryOf(log: DecisionLog, adr: Adr): Record<string, unknown> {
  const { metadata } = adr
  return {
    log: shown(log.path),
    id: adr.id,
    path: adr.path,
    ...(adr.number !== undefined && { number: adr.number }),
    ...(adr.title !== undefined && { title: adr.title }),
    status: metadata.status ?? metadata.rawStatus ?? 'unknown',
    ...(metadata.created !== undefined && { created: metadata.created }),
    ...(metadata.decided !== undefined && { decided: metadata.decided }),
    tags: metadata.tags
  }
}

interface ListedProblem {
  readonly code: string
  readonly adr?: string
  readonly message: string
}

/** The Problems of a log: each root cause, what only follows from it, and its Repairs. */
function problemsOf(log: DecisionLog): (ListedProblem & {
  readonly consequences: readonly ListedProblem[]
  readonly lead?: string
  readonly repairs: readonly Repair[]
})[] {
  const listed = (problem: Problem): ListedProblem => ({
    code: problem.kind,
    ...('adr' in problem && { adr: problem.adr }),
    message: describeProblem(problem)
  })
  return groupProblems(log).map(({ problem, consequences }) => ({
    ...listed(problem),
    ...(consequences.length > 0 && { lead: describeConsequences(problem) }),
    consequences: consequences.map(listed),
    repairs: repairsOf(log, problem)
  }))
}

/** Lowercase, without accents, `ß` as `ss`: how a query and a text are compared. */
const fold = (value: string): string =>
  value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replaceAll('ß', 'ss')

const MAX_RESULTS = 20

function search(repository: Repository, query: string): Record<string, unknown>[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const found: { score: number; result: Record<string, unknown> }[] = []
  for (const log of repository.logs) {
    for (const adr of log.adrs) {
      const head = fold([adr.id, adr.title ?? '', ...adr.metadata.tags].join(' '))
      const body = fold(adr.body)
      if (!words.every((word) => head.includes(word) || body.includes(word))) continue
      const score = words.reduce(
        (sum, word) => sum + (head.includes(word) ? 10 : 0) + body.split(word).length - 1,
        0
      )
      const line = adr.body.split(/\r?\n/).find((one) => fold(one).includes(words[0]!))
      found.push({
        score,
        result: {
          ...summaryOf(log, adr),
          ...(line !== undefined && { line: line.trim().slice(0, 200) })
        }
      })
    }
  }
  return found
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map(({ result }) => result)
}

/** A file of a planned change: where it is, where it goes, and the change as a unified diff. */
function fileOf(file: FileChange): Record<string, unknown> {
  const to = file.renameTo ?? file.path
  // A rename says so, as git does: without it, a rename that changes no line shows nothing.
  const rename =
    file.renameTo === undefined ? '' : `rename from ${file.path}\nrename to ${file.renameTo}\n`
  return {
    path: file.path,
    ...(file.renameTo !== undefined && { renameTo: file.renameTo }),
    ...(file.creates && { creates: true }),
    diff:
      rename +
      createTwoFilesPatch(
        file.creates ? '/dev/null' : `a/${file.path}`,
        `b/${to}`,
        file.before,
        file.after,
        undefined,
        undefined,
        { context: 3 }
      ).replace(/^=+\n/, '')
  }
}

/** Today's date as the person sees it on their calendar, not in UTC. */
function localDate(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
