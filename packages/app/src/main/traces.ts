/**
 * Where Decisions and Structure meet: an ADR's Traces name Components. The two cores do not
 * know each other (ADR-0006); the app reads what Structure declares and hands it to `core`,
 * and puts the halves of a Rename together into one change set.
 */
import {
  openRepository,
  planRenameTraces,
  type FileSystem,
  type Plan,
  type Repository
} from '@adr-tool/core'
import {
  DECLARATION_PATH,
  everyComponent,
  planRename,
  readDeclaration
} from '@adr-tool/structure/model'
import type { ComponentName } from '../shared/ipc'

/**
 * The Components the repository declares, which Traces name, each parent before its children.
 * `undefined` while nothing is declared that can be read: the Draft's IDs are no names to
 * write down (docs/file-format.md, section 5).
 */
export async function declaredComponents(fs: FileSystem): Promise<ComponentName[] | undefined> {
  const declaration = readDeclaration(await fs.readText(DECLARATION_PATH))
  if (declaration.kind !== 'declared') return undefined
  return everyComponent(declaration.components).map(({ id, name }) => ({ id, name }))
}

/** Read the Decision Logs with their Traces checked against the declaration, if there is one. */
export async function openWithTraces(
  fs: FileSystem
): Promise<{ repository: Repository; components: ComponentName[] | undefined }> {
  const components = await declaredComponents(fs)
  const ids = components?.map((component) => component.id)
  const repository = await openRepository(fs, ids ? { components: ids } : {})
  return { repository, components }
}

/**
 * Rename a Component: Structure plans the new segment in the declaration, `core` the Traces in
 * every ADR that name the Component or one below it. One change set, previewed as a whole.
 */
export async function planComponentRename(
  fs: FileSystem,
  component: string,
  segment: string
): Promise<Plan> {
  const declared = await planRename(fs, component, segment)
  if (!declared.ok) return declared
  const { logs } = await openRepository(fs)
  const traces = await planRenameTraces(fs, logs, declared.renamed.from, declared.renamed.to)
  if (!traces.ok) return traces
  return {
    ok: true,
    changeSet: { files: [...declared.changeSet.files, ...traces.changeSet.files] }
  }
}
