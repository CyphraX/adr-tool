/**
 * Everything of `structure` but the parsers: Components and who owns which Source File, the
 * Draft, Adopt and the Repair, the levels of the hierarchy and their Cycles, the metrics and
 * the matrix. It does not load
 * TypeScript, so the app's main process and its renderer can use it; the analysis that reads
 * code runs elsewhere and hands its Dependencies in (ADR-0008).
 */
export { openStructure, type RepositoryFiles, type Structure } from './structure'
export {
  everyComponent,
  isSegment,
  readDeclaration,
  type Declaration,
  type DeclaredComponent
} from './declaration'
export type { OwnedSourceFile } from './ownership'
export { isDirectoryNode, withDirectories, type DirectoryNode } from './directories'
export type { Language, SourceFile } from './source-files'
export {
  DECLARATION_PATH,
  saidOf,
  wordingOf,
  type PatternKey,
  type StructureProblem
} from './problems'
export {
  SENTENCES as STRUCTURE_SENTENCES,
  englishOf as structureEnglishOf,
  type StructureSaid
} from './sentences'
export { hasRepair, planAdopt, planRename, planRepair, type RenamePlan } from './operations'
export type { Dependencies, Dependency, LibraryUse, NotAnalysed, NotResolved } from './dependencies'
export type { ManifestLibrary } from './manifests'
export {
  edgesAmong,
  levelOf,
  UNASSIGNED,
  type Level,
  type LevelEdge,
  type LevelNode,
  type LevelOptions
} from './levels'
export { findCycles, type Cycle, type WeightedEdge } from './cycles'
export { metricsOf, sizeOf, type Metrics, type Size } from './metrics'
export {
  matrixOf,
  orderOf,
  type Matrix,
  type MatrixCycle,
  type MatrixGroup,
  type MatrixRow
} from './matrix'
