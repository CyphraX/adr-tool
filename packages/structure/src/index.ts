export { openStructure, type RepositoryFiles, type Structure } from './structure'
export type { DeclaredComponent } from './declaration'
export type { OwnedSourceFile } from './ownership'
export type { Language, SourceFile } from './source-files'
export { DECLARATION_PATH, wordingOf, type PatternKey, type StructureProblem } from './problems'
export { hasRepair, planAdopt, planRepair } from './operations'
export {
  analyseDependencies,
  type Dependencies,
  type Dependency,
  type Extract,
  type LibraryUse,
  type NotAnalysed,
  type NotResolved
} from './dependencies'
export { extractUses, type Extraction, type Use } from './typescript/extract'
export {
  levelOf,
  UNASSIGNED,
  type Level,
  type LevelEdge,
  type LevelNode,
  type LevelOptions
} from './levels'
export type { Cycle } from './cycles'
