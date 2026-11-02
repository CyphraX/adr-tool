/**
 * Where Decisions and Structure meet: an ADR's Traces name Components, and so do the Rules of
 * Conformance. `core` does not know Structure, and no core knows another's operations
 * (ADR-0006); the app reads what Structure declares and hands it to `core`, and puts the parts
 * of a Rename together into one change set.
 */
import {
  joinChangeSets,
  openRepository,
  planRenameTraces,
  type FileSystem,
  type Plan,
  type Repository
} from '@adr-tool/core'
import { planRenameInRules } from '@adr-tool/conformance'
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
 * every ADR that name the Component or one below it, Conformance the IDs in `.arch/rules.yml`
 * (docs/conformance-format.md, section 7). One change set, previewed as a whole, with what any
 * part warns of — and why any part refuses — as its module says it, code and all.
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
  const rules = await planRenameInRules(fs, declared.renamed.from, declared.renamed.to)
  if (!rules.ok) return rules
  const parts = [declared, traces, rules]
  const warnings = parts.flatMap((part) => part.warnings ?? [])
  const warned = parts.flatMap((part) => part.warned ?? [])
  return {
    ok: true,
    changeSet: joinChangeSets(declared.changeSet, traces.changeSet, rules.changeSet),
    ...(warnings.length > 0 && { warnings }),
    // Codes only where every warning has one: a code stands where its warning stands.
    ...(warned.length > 0 && warned.length === warnings.length && { warned })
  }
}
