/**
 * What is wrong with a Diagram when it is read against the declaration of Components
 * (docs/diagrams-format.md, sections 3 and 5): an element whose Component is gone, a scope
 * that is not declared, an element that does not belong in the Diagram's level.
 */
import { everyComponent, type Structure } from '@adr-tool/structure/model'
import { elementsOf, type Diagram, type Element } from './diagram'
import type { DiagramProblem } from './problems'

/** What the checks need of Structure: whether the Components are declared, and which. */
export type Declared = Pick<Structure, 'origin' | 'components'>

const parentOf = (id: string): string => (id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '')

/** The scope and every Component that contains it, the scope first. */
function selfAndAncestors(scope: string): string[] {
  const ids: string[] = []
  for (let id = scope; id !== ''; id = parentOf(id)) ids.push(id)
  return ids
}

/**
 * Whether a Component belongs in the component view of `scope`: one of its children, or beside
 * the scope or beside a Component that contains it.
 */
function inComponentView(component: string, scope: string): boolean {
  if (parentOf(component) === scope) return true
  const line = selfAndAncestors(scope)
  return !line.includes(component) && line.some((id) => parentOf(id) === parentOf(component))
}

/**
 * The Problems of a Diagram that need the declaration of Components. None on a Draft, nor
 * while the declaration cannot be read: the IDs of the Draft follow directories, and an
 * unreadable declaration is the Problem to solve first (as for Traces).
 */
export function checkDiagram(diagram: Diagram, structure: Declared): DiagramProblem[] {
  if (structure.origin !== 'declared') return []
  const declared = new Set(everyComponent(structure.components).map((component) => component.id))
  const { path } = diagram
  const problems: DiagramProblem[] = []

  const scope = diagram.level === 'component' ? diagram.scope : undefined
  const scopeKnown = scope !== undefined && declared.has(scope)
  if (scope !== undefined && !scopeKnown) {
    problems.push({ kind: 'unknown-scope', path, line: diagram.scopeLine ?? 1, component: scope })
  }

  const fits = (element: Element): boolean => {
    switch (diagram.level) {
      case undefined:
        return true
      case 'system-context':
        return false
      case 'container':
        return !element.id.includes('/')
      case 'component':
        return !scopeKnown || inComponentView(element.id, scope!)
    }
  }

  for (const element of elementsOf(diagram)) {
    if (element.kind === 'component') {
      if (!declared.has(element.id)) {
        problems.push({ kind: 'component-gone', path, line: element.line, component: element.id })
      } else if (!fits(element)) {
        problems.push({
          kind: 'component-does-not-fit',
          path,
          line: element.line,
          component: element.id,
          level: diagram.level!,
          scope: scope ?? ''
        })
      }
    } else if (element.kind === 'repository' && diagram.level !== undefined) {
      if (diagram.level !== 'system-context') {
        problems.push({ kind: 'repository-does-not-fit', path, line: element.line, id: element.id })
      }
    }
  }
  return problems
}

/** Every Problem of a Diagram: of its file, then against the declaration. */
export function problemsOf(diagram: Diagram, structure: Declared): DiagramProblem[] {
  return [...diagram.problems, ...checkDiagram(diagram, structure)]
}
