import type { Plan } from '../plan'
import type { FileSystem } from '@adr-tool/kernel'
import type { DecisionLog } from '../log/load'
import type { MetadataKey } from '../metadata/keys'
import { addToList, removeFromList } from '../metadata/write'
import { RELATION_TYPES, type RelationType } from '../relation'
import { Refusal, plan } from './pending'
import { requireTarget, writable } from './rules'

/**
 * The lists of an ADR's Metadata as they should be afterwards. A list that is left out is
 * not touched. The order of a list is the file's business: items are added and removed,
 * never moved.
 */
export interface MetadataEdit {
  readonly decisionMakers?: readonly string[]
  readonly tags?: readonly string[]
  readonly relations?: Partial<Readonly<Record<RelationType, readonly string[]>>>
}

/**
 * Edit the lists of an ADR's Metadata that a person maintains (docs/file-format.md,
 * section 5). `decision-makers`, `tags`, `depends-on` and `relates-to` can change at any
 * Status; `supersedes` and `amends` only while the ADR is `proposed`.
 *
 * What is added must be valid. What is already there can always be removed, valid or not:
 * that is how a Relation to an ADR that does not exist is repaired.
 */
export function planEditMetadata(
  fs: FileSystem,
  log: DecisionLog,
  id: string,
  edit: MetadataEdit
): Promise<Plan> {
  return plan(fs, async (pending) => {
    const adr = writable(log, id)
    const changes: { key: MetadataKey; removed: string[]; added: string[] }[] = []
    const change = (key: MetadataKey, current: readonly string[], wanted: string[]): void => {
      const removed = current.filter((item) => !wanted.includes(item))
      const added = wanted.filter((item) => !current.includes(item))
      if (removed.length > 0 || added.length > 0) changes.push({ key, removed, added })
    }

    if (edit.decisionMakers) {
      const current = adr.metadata.decisionMakers
      change('decision-makers', current, freeText(edit.decisionMakers, current, 'decision-maker'))
    }
    if (edit.tags) {
      change('tags', adr.metadata.tags, freeText(edit.tags, adr.metadata.tags, 'tag'))
    }
    for (const type of RELATION_TYPES) {
      const wanted = edit.relations?.[type]
      if (wanted) change(type, adr.metadata.relations[type], [...new Set(wanted)])
    }

    for (const { key, added } of changes) {
      if (key !== 'supersedes' && key !== 'amends') continue
      if (adr.metadata.status !== 'proposed') {
        const is = adr.metadata.rawStatus ? `"${adr.metadata.rawStatus}"` : adr.metadata.status
        throw new Refusal(
          `What an ADR supersedes or amends is fixed once it is no longer proposed. ${id} is ${is}.`
        )
      }
      for (const target of added) requireTarget(key, other(log, id, target))
    }
    for (const { key, added } of changes) {
      if (key === 'depends-on' || key === 'relates-to') {
        for (const target of added) other(log, id, target)
      }
    }

    for (const { key, removed, added } of changes) {
      for (const item of removed) {
        await pending.write(adr.path, (view) => removeFromList(view, key, item))
      }
      for (const item of added) {
        await pending.write(adr.path, (view) => addToList(view, key, item))
      }
    }
  })
}

/** The target of a new Relation: another ADR of the same Decision Log. */
function other(log: DecisionLog, id: string, target: string): DecisionLog['adrs'][number] {
  if (target === id) throw new Refusal(`${id} cannot have a Relation to itself.`)
  const adr = log.adrs.find((candidate) => candidate.id === target)
  if (!adr) throw new Refusal(`There is no ADR ${target} in this Decision Log.`)
  return adr
}

/** Free text as it goes into a list: one line, not empty, once. What is already in the file stays as it is. */
function freeText(wanted: readonly string[], current: readonly string[], what: string): string[] {
  const items = wanted.map((item) => (current.includes(item) ? item : item.trim()))
  for (const item of items) {
    if (item === '' || /[\r\n]/.test(item)) {
      throw new Refusal(`A ${what} is one line of text and cannot be empty.`)
    }
  }
  return [...new Set(items)]
}
