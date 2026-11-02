export { STATUSES, isStatus, type Status } from './status'
export { RELATION_TYPES, BACK_REFERENCE_KEYS, isRelationType, type RelationType } from './relation'

// What core's callers use of the kernel is handed on, so that they have one place to import from.
export {
  applyChangeSet,
  joinChangeSets,
  joinPath,
  memoryFileSystem,
  normalizePath,
  sentenceOf,
  type Applied,
  type ChangeSet,
  type DirectoryEntry,
  type FileChange,
  type FileSystem,
  type Said,
  type SaidValue,
  type Sentences,
  type Stranded,
  type WritableFileSystem
} from '@adr-tool/kernel'
export { SENTENCES, englishOf, type CoreSaid } from './sentences'

export { openRepository, type DecisionLog, type OpenOptions, type Repository } from './log/load'
export { DEFAULT_LOG_PATHS } from './log/discover'
export {
  branchChanges,
  numberTakenOn,
  type BranchAdr,
  type MergeBase,
  type TakenNumber
} from './log/branches'
export { firstLog } from './log/first'
export type { NamingScheme } from './log/naming'
export {
  FOREIGN_FORMAT_NAMES,
  type Adr,
  type ForeignFormat,
  type ForeignSign,
  type GuestAdr
} from './adr/adr'
export { correctionsIn, type Correction, type Metadata } from './metadata/read'
export { METADATA_KEYS, type MetadataKey } from './metadata/keys'
export {
  hasBeenAccepted,
  stateOf as relationStateOf,
  type Relation,
  type RelationState
} from './relations/graph'
export {
  absoluteReference,
  isQualified,
  normalReference,
  outsideReference,
  outsideTo,
  parseReference,
  qualified,
  referenceTo,
  REPOSITORY_NAME,
  type OutsideReference,
  type Reference
} from './relations/reference'
export type { BackReferenceKey, Problem } from './problems/problem'
export { groupProblems, rootOf, type ProblemGroup } from './problems/group'
export {
  PROBLEM_CODES,
  describeCause,
  describeConsequences,
  describeProblem,
  type ProblemCode
} from './problems/wording'
export { locateProblem, problemLocator, type ProblemPlace } from './problems/locate'

export { applyEdits, type TextEdit } from '@adr-tool/kernel'

export type { Plan } from './plan'
export { planAccept, planDeprecate, planReject, type Today } from './lifecycle/decide'
export { planEditBody, recordsCorrection, type BodyEdit } from './lifecycle/edit-body'
export { planCreate, type NewAdr } from './lifecycle/create'
export { planEditMetadata, type MetadataEdit } from './lifecycle/edit-metadata'
export { planRenumber } from './lifecycle/renumber'
export { planRenameTraces } from './lifecycle/rename-traces'
export { planMigration } from './lifecycle/migrate'
export { planRepair, repairsOf, type Repair } from './lifecycle/repair'
export { nextPrefix } from './log/new-id'
export { listTemplates, type TemplateInfo, type Templates } from './templates/templates'
