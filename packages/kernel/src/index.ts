export {
  joinPath,
  normalizePath,
  type DirectoryEntry,
  type FileSystem,
  type WritableFileSystem
} from './fs/port'
export { memoryFileSystem } from './fs/memory'

export {
  applyChangeSet,
  joinChangeSets,
  type Applied,
  type ChangeSet,
  type FileChange,
  type Plan
} from './change/change-set'
export { PendingFiles, Refusal, plan } from './change/pending'
export {
  KERNEL_SENTENCES,
  sentenceOf,
  type KernelSaid,
  type Said,
  type SaidBy,
  type SaidValue,
  type Sentences
} from './change/said'

export { applyEdits, type TextEdit } from './text/edit'
