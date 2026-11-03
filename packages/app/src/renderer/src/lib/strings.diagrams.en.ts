import type { ElementKind, ViewLevel } from '@adr-tool/diagrams'

/**
 * What the Diagrams module of the window says (`t.diagrams`), arranged as strings.en.ts is; the
 * German is strings.diagrams.de.ts, of the same shape. The terms are those of the glossary
 * (docs/contexts/diagrams/CONTEXT.md): a Diagram, an element, an External System, a connection,
 * a suggested connection, a Drift, the Export.
 */

const many = (count: number, one: string, more: string): string => (count === 1 ? one : more)

export const DIAGRAMS_EN = {
  label: 'Diagrams',
  heading: 'Diagrams',
  newDiagram: 'New Diagram',
  where: (directory: string): string => `Kept in \`${directory}\`.`,
  notLookedFor: 'No Diagram is looked for until `.arch/config.yml` can be read.',
  draft:
    'Nothing is declared yet: a Diagram shows declared Components, and its Drift waits for the declaration.',
  unreadable: 'cannot be read',
  driftCount: (count: number): string =>
    `${count} ${many(count, 'Drift', 'Drifts')}: where the Diagram and the code differ`,
  analysing: 'The code is being analysed: the Drift follows.',
  failed: (reason: string): string => `The Diagrams cannot be read: ${reason}`,

  empty: {
    title: 'No Diagram yet',
    lead: 'A Diagram is a picture of Components and the External Systems they use, kept as a file beside the code and compared with it. Start one from a level of the Components: they are placed, and the connections the code has are drawn.'
  },
  select: 'Select a Diagram in the sidebar.',

  /** The head of the canvas. */
  tools: 'Tools of the Diagram',
  addComponent: 'Add Component',
  addComponentLabel: 'Component to add',
  findComponent: 'Find a Component…',
  everyComponentShown: 'Every Component of this level is in the Diagram.',
  noComponentHere:
    'This level shows no Components: a system context shows the repository as one box.',
  addExternal: 'Add External System',
  externalName: 'Name',
  externalDescription: 'Description',
  externalId: 'ID',
  externalIdHint: 'Its ID in the Diagram: lowercase letters, digits and dashes.',
  add: 'Add',
  undo: 'Undo',
  undoHint: 'Take back the last change that is not saved',
  exportSvg: 'Export SVG',
  exportHint: (picture: string): string =>
    `Write the picture of the Diagram as \`${picture}\` beside it, through a preview.`,
  saveFirst: 'Save the changes first: the picture is drawn from the file.',
  saveHint: 'Write the changes into the file of the Diagram, through a preview of its lines.',
  unsaved: (count: number): string => `${count} ${many(count, 'change', 'changes')} not saved`,
  changedOnDisk: (reason: string): string =>
    `The file changed on disk, and the changes that are not saved no longer fit it: ${reason}`,
  gone: (path: string): string => `${path} is no longer there.`,
  discardChanges: 'Discard the changes',

  /** The canvas. */
  canvas: (title: string): string => `The Diagram ${title}`,
  connectFrom: (name: string): string => `Draw a connection from ${name}`,
  labelOf: (from: string, to: string): string => `Label of the connection from ${from} to ${to}`,
  leftOutHint: (from: string, to: string): string =>
    `In the code ${from} depends on ${to}, and the Diagram leaves it out. Click to draw it.`,
  howToRead:
    'An arrow points at what is used. Drag a box to move it, on a grid of 20 px. Drag from the dot on the right of a selected box to another box to connect them; double-click a connection to label it.',
  legend: 'Legend',
  kinds: {
    component: 'Component',
    external: 'External System',
    repository: 'This repository'
  } satisfies Record<ElementKind, string>,
  connection: 'Connection',
  notInCode: 'Drift: not in the code',
  perhapsNotInCode: 'Drift: perhaps not in the code',
  leftOut: 'Drift: in the code, left out; a click draws it',

  /** The list beside the canvas: what the Diagram says, as sentences, then its Drift. */
  says: 'What the Diagram says',
  saysNothing: 'The Diagram shows nothing yet.',
  isElement: (name: string, kind: ElementKind, description: string | undefined): string =>
    `${name} is ${kind === 'component' ? 'a Component' : kind === 'external' ? 'an External System' : 'this repository'}${description === undefined ? '.' : `: ${description}`}`,
  uses: (from: string, to: string, label: string | undefined): string =>
    `${from} uses ${to}${label === undefined || label.trim() === '' ? '.' : `: ${label.trim()}`}`,
  drift: 'Drift',
  noDrift: 'No Drift: the Diagram and the code agree.',
  draftNoDrift: 'No Drift on a Draft: it is said against a declaration.',
  draw: 'Draw it',
  problems: 'Problems',

  /** The detail: the selected element or connection, or the Diagram. */
  diagram: 'Diagram',
  levels: {
    'system-context': 'System context',
    container: 'Container view',
    component: 'Component view'
  } satisfies Record<ViewLevel, string>,
  levelOf: (level: ViewLevel | undefined, scope: string | undefined): string =>
    level === undefined
      ? 'No view level'
      : level === 'component' && scope !== undefined
        ? `Component view of ${scope}`
        : DIAGRAMS_LEVELS[level],
  file: 'File',
  description: 'Description',
  noDescription: 'No description.',
  fromDeclaration:
    'Its name and description are those of its declaration in `.arch/components.yml`.',
  name: 'Name',
  connections: 'Connections',
  noConnections: 'No connection.',
  openInStructure: 'Open in Structure',
  remove: 'Remove from the Diagram',
  connectTo: 'Connect to',
  findElement: 'Find an element…',
  everyConnected: 'It uses every other element already.',
  labelField: 'Label',
  dependencies: (count: number): string =>
    `In the code: ${count} ${many(count, 'Dependency', 'Dependencies')} between their Source Files.`,
  noDependencies: 'The code has no Dependency behind it.',
  notAnalysedYet: 'What the code has behind it follows once the code is analysed.',
  repair: 'Repair',
  byHand: 'The suite cannot know what was meant here. Fix the file in an editor; the view follows.',

  /** The dialog of a new Diagram. */
  new: {
    title: 'New Diagram',
    level: 'View level',
    scope: 'Scope',
    scopeHint: 'The Component the view looks into: its parts are shown.',
    noScope: 'No declared Component has parts to look into.',
    name: 'Title',
    id: 'ID',
    idHint: 'The name of its file: lowercase letters, digits and dashes.',
    looking: 'Asking the code for the connections between them…',
    shows: (components: number, connections: number): string =>
      `It shows ${components} ${many(components, 'Component', 'Components')} and draws the ${connections} ${many(connections, 'connection', 'connections')} the code has between them, placed as Structure lays them out.`,
    showsRepository: 'It shows this repository as one box. Add the External Systems it uses.',
    noComponents:
      'Nothing is declared yet: declare the Components first, and the Diagram shows them.',
    create: 'Create'
  },

  /** The previews. */
  review: {
    save: {
      action: 'Save',
      title: (id: string): string => `Save the Diagram ${id}`,
      refused: (id: string): string => `Cannot save the Diagram ${id}`
    },
    export: {
      action: 'Export',
      title: (picture: string): string => `Export ${picture}`,
      refused: (id: string): string => `Cannot export the Diagram ${id}`,
      current: (picture: string): string =>
        `${picture} is the picture of the Diagram as it is: there is nothing to write.`
    },
    repair: {
      action: 'Repair',
      title: (id: string): string => `Repair the Diagram ${id}`,
      refused: (id: string): string => `Cannot repair the Diagram ${id}`
    },
    create: {
      action: 'Create',
      title: (id: string): string => `Create the Diagram ${id}`,
      refused: 'The Diagram cannot be created'
    },
    edit: (id: string): string => `Cannot change the Diagram ${id}`,
    discard: {
      title: 'Discard the changes to the Diagram?',
      reason: (id: string): string =>
        `The changes to ${id} have not been saved. Going on now loses them.`,
      action: 'Discard changes'
    }
  },

  /** In the Problems of the repository, in the search, and on the page of a Component. */
  settings: 'Settings',
  backToDiagrams: 'Back to the Diagram',
  diagramKind: 'Diagram',
  shownIn: 'Diagrams',
  shownInNone: 'No Diagram shows it.'
}

const DIAGRAMS_LEVELS: Record<ViewLevel, string> = DIAGRAMS_EN.levels
