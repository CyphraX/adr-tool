import type { Licence, LibraryUser } from '@adr-tool/structure/model'
import { t } from './strings'

/** The columns of the Library inventory, each of which sorts it. */
export type LibraryColumn = 'library' | 'version' | 'usedBy' | 'files' | 'licence'

/**
 * An SPDX expression without the parentheses around the whole of it, which say nothing when
 * it stands alone: `(MPL-2.0 OR Apache-2.0)` as `MPL-2.0 OR Apache-2.0`. Those inside stay.
 */
export function withoutOuterParentheses(expression: string): string {
  let text = expression.trim()
  while (text.startsWith('(') && text.endsWith(')')) {
    // The first parenthesis must close at the very end, not before: `(A) OR (B)` stays.
    let depth = 0
    let closesAtEnd = true
    for (let at = 0; at < text.length; at++) {
      if (text[at] === '(') depth++
      else if (text[at] === ')') depth--
      if (depth === 0 && at < text.length - 1) {
        closesAtEnd = false
        break
      }
    }
    if (!closesAtEnd) break
    text = text.slice(1, -1).trim()
  }
  return text
}

/**
 * A licence as the window says it: what the package declares, that a licence file is there,
 * or why it cannot be told.
 */
export function licenceLabel(licence: Licence, form: 'long' | 'short' = 'long'): string {
  const words = t.structure.inventory
  switch (licence.kind) {
    case 'declared':
      return withoutOuterParentheses(licence.licence)
    case 'file':
      return words.licenceFile
    case 'unknown':
      return (form === 'short' ? words.licenceShort : words.licenceUnknown)[licence.reason]
  }
}

/** Where a licence sorts: one that is declared, then a licence file, then what cannot be told. */
export const licenceRank = (licence: Licence): number =>
  licence.kind === 'declared' ? 0 : licence.kind === 'file' ? 1 : 2

/**
 * Two licences in the order of a column sorted up or down: by what they say, and in either
 * direction those that cannot be told last.
 */
export function compareLicences(a: Licence, b: Licence, descending: boolean): number {
  const unknown = Number(a.kind === 'unknown') - Number(b.kind === 'unknown')
  if (unknown !== 0) return unknown
  const order =
    licenceRank(a) - licenceRank(b) ||
    licenceLabel(a).localeCompare(licenceLabel(b), undefined, { numeric: true })
  return descending ? -order : order
}

/**
 * The users of a Library as the view shows them: with test files, or without them where
 * they are left out — a Component whose files are all tests is then not shown.
 */
export function shownUsers(users: readonly LibraryUser[], tests: boolean): LibraryUser[] {
  if (tests) return [...users]
  return users.flatMap((user) => {
    if (user.tests.length === 0) return [user]
    const test = new Set(user.tests)
    const files = user.files.filter((path) => !test.has(path))
    if (files.length === 0) return []
    return [
      {
        ...user,
        files,
        lines: Object.fromEntries(files.map((path) => [path, user.lines[path] ?? []])),
        tests: [],
        testOnly: false,
        undeclared: user.undeclared.filter((path) => !test.has(path))
      }
    ]
  })
}

/** How many files use a Library, over all its users. */
export const fileCountOf = (users: readonly LibraryUser[]): number =>
  users.reduce((sum, user) => sum + user.files.length, 0)

/** The Components that use a Library, by their IDs, Unassigned files last. */
export const usersLabel = (users: readonly LibraryUser[]): string =>
  users.map((user) => user.component ?? t.structure.inventory.unassigned).join(', ')
