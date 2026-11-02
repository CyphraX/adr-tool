/**
 * The core of the Review module (docs/review-format.md): Annotations on lines of Source Files,
 * their Replies, their Traces to ADRs, and their Anchors found again when the code changes.
 * Pure TypeScript on the kernel's file-system and git ports; it reads Structure's Components
 * and is told the ADRs (ADR-0006).
 */
export {
  ANNOTATION_STATES,
  ANNOTATION_TYPES,
  linesText,
  type Anchor,
  type Annotation,
  type AnnotationState,
  type AnnotationType,
  type Reply
} from './annotation'
export {
  annotationsDirectory,
  CONFIGURATION_PATH,
  DEFAULT_ANNOTATIONS_DIRECTORY,
  readAnnotations,
  type AnnotationsDirectory,
  type AnnotationsReading
} from './read'
export {
  annotationsCiting,
  citedAdr,
  qualified,
  traceProblems,
  type AdrReference,
  type CitedAdr
} from './traces'
export {
  findAnchor,
  findAnchors,
  findingCache,
  RENAME_COMMITS,
  STAND_IN_COMMITS,
  WINDOW,
  type Finding,
  type FindingCache,
  type Found
} from './find'
export {
  editDistance,
  mostSimilarBlock,
  normalized,
  SIMILAR_ENOUGH,
  type Block
} from './similarity'
export { annotationsOf, componentOf, sourceFileOf } from './component'
export {
  anchorAt,
  planAnnotation,
  planAttach,
  planCite,
  planRepair,
  planReply,
  planState,
  planUncite,
  planUpdateAnchor,
  type NewAnnotation,
  type NewReply
} from './write'
export { hasRepair, REVIEW_PROBLEM_CODES, saidOf, wordingOf, type ReviewProblem } from './problems'
export {
  englishOf as reviewEnglishOf,
  SENTENCES as REVIEW_SENTENCES,
  type ReviewSaid
} from './sentences'
