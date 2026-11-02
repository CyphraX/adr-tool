import {
  isQualified,
  normalReference,
  type Adr,
  type DecisionLog,
  type GuestAdr
} from '@adr-tool/core'

/** An ADR a Decision Log can name: one of its own, or one of another log of the repository. */
export interface Named {
  /** How the log names it: its ID, or `<log>/<ID>` (docs/file-format.md, section 3). */
  readonly id: string
  readonly adr: Adr | GuestAdr
  /** The directory of its Decision Log, when that is another one. */
  readonly log?: string
}

const own = (adr: Adr): Named => ({ id: adr.id, adr })
const guest = (adr: GuestAdr): Named => ({ id: adr.reference, adr, log: adr.log })

/** The ADR a reference written in `log` names, if there is one. */
export function namedIn(log: DecisionLog, reference: string): Named | undefined {
  const normal = normalReference(log.path, reference)
  if (!isQualified(normal)) {
    const found = log.adrs.find((adr) => adr.id === normal)
    return found && own(found)
  }
  const found = (log.guests ?? []).find((adr) => adr.reference === normal)
  return found && guest(found)
}

/** Every ADR the log can name: the other logs' first, its own last, each in the order of IDs. */
export function everyNamed(log: DecisionLog): Named[] {
  return [...(log.guests ?? []).map(guest), ...log.adrs.map(own)]
}
