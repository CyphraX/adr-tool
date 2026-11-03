/**
 * The tools of the server for the Diagrams of the repository (docs/mcp.md;
 * docs/diagrams-format.md): list them, read one as data — its boxes, its arrows, its Problems,
 * whether its picture is current, and its Drift against the code —, and plan a new one, edits
 * of one, its export and the Repair of an element whose Component is gone. Each plan is a
 * change set, held as every plan is until apply_change writes it; nothing here writes.
 */
import { CONFIG_PATH, KERNEL_SENTENCES, openConfig, sentenceOf } from '@adr-tool/kernel'
import type { WritableFileSystem } from '@adr-tool/core'
import {
  VIEW_LEVELS,
  checkPicture,
  driftOf,
  driftWording,
  exportModelOf,
  openDiagrams,
  planDiagramEdit,
  planExport,
  planNewDiagram,
  planRepair,
  problemsOf,
  readEdits,
  readNewDiagram,
  saidOfDrift,
  suggestConnections,
  svgPathOf,
  wordingOf,
  type Diagram,
  type DiagramProblem,
  type Drift,
  type ExportModel,
  type RepositoryDiagrams,
  type UnreadableDiagram
} from '@adr-tool/diagrams'
import { openStructure } from '@adr-tool/structure'
import { DECLARATION_PATH, everyComponent } from '@adr-tool/structure/model'
import { readCode } from '@adr-tool/cli/code'
import { listRepository } from '@adr-tool/cli/listing'
import { PLAN, READ, object, required, text } from './kit'
import { Refusal, type Tool } from './protocol'
import type { Schema } from './schema'
import type { Hold } from './tools'

export interface DiagramToolsContext {
  readonly root: string
  readonly fs: WritableFileSystem
  /** Hold a plan and show it, as every plan_* tool does. */
  readonly hold: Hold
}

/** How many Source File Dependencies a Drift shows at most: enough to find where it comes from. */
const DEPENDENCIES_SHOWN = 10

const ID = required(
  'The Diagram\'s ID: its file name without ".yml", e.g. "packages", as list_diagrams gives it.'
)
const POINT: Schema = object(
  {
    x: { type: 'number', description: 'From the left, in px; a multiple of 20 keeps the grid.' },
    y: { type: 'number', description: 'From the top, in px.' }
  },
  ['x', 'y']
)
const ELEMENT: Schema = object(
  {
    kind: {
      type: 'string',
      enum: ['component', 'external', 'repository'],
      description:
        'A Component by its Component ID, an External System, or the repository itself (in a system context only).'
    },
    id: required(
      'The Component ID of a Component; for an External System or the repository an ID of lowercase letters, digits and dashes.'
    ),
    name: text('The name in the box of an External System or the repository; the ID without one.'),
    description: text('A sentence below the name, for an External System or the repository.'),
    at: POINT
  },
  ['kind', 'id', 'at']
)
const CONNECTION_FIELDS = {
  from: required('The element ID of the element that uses.'),
  to: required('The element ID of the element that is used.'),
  label: text('A few words on the arrow, such as "reads and writes".')
}

/** The Diagrams' tools, beside the ADRs' (`toolsFor`). */
export function diagramToolsFor({ root, fs, hold }: DiagramToolsContext): Tool[] {
  /** The Diagrams, with the declaration they are read against, and the settings. */
  const open = async () => {
    const config = await openConfig(fs)
    const found = await openDiagrams(fs, config)
    const declared = exportModelOf(await fs.readText(DECLARATION_PATH))
    return { config, found, declared }
  }

  const diagramIn = (found: RepositoryDiagrams, id: unknown): Diagram | UnreadableDiagram => {
    const diagram = found.diagrams.find((one) => one.id === id)
    if (diagram) return diagram
    if (found.directory === undefined) {
      throw new Refusal(
        `No Diagram is looked for: ${CONFIG_PATH} cannot be read, or its key "diagrams" names no directory that can be used.`
      )
    }
    const ids = found.diagrams.map((one) => one.id)
    throw new Refusal(
      `There is no Diagram ${String(id)} in ${found.directory}.${ids.length > 0 ? ` There is: ${ids.join(', ')}.` : ' There is none yet; plan_new_diagram starts one.'}`
    )
  }

  const readable = (diagram: Diagram | UnreadableDiagram): Diagram => {
    if (diagram.readable) return diagram
    throw new Refusal(`${wordingOf(diagram.problems[0])} Fix the file first.`)
  }

  return [
    {
      name: 'list_diagrams',
      title: 'List the Diagrams',
      description:
        'The Diagrams of the repository — hand-arranged pictures of Components, External Systems and their connections, one YAML file each — with their level, how many Problems each has, and whether the SVG picture beside it is current. Read one with read_diagram.',
      inputSchema: object({}),
      annotations: { title: 'List the Diagrams', ...READ },
      run: async () => {
        const { config, found, declared } = await open()
        const diagrams = []
        for (const diagram of found.diagrams) {
          const problems = await problemsWithPicture(fs, diagram, declared)
          diagrams.push({
            id: diagram.id,
            path: diagram.path,
            readable: diagram.readable,
            ...(diagram.readable && {
              ...(diagram.title !== undefined && { title: diagram.title }),
              ...(diagram.level !== undefined && { level: diagram.level }),
              ...(diagram.scope !== undefined && { scope: diagram.scope }),
              elements: diagram.elements.length,
              connections: diagram.connections.length
            }),
            picture: await pictureOf(fs, diagram, problems),
            problems: problems.length
          })
        }
        return {
          directory: found.directory ?? null,
          diagrams,
          problems: [
            ...(config.readable
              ? []
              : [
                  {
                    code: config.problem.kind,
                    message: sentenceOf(KERNEL_SENTENCES, config.problem.said),
                    path: config.problem.path,
                    line: config.problem.line
                  }
                ]),
            ...found.problems.map((problem) => listedProblem(problem))
          ]
        }
      }
    },
    {
      name: 'read_diagram',
      title: 'Read a Diagram',
      description:
        'One Diagram as data: its title, level and scope, its elements with where each box stands, its connections, its Problems with their Repairs, whether its picture is current, and — unless "drift" is false — its Drift against the code: a connection the code does not have, a Dependency between shown Components that the Diagram leaves out. "suggestions" are the connections the code has between the Components it shows, drawn or not. Reading the code takes a moment on a large repository.',
      inputSchema: object(
        {
          id: ID,
          drift: {
            type: 'boolean',
            description: 'Compare the Diagram with the code. True when left out.'
          }
        },
        ['id']
      ),
      annotations: { title: 'Read a Diagram', ...READ },
      run: async (input) => {
        const { found, declared } = await open()
        const diagram = diagramIn(found, input.id)
        const fileText = (await fs.readText(diagram.path)) ?? ''
        const problems = await problemsWithPicture(fs, diagram, declared)
        const head = {
          id: diagram.id,
          path: diagram.path,
          readable: diagram.readable,
          text: fileText,
          picture: await pictureOf(fs, diagram, problems),
          problems: problems.map((problem) => listedProblem(problem, declared))
        }
        if (!diagram.readable) return head
        const names = new Map(
          everyComponent(declared.components).map((component) => [component.id, component.name])
        )
        const body = {
          ...head,
          ...(diagram.title !== undefined && { title: diagram.title }),
          ...(diagram.description !== undefined && { description: diagram.description }),
          level: diagram.level ?? null,
          ...(diagram.scope !== undefined && { scope: diagram.scope }),
          elements: diagram.elements.map((element) => ({
            kind: element.kind,
            id: element.id,
            ...(element.kind === 'component'
              ? { name: names.get(element.id) ?? element.id }
              : {
                  name: element.name,
                  ...(element.description !== undefined && { description: element.description })
                }),
            at: element.at,
            ...(element.size && { size: element.size }),
            line: element.line
          })),
          connections: diagram.connections.map(({ from, to, label, line }) => ({
            from,
            to,
            ...(label !== undefined && { label }),
            line
          }))
        }
        if (input.drift === false) return body
        if (declared.origin !== 'declared') {
          return {
            ...body,
            drift: [],
            suggestions: [],
            note: `${DECLARATION_PATH} declares no Component that can be read, so the Diagram is not compared with the code.`
          }
        }
        const files = await listRepository(root)
        const structure = await openStructure(fs, files)
        const model = await readCode(fs, files, structure)
        return {
          ...body,
          drift: driftOf(diagram, structure, model).map((one) => listedDrift(diagram, one)),
          suggestions: suggestConnections(diagram, structure, model).map(
            ({ from, to, weight, typeOnly, drawn, throughScope }) => ({
              from,
              to,
              weight,
              typeOnly,
              drawn,
              ...(throughScope && { throughScope })
            })
          ),
          ...(model.notAnalysed.length > 0 && {
            note: `${model.notAnalysed.length} Source Files cannot be parsed and have no Dependencies of their own.`
          })
        }
      }
    },
    {
      name: 'plan_new_diagram',
      title: 'Plan a new Diagram',
      description:
        'Plan a new Diagram as <id>.yml where the Diagrams are, written in the style the suite writes. Say where each box stands: x grows to the right and y down, in px on a grid of 20; a box is about 120 to 240 px wide and 48 px high, so leave room between them. Nothing is written until apply_change.',
      inputSchema: object(
        {
          id: required(
            'The ID of the Diagram, its file name: lowercase letters, digits and dashes, e.g. "containers".'
          ),
          title: text('The title above the picture.'),
          description: text('A sentence or two below the title: what the Diagram shows.'),
          level: {
            type: 'string',
            enum: [...VIEW_LEVELS],
            description:
              'system-context: the repository as one box among External Systems; container: the top-level Components; component: the parts of "scope".'
          },
          scope: text('For a component view: the Component it looks into.'),
          elements: { type: 'array', description: 'The boxes, in order.', items: ELEMENT },
          connections: {
            type: 'array',
            description: 'The arrows, from the element that uses to the one it uses.',
            items: object(CONNECTION_FIELDS, ['from', 'to'])
          }
        },
        ['id', 'level', 'elements', 'connections']
      ),
      annotations: { title: 'Plan a new Diagram', ...PLAN },
      run: async (input) => {
        const spec = readNewDiagram(input)
        if (!spec) throw new Refusal('The new Diagram is not one: see the input schema.')
        const { config } = await open()
        const planned = await planNewDiagram(fs, spec, config)
        if (!planned.ok) throw new Refusal(planned.reason)
        return hold(
          planned,
          { diagram: { id: spec.id, path: planned.path } },
          { diagram: { id: spec.id, path: planned.path } }
        )
      }
    },
    {
      name: 'plan_diagram_change',
      title: 'Plan a change of a Diagram',
      description:
        'Plan edits of a Diagram, one after another, as one change of the lines they touch and no other: move-element (id, at), add-element (element), remove-element (id, with its connections), describe-element (id, name, description: of an External System or the repository), add-connection (from, to, label), remove-connection (from, to), relabel-connection (from, to, label). An edit the suite cannot write without rewriting more is refused with the reason. The picture is not drawn again: plan_diagram_export does that.',
      inputSchema: object(
        {
          id: ID,
          edits: {
            type: 'array',
            description: 'The edits, in order.',
            items: {
              type: 'object',
              properties: {
                kind: {
                  type: 'string',
                  enum: [
                    'move-element',
                    'add-element',
                    'remove-element',
                    'describe-element',
                    'add-connection',
                    'remove-connection',
                    'relabel-connection'
                  ]
                },
                id: text('The element ID, for the edits of an element.'),
                at: POINT,
                element: ELEMENT,
                name: text('The name, for describe-element; left out, it goes.'),
                description: text('The description, for describe-element; left out, it goes.'),
                ...CONNECTION_FIELDS
              },
              required: ['kind'],
              additionalProperties: false
            }
          }
        },
        ['id', 'edits']
      ),
      annotations: { title: 'Plan a change of a Diagram', ...PLAN },
      run: async (input) => {
        const edits = readEdits(input.edits)
        if (!edits) {
          throw new Refusal(
            'One of the edits is not one: each has a kind and the fields of its kind, as the description says.'
          )
        }
        const { found } = await open()
        const diagram = readable(diagramIn(found, input.id))
        const planned = await planDiagramEdit(fs, diagram.path, edits)
        if (!planned.ok) throw new Refusal(planned.reason)
        const picture = (await fs.readText(svgPathOf(diagram))) !== undefined
        return hold(
          planned,
          { diagram: { id: diagram.id, path: diagram.path } },
          {
            diagram: { id: diagram.id, path: diagram.path },
            ...(picture &&
              planned.changeSet.files.length > 0 && {
                picture: `${svgPathOf(diagram)} is not current once this is applied: plan_diagram_export draws it again.`
              })
          }
        )
      }
    },
    {
      name: 'plan_diagram_export',
      title: 'Plan the export of a Diagram',
      description:
        'Plan writing the picture of a Diagram as SVG beside its file, <id>.svg, as the window and `adr check` draw it: an ADR embeds it as an image. Empty when the picture is current.',
      inputSchema: object({ id: ID }, ['id']),
      annotations: { title: 'Plan the export of a Diagram', ...PLAN },
      run: async (input) => {
        const { found, declared } = await open()
        const diagram = diagramIn(found, input.id)
        const planned = await planExport(fs, diagram.path, declared)
        if (!planned.ok) throw new Refusal(planned.reason)
        return hold(
          planned,
          { diagram: { id: diagram.id, path: diagram.path } },
          {
            diagram: { id: diagram.id, path: diagram.path },
            picture: planned.svg,
            embed: `![<a sentence that says what the picture shows>](<the path of ${planned.svg}, relative to the ADR>)`
          }
        )
      }
    },
    {
      name: 'plan_diagram_repair',
      title: 'Plan the Repair of a Diagram',
      description:
        'Plan the Repair of an element whose Component is gone (the Problem component-gone): the element and its connections are taken out, by their lines alone. A picture that is not current (stale-picture) is repaired by plan_diagram_export.',
      inputSchema: object({ id: ID, component: required('The Component ID the Problem names.') }, [
        'id',
        'component'
      ]),
      annotations: { title: 'Plan the Repair of a Diagram', ...PLAN },
      run: async (input) => {
        const { found, declared } = await open()
        const diagram = readable(diagramIn(found, input.id))
        const problem = problemsOf(diagram, declared).find(
          (one) => one.kind === 'component-gone' && one.component === input.component
        )
        if (!problem) {
          throw new Refusal(
            `The Diagram ${diagram.id} has no Problem component-gone of ${String(input.component)}: read_diagram lists its Problems.`
          )
        }
        return hold(await planRepair(fs, problem), {
          diagram: { id: diagram.id, path: diagram.path }
        })
      }
    }
  ]
}

/** The Problems of a Diagram — of its file, against the declaration — and of its picture. */
async function problemsWithPicture(
  fs: WritableFileSystem,
  diagram: Diagram | UnreadableDiagram,
  declared: ExportModel
): Promise<DiagramProblem[]> {
  if (!diagram.readable) return [...diagram.problems]
  const stale = await checkPicture(fs, diagram, declared)
  return [...problemsOf(diagram, declared), ...(stale ? [stale] : [])]
}

/** The picture beside a Diagram: where it is, whether it is there, and whether it is current. */
async function pictureOf(
  fs: WritableFileSystem,
  diagram: Diagram | UnreadableDiagram,
  problems: readonly DiagramProblem[]
): Promise<Record<string, unknown>> {
  const path = svgPathOf(diagram)
  const exported = (await fs.readText(path)) !== undefined
  return {
    path,
    exported,
    ...(exported && { current: !problems.some((problem) => problem.kind === 'stale-picture') })
  }
}

/** A Problem as the tools list it: its code, its sentence, its line, and how it is repaired. */
function listedProblem(problem: DiagramProblem, declared?: ExportModel): Record<string, unknown> {
  const repair =
    problem.kind === 'stale-picture'
      ? 'plan_diagram_export'
      : problem.kind === 'component-gone' && declared?.origin === 'declared'
        ? 'plan_diagram_repair'
        : undefined
  return {
    code: problem.kind,
    message: wordingOf(problem),
    path: problem.path,
    line: problem.line,
    ...(problem.kind === 'component-gone' && { component: problem.component }),
    ...(repair && { repair })
  }
}

/** A Drift as read_diagram lists it, at the line of its connection or of the element that uses. */
function listedDrift(diagram: Diagram, drift: Drift): Record<string, unknown> {
  const lineOf = (id: string): number | undefined =>
    diagram.elements.find((element) => element.id === id)?.line
  const line =
    drift.kind === 'connection-not-in-code'
      ? drift.line
      : (lineOf(drift.from) ?? lineOf(drift.to) ?? 1)
  return {
    code: saidOfDrift(drift).code,
    message: driftWording(drift),
    from: drift.from,
    to: drift.to,
    line,
    ...(drift.kind === 'connection-not-in-code'
      ? drift.uncertain && { uncertain: drift.uncertain }
      : {
          weight: drift.weight,
          typeOnly: drift.typeOnly,
          ...(drift.kind === 'scope-dependency-not-in-diagram' && { scope: drift.scope }),
          dependencies: drift.dependencies
            .slice(0, DEPENDENCIES_SHOWN)
            .map(({ from, to, lines }) => ({ from, to, lines }))
        })
  }
}
