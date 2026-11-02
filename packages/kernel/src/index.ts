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
  type Plan,
  type Stranded
} from './change/change-set'
export { PendingFiles, Refusal, plan } from './change/pending'
export { sentenceOf, type Said, type SaidBy, type Sentences } from './change/said'

export { applyEdits, type TextEdit } from './text/edit'
