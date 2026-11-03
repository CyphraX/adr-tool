/**
 * What is measured inside the Source Files of a Component (docs/structure-format.md, section
 * 5, "Inside a Source File"): its functions by their complexity, its classes by their LCOM4 —
 * for the Component page, a threshold of Conformance and the MCP server.
 */
import { withDirectories } from './directories'
import type { LevelOptions } from './levels'
import type { ClassMeasure, FileMeasures, FunctionMeasure } from './measures'
import type { Structure } from './structure'

/** A function and the Source File it is in. */
export interface MeasuredFunction extends FunctionMeasure {
  readonly file: string
}

/** A class and the Source File it is in. */
export interface MeasuredClass extends ClassMeasure {
  readonly file: string
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The functions and classes in the Source Files that a Component or directory node contains —
 * of the whole repository when `id` is left out —, test files only when asked for. Functions
 * come most complex first, classes with the most groups of methods first, and either in the
 * order of their files and lines where they are level.
 */
export function measuredInside(
  structure: Pick<Structure, 'components' | 'sourceFiles'>,
  measures: ReadonlyMap<string, FileMeasures>,
  id?: string,
  options: LevelOptions = {}
): { functions: MeasuredFunction[]; classes: MeasuredClass[] } {
  const functions: MeasuredFunction[] = []
  const classes: MeasuredClass[] = []
  for (const file of withDirectories(structure).sourceFiles) {
    if (file.test && !options.tests) continue
    const owner = file.component
    const inside =
      id === undefined || (owner !== undefined && (owner === id || owner.startsWith(`${id}/`)))
    const measured = inside ? measures.get(file.path) : undefined
    if (measured === undefined) continue
    for (const one of measured.functions) functions.push({ ...one, file: file.path })
    for (const one of measured.classes) classes.push({ ...one, file: file.path })
  }
  const place = (a: { file: string; line: number }, b: { file: string; line: number }): number =>
    compare(a.file, b.file) || a.line - b.line
  functions.sort((a, b) => b.complexity - a.complexity || place(a, b))
  classes.sort((a, b) => (b.lcom4 ?? 0) - (a.lcom4 ?? 0) || place(a, b))
  return { functions, classes }
}
