export { STATUSES, isStatus, type Status } from './status'
export { RELATION_TYPES, BACK_REFERENCE_KEYS, isRelationType, type RelationType } from './relation'

// What core's callers use of the kernel is handed on, so that they have one place to import from.
export {
  applyChangeSet,
  joinPath,
  memoryFileSystem,
  type Applied,
  type ChangeSet,
  type DirectoryEntry,
  type FileChange,
  type FileSystem,
  type WritableFileSystem
} from '@adr-tool/kernel'

export { openRepository, type DecisionLog, type Repository } from './log/load'
export { DEFAULT_LOG_PATHS } from './log/discover'
export type { NamingScheme } from './log/naming'
export { FOREIGN_FORMAT_NAMES, type Adr, type ForeignFormat } from './adr/adr'
export { correctionsIn, type Correction, type Metadata } from './metadata/read'
export { METADATA_KEYS, type MetadataKey } from './metadata/keys'
export { hasBeenAccepted, type Relation, type RelationState } from './relations/graph'
export type { BackReferenceKey, Problem } from './problems/problem'
export { groupProblems, type ProblemGroup } from './problems/group'

export { applyEdits, type TextEdit } from '@adr-tool/kernel'

export type { Plan } from './plan'
export { planAccept, planDeprecate, planReject, type Today } from './lifecycle/decide'
export { planEditBody, recordsCorrection, type BodyEdit } from './lifecycle/edit-body'
export { planCreate, type NewAdr } from './lifecycle/create'
export { planEditMetadata, type MetadataEdit } from './lifecycle/edit-metadata'
export { planRenumber } from './lifecycle/renumber'
export { planMigration } from './lifecycle/migrate'
export { planRepair, repairsOf, type Repair } from './lifecycle/repair'
export { nextPrefix } from './log/new-id'
export { listTemplates, type TemplateInfo, type Templates } from './templates/templates'
