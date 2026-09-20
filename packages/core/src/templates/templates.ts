import { isMap, parseDocument } from 'yaml'
import type { FileSystem } from '@adr-tool/kernel'
import { CONFIG_PATH } from '../log/discover'
import { scalarText } from '../metadata/scalar'
import { viewSource } from '../text/source'
import { BUILT_IN_TEMPLATES, DEFAULT_TEMPLATE } from './builtin'

export const TEMPLATES_PATH = '.adr/templates'

export interface TemplateInfo {
  /** The file name without `.md`, or the name of a built-in Template. */
  readonly name: string
  readonly source: 'repository' | 'built-in'
}

export interface Templates {
  /** The repository's own Templates first, then the built-in ones they do not replace. */
  readonly templates: readonly TemplateInfo[]
  /** The one to preselect: `templates.default` from the configuration, else `minimal`. */
  readonly defaultName: string
}

/** The Templates a new ADR of this repository can start from. */
export async function listTemplates(fs: FileSystem): Promise<Templates> {
  const own = ((await fs.list(TEMPLATES_PATH)) ?? [])
    .filter((entry) => entry.kind === 'file' && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => entry.name.slice(0, -'.md'.length))
    .sort()
  const builtIn = Object.keys(BUILT_IN_TEMPLATES).filter((name) => !own.includes(name))
  const templates: TemplateInfo[] = [
    ...own.map((name) => ({ name, source: 'repository' as const })),
    ...builtIn.map((name) => ({ name, source: 'built-in' as const }))
  ]

  const configured = await configuredDefault(fs)
  const known = templates.some((template) => template.name === configured)
  return { templates, defaultName: known ? configured! : DEFAULT_TEMPLATE }
}

/**
 * The text of a Template, or the reason why it cannot be used. A Template shapes the body
 * only; one that brings frontmatter of its own would fight the tool over the Metadata.
 */
export async function loadTemplate(
  fs: FileSystem,
  name: string
): Promise<{ text: string } | { problem: string }> {
  const text = (await fs.readText(`${TEMPLATES_PATH}/${name}.md`)) ?? BUILT_IN_TEMPLATES[name]
  if (text === undefined) return { problem: `There is no Template called "${name}".` }

  const view = viewSource(text)
  if (view.frontmatter || view.unterminatedFrontmatter) {
    return {
      problem: `The Template "${name}" starts with frontmatter. A Template shapes the body only; remove the frontmatter from ${TEMPLATES_PATH}/${name}.md.`
    }
  }
  return { text: text.slice(view.bodyStart) }
}

async function configuredDefault(fs: FileSystem): Promise<string | undefined> {
  const config = await fs.readText(CONFIG_PATH)
  if (config === undefined) return undefined
  const doc = parseDocument(config)
  if (doc.errors.length > 0 || !isMap(doc.contents)) return undefined
  const templates = doc.contents.get('templates', true)
  return isMap(templates) ? scalarText(templates.get('default', true)) : undefined
}

/** Fill in the three placeholders of a Template: once, and without any logic. */
export function fillTemplate(
  text: string,
  values: { title: string; date: string; number: string }
): string {
  return text.replace(
    /\{\{(title|date|number)\}\}/g,
    (_, name: keyof typeof values) => values[name]
  )
}
