/**
 * The Diagrams module's core: Diagrams bound to Structure's Components, their suggested
 * connections and Drift, their Problems with the Repair, and their picture as SVG
 * (docs/diagrams-format.md). It does not load TypeScript: whoever calls it analyses the code
 * with `structure` and hands the Dependencies in.
 */
export {
  connectionsOf,
  diagramIdOf,
  elementsOf,
  MAX_COORDINATE,
  readDiagram,
  VIEW_LEVELS,
  type ComponentElement,
  type Connection,
  type Diagram,
  type Element,
  type ElementKind,
  type PlainElement,
  type Point,
  type Size,
  type UnreadableDiagram,
  type ViewLevel
} from './diagram'
export {
  DEFAULT_DIAGRAMS_DIRECTORY,
  DIAGRAMS_KEY,
  isDiagramFile,
  locateDiagrams,
  openDiagrams,
  readLocation,
  svgPathOf,
  type DiagramsLocation,
  type RepositoryDiagrams
} from './location'
export { checkDiagram, problemsOf, type Declared } from './check'
export {
  DIAGRAM_PROBLEM_CODES,
  hasRepair,
  saidOf,
  wordingOf,
  type DiagramProblem,
  type DiagramProblemCode,
  type UnreadableDiagramProblem
} from './problems'
export {
  driftOf,
  driftWording,
  saidOfDrift,
  suggestConnections,
  type Analysis,
  type ConnectionOptions,
  type Drift,
  type Model,
  type SuggestedConnection
} from './connections'
export { planRepair, removeComponent } from './repair'
export {
  editDiagramText,
  planDiagramEdit,
  spliceBetween,
  yamlText,
  type DiagramEdit,
  type NewConnection,
  type NewElement
} from './edit'
export {
  drawDiagram,
  geometryOf,
  lineBetween,
  textWidth,
  type Geometry,
  type PlacedBox,
  type PlacedLine
} from './svg'
export { checkPicture, planExport, type ExportModel, type ExportPlan } from './export'
export { newDiagramText, planNewDiagram, type NewDiagram } from './create'
export { planRenameInDiagrams, renameInDiagram } from './rename'
export {
  SENTENCES as DIAGRAMS_SENTENCES,
  englishOf as diagramsEnglishOf,
  type DiagramsSaid
} from './sentences'
