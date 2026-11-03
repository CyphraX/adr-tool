/**
 * A new Diagram (docs/diagrams-format.md, section 2): its file written whole, in the style the
 * suite writes, as a change set that creates it where the Diagrams are. Whoever starts it says
 * where each box stands: the window places the Components of a level as Structure lays them out.
 */
import {
  CONFIG_PATH,
  joinPath,
  plan,
  type Config,
  type FileSystem,
  type Plan
} from '@adr-tool/kernel'
import { isSegment } from '@adr-tool/structure/model'
import type { ViewLevel } from './diagram'
import { editDiagramText, yamlText, type NewConnection, type NewElement } from './edit'
import { locateDiagrams } from './location'
import { refuse } from './sentences'

/** A Diagram as it is started: its ID, its words, its level, its boxes and its arrows. */
export interface NewDiagram {
  /** The file name without `.yml`: a segment, as an element ID is one. */
  readonly id: string
  readonly title?: string
  readonly description?: string
  readonly level: ViewLevel
  /** The Component a component view looks into; not written at the other levels. */
  readonly scope?: string
  readonly elements: readonly NewElement[]
  readonly connections: readonly NewConnection[]
}

const asText = (text: string): string => text

/**
 * The text of a new Diagram: the keys at the top in their order, then each element and each
 * connection as the editor adds them. Refused where the Diagram would not be one: an ID that is
 * no segment, a component view without its scope, an element shown twice, a connection to
 * nothing or of an element to itself.
 */
export function newDiagramText(spec: NewDiagram, path = `${spec.id}.yml`): string {
  if (!isSegment(spec.id)) refuse({ code: 'invalid-diagram-id', values: { id: spec.id } })
  if (spec.level === 'component' && (spec.scope === undefined || spec.scope === '')) {
    refuse({ code: 'no-scope', values: {} })
  }
  const words = (key: string, value: string | undefined): string[] =>
    value === undefined || value.trim() === '' ? [] : [`${key}: ${yamlText(value)}`]
  const head = [
    ...words('title', spec.title),
    ...words('description', spec.description),
    `level: ${spec.level}`,
    ...(spec.level === 'component' ? [`scope: ${yamlText(spec.scope!)}`] : []),
    'elements: []',
    'connections: []',
    ''
  ].join('\n')
  return editDiagramText(path, head, [
    ...spec.elements.map((element) => ({ kind: 'add-element' as const, element })),
    ...spec.connections.map((connection) => ({ kind: 'add-connection' as const, ...connection }))
  ])
}

/**
 * Plan a new Diagram as `<ID>.yml` where the Diagrams of the repository are. Refused where the
 * file is there already, and while `.arch/config.yml` names no directory that can be used.
 */
export async function planNewDiagram(
  fs: FileSystem,
  spec: NewDiagram,
  config?: Config
): Promise<Plan<{ readonly path: string }>> {
  const { directory } = await locateDiagrams(fs, config)
  const path = directory === undefined ? '' : joinPath(directory, `${spec.id}.yml`)
  const planned = await plan(fs, asText, async (pending) => {
    if (directory === undefined) {
      refuse({ code: 'no-diagrams-directory', values: { path: CONFIG_PATH } })
    }
    await pending.create(path, newDiagramText(spec, path))
  })
  return planned.ok ? { ...planned, path } : planned
}
