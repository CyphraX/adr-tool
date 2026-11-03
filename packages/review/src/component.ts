import type { Structure } from '@adr-tool/structure/model'
import type { Annotation } from './annotation'
import type { Found } from './find'

/**
 * Where an Annotation is now: the Source File it was found again in, or the one its Anchor
 * names while it is orphaned or was not looked for. `undefined` without an Anchor.
 */
export function sourceFileOf(annotation: Annotation, found?: Found): string | undefined {
  if (found && found.kind !== 'orphaned') return found.anchor.path
  return annotation.anchor?.path
}

/**
 * The Component an Annotation belongs to: the one that owns its Source File. It is not stored
 * (docs/review-format.md, section 4); `undefined` for a file no Component owns.
 */
export function componentOf(
  annotation: Annotation,
  structure: Pick<Structure, 'sourceFiles'>,
  found?: Found
): string | undefined {
  const path = sourceFileOf(annotation, found)
  return path === undefined
    ? undefined
    : structure.sourceFiles.find((file) => file.path === path)?.component
}

/**
 * The Annotations a Component contains: on the Source Files it owns, and on those its
 * descendants own, as the Component page lists them.
 */
export function annotationsOf(
  component: string,
  annotations: readonly Annotation[],
  structure: Pick<Structure, 'sourceFiles'>,
  found: ReadonlyMap<string, Found> = new Map()
): Annotation[] {
  return annotations.filter((annotation) => {
    const owner = componentOf(annotation, structure, found.get(annotation.id))
    return owner !== undefined && (owner === component || owner.startsWith(`${component}/`))
  })
}
