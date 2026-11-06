/**
 * Reading a Risk or a Technical Debt Item (docs/assessment-format.md, section 5): a Markdown
 * file of its own, with its state, its days, its owner and its Components in the frontmatter,
 * its title as `# `, and its description below. Never throws.
 */
import type { Register, Risk, TechnicalDebtItem } from './model'
import type { AssessmentProblem } from './problems'
import { DEBT_STATES, RISK_STATES } from './quality'
import { outlineOf, trimmedText, viewFile, type Heading } from './text'
import { frontmatterOf, valuesOf } from './values'

/** The suite's keys of a Risk or a Technical Debt Item, in the order it writes them. */
export const ENTRY_KEYS = ['state', 'date', 'changed', 'owner', 'components'] as const

/** The title of a body, and the rest of it: its description. */
function titleAndDescription(
  text: string,
  bodyStart: number
): { title?: string; description: string } {
  const title = outlineOf(text, bodyStart).find(
    (item): item is Heading => item.kind === 'heading' && item.level === 1
  )
  if (!title) return { description: trimmedText(text, bodyStart, text.length) }
  const before = trimmedText(text, bodyStart, title.line.start)
  const after = trimmedText(text, title.line.next, text.length)
  return {
    title: title.text,
    description: before === '' ? after : after === '' ? before : `${before}\n\n${after}`
  }
}

/** Read the file of a Risk or a Technical Debt Item tolerantly. */
export function readRegisterEntry<R extends Register>(
  register: R,
  id: string,
  path: string,
  text: string
): { entry: R extends 'risks' ? Risk : TechnicalDebtItem; problems: AssessmentProblem[] } {
  const problems: AssessmentProblem[] = []
  const view = viewFile(text)
  const frontmatter = frontmatterOf(view, path)
  const states: readonly string[] = register === 'risks' ? RISK_STATES : DEBT_STATES
  const body = view.unterminated ? { description: '' } : titleAndDescription(text, view.bodyStart)
  const base = {
    register,
    id,
    path,
    ...(body.title !== undefined && { title: body.title }),
    description: body.description
  }
  type Entry = R extends 'risks' ? Risk : TechnicalDebtItem
  if (frontmatter.unreadable) {
    problems.push({
      kind: register === 'risks' ? 'unreadable-risk' : 'unreadable-debt-item',
      path,
      id,
      detail: frontmatter.unreadable
    })
    return {
      entry: { ...base, state: undefined, components: [], writable: false } as unknown as Entry,
      problems
    }
  }
  const region = frontmatter.region
  const values = region
    ? valuesOf(region, region.map, (key, line, detail) =>
        problems.push({ kind: 'invalid-frontmatter-value', path, id, line, key, detail })
      )
    : undefined
  const state = values
    ? values.oneOf(
        'state',
        states,
        { code: register === 'risks' ? 'must-be-risk-state' : 'must-be-debt-state', values: {} },
        'open'
      )
    : 'open'
  const date = values?.day('date')
  const changed = values?.day('changed')
  const owner = values?.text('owner')
  const components =
    values?.texts('components', { code: 'must-be-component-ids', values: {} }) ?? []
  return {
    entry: {
      ...base,
      state,
      ...(date !== undefined && { date }),
      ...(changed !== undefined && { changed }),
      ...(owner !== undefined && { owner }),
      components,
      writable: true
    } as unknown as Entry,
    problems
  }
}
