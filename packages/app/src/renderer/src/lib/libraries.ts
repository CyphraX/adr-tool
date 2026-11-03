import type { Licence, LibraryUser } from '@adr-tool/structure/model'
import { t } from './strings'

/** The columns of the Library inventory, each of which sorts it. */
export type LibraryColumn = 'library' | 'version' | 'usedBy' | 'files' | 'licence'

/**
 * A licence as the window says it: what the package declares, that a licence file is there,
 * or why it cannot be told.
 */
export function licenceLabel(licence: Licence, form: 'long' | 'short' = 'long'): string {
  const words = t.structure.inventory
  switch (licence.kind) {
    case 'declared':
      return licence.licence
    case 'file':
      return words.licenceFile
    case 'unknown':
      return (form === 'short' ? words.licenceShort : words.licenceUnknown)[licence.reason]
  }
}

/** Where a licence sorts: one that is declared, then a licence file, then what cannot be told. */
export const licenceRank = (licence: Licence): number =>
  licence.kind === 'declared' ? 0 : licence.kind === 'file' ? 1 : 2

/** The Components that use a Library, by their IDs, Unassigned files last. */
export const usersLabel = (users: readonly LibraryUser[]): string =>
  users.map((user) => user.component ?? t.structure.inventory.unassigned).join(', ')
