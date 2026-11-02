import type { Plan } from '../plan'
import type { FileSystem } from '@adr-tool/kernel'
import type { DecisionLog } from '../log/load'
import type { MetadataKey } from '../metadata/keys'
import { addToList, removeFromList } from '../metadata/write'
import { RELATION_TYPES, type RelationType } from '../relation'
import { plan } from './pending'
import { refuse } from '../sentences'
import { isQualified, normalReference, outsideReference } from '../relations/reference'
import { named, requireTarget, statusAsWritten, writable, type AnyAdr } from './rules'

/**
 * The lists of an ADR's Metadata as they should be afterwards. A list that is left out is
 * not touched. The order of a list is the file's business: items are added and removed,
 * never moved.
 */
export interface MetadataEdit {
  readonly decisionMakers?: readonly string[]
  readonly tags?: readonly string[]
  readonly relations?: Partial<Readonly<Record<RelationType, readonly string[]>>>
  /** The Components the ADR affects, by their Component IDs. */
  readonly affects?: readonly string[]
}

/**
 * Edit the lists of an ADR's Metadata that a person maintains (docs/file-format.md,
 * section 5). `decision-makers`, `tags`, `depends-on`, `relates-to` and `affects` can change
 * at any Status; `supersedes` and `amends` only while the ADR is `proposed`.
 *
 * What is added must be valid: a Component in `affects` must be one of `components`, the IDs
 * the repository declares. What is already there can always be removed, valid or not: that is
 * how a Relation to an ADR that does not exist is repaired.
 */
export function planEditMetadata(
  fs: FileSystem,
  log: DecisionLog,
  id: string,
  edit: MetadataEdit,
  components?: readonly string[]
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
      change(
        'decision-makers',
        current,
        freeText(edit.decisionMakers, current, 'decision-maker-one-line')
      )
    }
    if (edit.tags) {
      change('tags', adr.metadata.tags, freeText(edit.tags, adr.metadata.tags, 'tag-one-line'))
    }
    for (const type of RELATION_TYPES) {
      const wanted = edit.relations?.[type]
      if (!wanted) continue
      // An ADR is named once. What is written stays as it is written; what is new is written as
      // the tool writes it: `0002-b` for `docs/adr/0002-b` in the log `docs/adr`.
      const normal = (item: string): string => normalReference(log.path, item)
      const written = new Map<string, string>()
      for (const item of adr.metadata.relations[type]) {
        if (!written.has(normal(item))) written.set(normal(item), item)
      }
      const items = new Map<string, string>()
      for (const item of wanted) {
        if (!items.has(normal(item)))
          items.set(normal(item), written.get(normal(item)) ?? normal(item))
      }
      change(type, adr.metadata.relations[type], [...items.values()])
    }
    if (edit.affects) change('affects', adr.metadata.affects, [...new Set(edit.affects)])

    for (const { key, added } of changes) {
      if (key !== 'supersedes' && key !== 'amends') continue
      if (adr.metadata.status !== 'proposed') {
        refuse({ code: 'relations-fixed', values: { adr: id, is: statusAsWritten(adr) } })
      }
      for (const target of added) requireTarget(key, other(log, id, target))
    }
    for (const { key, added } of changes) {
      if (key === 'depends-on' || key === 'relates-to') {
        // An ADR of another repository is taken as written: only where both are open is it
        // known (docs/file-format.md, section 3).
        for (const target of added) if (!outsideReference(target)) other(log, id, target)
      }
      if (key === 'affects') for (const component of added) declared(components, component)
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

/** The target of a new Relation: another ADR of the Decision Log, or of another log. */
function other(log: DecisionLog, id: string, target: string): AnyAdr {
  if (normalReference(log.path, target) === id) {
    refuse({ code: 'relation-to-itself', values: { adr: id } })
  }
  const adr = named(log, target)
  if (!adr) {
    refuse({
      code: isQualified(target) ? 'no-adr-in-repository' : 'no-adr',
      values: { id: target }
    })
  }
  return adr
}

/** A Component a Trace can be added to: one the repository declares. */
function declared(components: readonly string[] | undefined, component: string): void {
  if (!components || components.length === 0) {
    refuse({ code: 'no-components-declared', values: {} })
  }
  if (!components.includes(component)) {
    refuse({ code: 'component-not-declared', values: { component } })
  }
}

/** Free text as it goes into a list: one line, not empty, once. What is already in the file stays as it is. */
function freeText(
  wanted: readonly string[],
  current: readonly string[],
  rule: 'decision-maker-one-line' | 'tag-one-line'
): string[] {
  const items = wanted.map((item) => (current.includes(item) ? item : item.trim()))
  for (const item of items) {
    if (item === '' || /[\r\n]/.test(item)) {
      refuse({ code: rule, values: {} })
    }
  }
  return [...new Set(items)]
}
