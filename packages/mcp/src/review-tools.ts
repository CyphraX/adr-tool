import { lookAtAnnotations, type FoundAnnotation } from '@adr-tool/cli/annotations'
import { gitIn } from '@adr-tool/cli/git'
import { listRepository } from '@adr-tool/cli/listing'
import type { Repository, WritableFileSystem } from '@adr-tool/core'
import type { Plan } from '@adr-tool/kernel'
import {
  ANNOTATION_STATES,
  ANNOTATION_TYPES,
  citedAdr,
  componentOf,
  findAnchor,
  linesText,
  planAnnotation,
  planAttach,
  planCite,
  planReply,
  planState,
  planUncite,
  planUpdateAnchor,
  qualified,
  wordingOf,
  type AdrReference,
  type AnnotationState,
  type AnnotationType,
  type Found,
  type ReviewProblem
} from '@adr-tool/review'
import { openStructure } from '@adr-tool/structure/model'
import { Refusal, type Tool } from './protocol'
import type { Schema } from './schema'

/** What the tools of Review need of the server: the repository, the clock, and the way to hold a plan. */
export interface ReviewContext {
  readonly fs: WritableFileSystem
  readonly root: string
  /** Today's date, `YYYY-MM-DD`, as the person sees it. */
  readonly today: () => string
  readonly now: () => Date
  /** Who writes when the agent names nobody: git's `user.name`. */
  readonly author: () => Promise<string | undefined>
  /** The ADRs of the repository, as a `cites` item names them. */
  readonly adrs: () => Promise<AdrReference[]>
  /** Hold a plan and show it; `outcome` is said with it and when it is applied. */
  readonly hold: (plan: Plan, outcome?: Record<string, unknown>) => Record<string, unknown>
}

/** The ADRs of a repository as a `cites` item names them: by the directory of their log, `.` at the top. */
export const adrReferences = (repository: Repository): AdrReference[] =>
  repository.logs.flatMap((log) =>
    log.adrs.map((adr) => ({ log: log.path === '' ? '.' : log.path, id: adr.id }))
  )

const text = (description: string): Schema => ({ type: 'string', description })
const required = (description: string): Schema => ({ type: 'string', description, minLength: 1 })
const line = (description: string): Schema => ({ type: 'integer', description, minimum: 1 })
const object = (properties: Record<string, Schema>, needed: string[] = []): Schema => ({
  type: 'object',
  properties,
  required: needed,
  additionalProperties: false
})

const ID = required(
  'The Annotation\'s ID: its file name without ".md", e.g. "20261102-why-is-the-total-computed".'
)
const ADR = required(
  'The ADR as "cites" names it: its ID, e.g. "0003-postgres-write-model", where only one Decision Log has it, and "<log>/<ID>" otherwise, e.g. "docs/adr/0003-postgres-write-model".'
)
const AUTHOR = text("Who writes it, as a name. git's user.name when left out.")
const PATH = required(
  'The Source File, relative to the repository root, with "/", e.g. "src/main/java/com/shop/cart/Cart.java".'
)
const START = line('The first line, counted from 1.')
const END = line('The last line, counted from 1 and included; the first one when left out.')
const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
}
const PLAN = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
}

/** What became of an Anchor, as the tools say it. */
type AnchorState = Found['kind'] | 'unreadable'

const anchorStateOf = (annotation: FoundAnnotation): AnchorState =>
  annotation.anchor === undefined ? 'unreadable' : (annotation.found?.kind ?? 'unchanged')

/** The first line of a text that says something, without the marks of Markdown in front of it. */
function firstLine(value: string): string {
  const found = value
    .split(/\r?\n/)
    .map((one) => one.trim())
    .find((one) => one !== '' && !/^(?:```|~~~)/.test(one))
  return (found ?? '').replace(/^(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/, '').trim()
}

/** Where an Annotation's lines are: as its Anchor says, and where they are found now. */
function anchorOf(annotation: FoundAnnotation): Record<string, unknown> | undefined {
  const { anchor, found } = annotation
  if (!anchor) return undefined
  return {
    state: anchorStateOf(annotation),
    path: anchor.path,
    lines: linesText(anchor),
    ...(anchor.commit !== undefined && { commit: anchor.commit }),
    ...(found?.kind === 'moved' && {
      now: {
        path: found.anchor.path,
        lines: linesText(found.anchor),
        similarity: found.similarity,
        ...(found.renamedFrom !== undefined && { renamedFrom: found.renamedFrom })
      }
    }),
    ...(found?.kind === 'orphaned' && { file: found.file })
  }
}

/** An Annotation in a list: what tells it apart, and where it is. */
function summaryOf(annotation: FoundAnnotation): Record<string, unknown> {
  return {
    id: annotation.id,
    path: annotation.path,
    type: annotation.type ?? 'unknown',
    state: annotation.state ?? 'unknown',
    ...(annotation.author !== undefined && { author: annotation.author }),
    ...(annotation.date !== undefined && { date: annotation.date }),
    firstLine: firstLine(annotation.text),
    ...(annotation.anchor !== undefined ? { anchor: anchorOf(annotation) } : {}),
    replies: annotation.replies.length,
    cites: annotation.cites
  }
}

/** A Problem of Review, as the tools list it. */
const problemOf = (problem: ReviewProblem): Record<string, unknown> => ({
  code: problem.kind,
  path: problem.path,
  ...('annotation' in problem && { annotation: problem.annotation }),
  message: wordingOf(problem)
})

/** Where the Source File of an Annotation is now: where it is found, or where its Anchor says. */
const sourceFileOf = (annotation: FoundAnnotation): string | undefined =>
  annotation.found && annotation.found.kind !== 'orphaned'
    ? annotation.found.anchor.path
    : annotation.anchor?.path

/**
 * The tools of Review (docs/mcp.md, "Review"): the Annotations of the repository with their
 * Replies and what became of their Anchors in the code as it is now, and every write — a new
 * Annotation, a Reply, Resolve and Reopen, Update the Anchor, Attach again, Cite and Uncite —
 * as a change set, planned and shown first, written only by `apply_change`.
 */
export function reviewTools(context: ReviewContext): Tool[] {
  const { fs, root } = context
  const git = gitIn(root)

  const look = async (): Promise<Awaited<ReturnType<typeof lookAtAnnotations>>> => {
    const looked = await lookAtAnnotations(fs, git, await context.adrs())
    if (looked.unreadableConfig) {
      throw new Refusal(
        `${looked.unreadableConfig.path} cannot be read, so no Annotation is read or written until it is fixed.`
      )
    }
    return looked
  }

  const annotationIn = (annotations: readonly FoundAnnotation[], id: unknown): FoundAnnotation => {
    const found = annotations.find((annotation) => annotation.id === id)
    if (!found) throw new Refusal(`There is no Annotation ${String(id)}.`)
    return found
  }

  const authorOf = async (input: Record<string, unknown>): Promise<string> => {
    const named = typeof input.author === 'string' ? input.author.trim() : ''
    if (named !== '') return named
    const fromGit = (await context.author())?.trim() ?? ''
    if (fromGit === '') {
      throw new Refusal(
        'git names nobody: user.name is not set. Say who writes it in "author", as the person wants to be named.'
      )
    }
    return fromGit
  }

  const linesOf = (
    input: Record<string, unknown>
  ): { path: string; start: number; end: number } => {
    const start = Number(input.start)
    const end = input.end === undefined ? start : Number(input.end)
    if (end < start) throw new Refusal(`The last line, ${end}, comes before the first, ${start}.`)
    return { path: String(input.path), start, end }
  }

  return [
    {
      name: 'list_annotations',
      title: 'List the Annotations',
      description:
        'The Annotations of the repository: remarks of people on lines of Source Files, kept outside the code (docs/review-format.md). Each with its type, state, author and day, its first line, where its lines are — as its Anchor says, and whether they are found there unchanged, moved, or orphaned in the code as it is now —, how many Replies it has and the ADRs it cites. Newest first. Every filter that is given must hold. Also the Problems of the Annotations, as adr check reports them.',
      inputSchema: object({
        state: { type: 'string', enum: [...ANNOTATION_STATES], description: 'Open or resolved.' },
        type: { type: 'string', enum: [...ANNOTATION_TYPES], description: 'Its type.' },
        anchor: {
          type: 'string',
          enum: ['unchanged', 'moved', 'orphaned'],
          description: 'What became of its lines in the code as it is now.'
        },
        author: text('Who wrote it, as it is written.'),
        path: text('A Source File, or a directory: the Annotations on it, or below it.'),
        component: text(
          'A Component ID from list_components: the Annotations on the Source Files it owns, or a Component inside it owns.'
        ),
        adr: text('An ADR as "cites" names it: the Annotations that cite it.')
      }),
      annotations: { title: 'List the Annotations', ...READ },
      run: async (input) => {
        const looked = await look()
        let annotations = looked.annotations
        if (input.state !== undefined)
          annotations = annotations.filter((one) => one.state === input.state)
        if (input.type !== undefined)
          annotations = annotations.filter((one) => one.type === input.type)
        if (input.anchor !== undefined)
          annotations = annotations.filter((one) => anchorStateOf(one) === input.anchor)
        if (typeof input.author === 'string')
          annotations = annotations.filter((one) => one.author === input.author)
        if (typeof input.path === 'string') {
          const path = input.path.replace(/\/+$/, '')
          annotations = annotations.filter((one) => {
            const file = sourceFileOf(one)
            return file !== undefined && (file === path || file.startsWith(`${path}/`))
          })
        }
        if (typeof input.adr === 'string') {
          const adrs = await context.adrs()
          const wanted = citedAdr(input.adr, adrs).found
          if (!wanted) throw new Refusal(`${input.adr} is no ADR of this repository.`)
          annotations = annotations.filter((one) =>
            one.cites.some((item) => {
              const found = citedAdr(item, adrs).found
              return found?.log === wanted.log && found.id === wanted.id
            })
          )
        }
        if (typeof input.component === 'string') {
          const component = input.component
          const structure = await openStructure(fs, await listRepository(root))
          if (!structure.components.some((one) => one.id === component)) {
            throw new Refusal(`There is no Component ${component}. list_components lists them.`)
          }
          annotations = annotations.filter((one) => {
            const owner = componentOf(one, structure, one.found)
            return owner === component || (owner?.startsWith(`${component}/`) ?? false)
          })
        }
        return {
          directory: looked.directory ?? null,
          annotations: [...annotations]
            .sort(
              (a, b) =>
                (b.date ?? '').localeCompare(a.date ?? '') ||
                (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
            )
            .map(summaryOf),
          problems: looked.problems.map(problemOf)
        }
      }
    },
    {
      name: 'read_annotation',
      title: 'Read an Annotation',
      description:
        'One Annotation with everything it holds: its text (Markdown), its quoted lines, its Replies in the order they were written, the ADRs it cites and which ADR each one names, where its lines are in the code as it is now, and its Problems.',
      inputSchema: object({ id: ID }, ['id']),
      annotations: { title: 'Read an Annotation', ...READ },
      run: async (input) => {
        const looked = await look()
        const annotation = annotationIn(looked.annotations, input.id)
        const adrs = await context.adrs()
        return {
          ...summaryOf(annotation),
          ...(annotation.anchor && { quote: annotation.anchor.quote }),
          text: annotation.text,
          replies: annotation.replies.map((reply) => ({
            path: reply.path,
            ...(reply.author !== undefined && { author: reply.author }),
            ...(reply.date !== undefined && { date: reply.date }),
            text: reply.text
          })),
          cited: annotation.cites.map((item) => {
            const found = citedAdr(item, adrs).found
            return { item, adr: found ? qualified(found) : null }
          }),
          writable: annotation.writable,
          problems: looked.problems
            .filter((problem) => 'annotation' in problem && problem.annotation === annotation.id)
            .map(problemOf)
        }
      }
    },
    {
      name: 'plan_annotation',
      title: 'Plan a new Annotation',
      description:
        "Plan a new Annotation on lines of a Source File: a note, a question or a concern. The tool reads the lines from the disk, quotes them, and records HEAD's commit; the ID is the day and the first words of the text. Writes nothing; returns the change to show and apply.",
      inputSchema: object(
        {
          path: PATH,
          start: START,
          end: END,
          type: {
            type: 'string',
            enum: [...ANNOTATION_TYPES],
            description: 'What it is: a note, a question or a concern.'
          },
          text: required('What the person says about the lines, in Markdown.'),
          author: AUTHOR,
          cites: {
            type: 'array',
            description:
              'ADRs the lines are about, each as "cites" names it: a Trace. None when left out.',
            items: { type: 'string' }
          }
        },
        ['path', 'start', 'type', 'text']
      ),
      annotations: { title: 'Plan a new Annotation', ...PLAN },
      run: async (input) => {
        const plan = await planAnnotation(
          fs,
          git,
          {
            type: input.type as AnnotationType,
            author: await authorOf(input),
            date: context.today(),
            lines: linesOf(input),
            text: String(input.text),
            cites: Array.isArray(input.cites) ? input.cites.map(String) : []
          },
          await context.adrs()
        )
        return context.hold(plan, plan.ok ? { annotation: { id: plan.id } } : undefined)
      }
    },
    {
      name: 'plan_reply',
      title: 'Plan a Reply',
      description:
        'Plan a Reply under an Annotation: a file of its own beside it, named by the moment and the author, so that Replies written at the same time on two branches meet without a conflict. Writes nothing; returns the change to show and apply.',
      inputSchema: object({ id: ID, text: required('The Reply, in Markdown.'), author: AUTHOR }, [
        'id',
        'text'
      ]),
      annotations: { title: 'Plan a Reply', ...PLAN },
      run: async (input) => {
        const now = context.now()
        return context.hold(
          await planReply(fs, String(input.id), {
            author: await authorOf(input),
            date: context.today(),
            time: now.toISOString(),
            text: String(input.text)
          })
        )
      }
    },
    {
      name: 'plan_annotation_state',
      title: 'Plan to resolve or reopen an Annotation',
      description:
        'Plan to Resolve an Annotation, or to Reopen it. Nothing is deleted: a resolved Annotation stays where it is, with its Replies. Writes nothing; returns the change to show and apply.',
      inputSchema: object(
        {
          id: ID,
          state: {
            type: 'string',
            enum: [...ANNOTATION_STATES],
            description: '"resolved" to Resolve it, "open" to Reopen it.'
          }
        },
        ['id', 'state']
      ),
      annotations: { title: 'Plan to resolve or reopen an Annotation', ...PLAN },
      run: async (input) =>
        context.hold(await planState(fs, String(input.id), input.state as AnnotationState))
    },
    {
      name: 'plan_update_anchor',
      title: 'Plan to update an Anchor',
      description:
        "Plan Update the Anchor of a moved Annotation: write the lines it is found at now, quoted as they are, and HEAD's commit, into its Anchor. Refused for one that is where its Anchor says, or orphaned. Writes nothing; returns the change to show and apply.",
      inputSchema: object({ id: ID }, ['id']),
      annotations: { title: 'Plan to update an Anchor', ...PLAN },
      run: async (input) => {
        const looked = await look()
        const annotation = annotationIn(looked.annotations, input.id)
        const found: Found = annotation.anchor
          ? await findAnchor(annotation.anchor, { fs, git }, annotation.date)
          : { kind: 'orphaned', file: 'gone' }
        return context.hold(await planUpdateAnchor(fs, annotation.id, found))
      }
    },
    {
      name: 'plan_attach',
      title: 'Plan to attach an Annotation again',
      description:
        'Plan Attach again: give an Annotation a new Anchor on the lines it is about now — what is done for an orphaned one, or one found in the wrong place. The lines are read from the disk and quoted. Writes nothing; returns the change to show and apply.',
      inputSchema: object({ id: ID, path: PATH, start: START, end: END }, ['id', 'path', 'start']),
      annotations: { title: 'Plan to attach an Annotation again', ...PLAN },
      run: async (input) =>
        context.hold(await planAttach(fs, git, String(input.id), linesOf(input)))
    },
    {
      name: 'plan_cite',
      title: 'Plan to cite an ADR',
      description:
        'Plan to Cite an ADR in an Annotation: the item is added to its "cites", a Trace. Which Annotations cite an ADR is computed, never written into the ADR. Writes nothing; returns the change to show and apply.',
      inputSchema: object({ id: ID, adr: ADR }, ['id', 'adr']),
      annotations: { title: 'Plan to cite an ADR', ...PLAN },
      run: async (input) =>
        context.hold(await planCite(fs, String(input.id), String(input.adr), await context.adrs()))
    },
    {
      name: 'plan_uncite',
      title: 'Plan to uncite an ADR',
      description:
        'Plan to Uncite an ADR in an Annotation: the item is taken out of its "cites" where it stands — also the Repair of a Trace to an ADR that is not there. Writes nothing; returns the change to show and apply.',
      inputSchema: object({ id: ID, adr: ADR }, ['id', 'adr']),
      annotations: { title: 'Plan to uncite an ADR', ...PLAN },
      run: async (input) => context.hold(await planUncite(fs, String(input.id), String(input.adr)))
    }
  ]
}
