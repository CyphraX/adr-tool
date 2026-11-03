import type { ElementKind, ViewLevel } from '@adr-tool/diagrams'
import type { DIAGRAMS_EN } from './strings.diagrams.en'

/**
 * What the Diagrams module of the window says in German: the shape of strings.diagrams.en.ts.
 * The words of the glossary are Diagramm, Element, Externes System, Verbindung, vorgeschlagene
 * Verbindung, Drift und Export; what a file writes — container, scope — stays as it writes it.
 */

const many = (count: number, one: string, more: string): string => (count === 1 ? one : more)

const LEVELS: Record<ViewLevel, string> = {
  'system-context': 'Systemkontext',
  container: 'Containersicht',
  component: 'Komponentensicht'
}

const KIND_IN_A_SENTENCE: Record<ElementKind, string> = {
  component: 'eine Komponente',
  external: 'ein Externes System',
  repository: 'dieses Repository'
}

export const DIAGRAMS_DE: typeof DIAGRAMS_EN = {
  label: 'Diagramme',
  heading: 'Diagramme',
  newDiagram: 'Neues Diagramm',
  where: (directory: string): string => `Abgelegt in \`${directory}\`.`,
  notLookedFor: 'Nach Diagrammen wird erst gesucht, wenn sich `.arch/config.yml` lesen lässt.',
  draft:
    'Noch ist nichts deklariert: Ein Diagramm zeigt deklarierte Komponenten, und seine Drift wartet auf die Deklaration.',
  unreadable: 'nicht lesbar',
  driftCount: (count: number): string =>
    `${count} ${many(count, 'Drift', 'Drifts')}: wo Diagramm und Code voneinander abweichen`,
  analysing: 'Der Code wird analysiert, die Drift folgt.',
  failed: (reason: string): string => `Die Diagramme lassen sich nicht lesen: ${reason}`,

  empty: {
    title: 'Noch kein Diagramm',
    lead: 'Ein Diagramm ist ein Bild von Komponenten und den Externen Systemen, die sie benutzen, als Datei neben dem Code abgelegt und mit ihm verglichen. Beginnen Sie eines mit einer Ebene der Komponenten: Sie werden platziert, und die Verbindungen, die der Code hat, werden gezeichnet.'
  },
  select: 'Wählen Sie links ein Diagramm aus.',

  tools: 'Werkzeuge des Diagramms',
  addComponent: 'Komponente hinzufügen',
  addComponentLabel: 'Hinzuzufügende Komponente',
  findComponent: 'Komponente suchen …',
  everyComponentShown: 'Jede Komponente dieser Ebene ist im Diagramm.',
  noComponentHere:
    'Diese Ebene zeigt keine Komponenten: Ein Systemkontext zeigt das Repository als einen Kasten.',
  addExternal: 'Externes System hinzufügen',
  externalName: 'Name',
  externalDescription: 'Beschreibung',
  externalId: 'ID',
  externalIdHint: 'Seine ID im Diagramm: Kleinbuchstaben, Ziffern und Bindestriche.',
  add: 'Hinzufügen',
  undo: 'Rückgängig',
  undoHint: 'Die letzte Änderung zurücknehmen, die nicht gespeichert ist',
  exportSvg: 'SVG exportieren',
  exportHint: (picture: string): string =>
    `Das Bild des Diagramms als \`${picture}\` daneben schreiben, über eine Vorschau.`,
  saveFirst: 'Speichern Sie zuerst die Änderungen: Das Bild wird aus der Datei gezeichnet.',
  saveHint: 'Die Änderungen in die Datei des Diagramms schreiben, über eine Vorschau ihrer Zeilen.',
  unsaved: (count: number): string =>
    `${count} ${many(count, 'Änderung', 'Änderungen')} nicht gespeichert`,
  changedOnDisk: (reason: string): string =>
    `Die Datei hat sich auf der Festplatte geändert, und die nicht gespeicherten Änderungen passen nicht mehr dazu: ${reason}`,
  gone: (path: string): string => `${path} ist nicht mehr da.`,
  discardChanges: 'Änderungen verwerfen',

  canvas: (title: string): string => `Das Diagramm ${title}`,
  connectFrom: (name: string): string => `Eine Verbindung von ${name} ziehen`,
  labelOf: (from: string, to: string): string => `Beschriftung der Verbindung von ${from} zu ${to}`,
  leftOutHint: (from: string, to: string): string =>
    `Im Code hängt ${from} von ${to} ab, und das Diagramm lässt es aus. Ein Klick zeichnet die Verbindung.`,
  howToRead:
    'Ein Pfeil zeigt auf das, was benutzt wird. Ziehen Sie einen Kasten, um ihn zu verschieben, auf einem Raster von 20 px. Ziehen Sie vom Punkt rechts an einem ausgewählten Kasten zu einem anderen, um beide zu verbinden; ein Doppelklick auf eine Verbindung beschriftet sie.',
  legend: 'Legende',
  kinds: {
    component: 'Komponente',
    external: 'Externes System',
    repository: 'Dieses Repository'
  },
  connection: 'Verbindung',
  notInCode: 'Drift: nicht im Code',
  perhapsNotInCode: 'Drift: vielleicht nicht im Code',
  leftOut: 'Drift: im Code, ausgelassen; ein Klick zeichnet sie',

  says: 'Was das Diagramm sagt',
  saysNothing: 'Das Diagramm zeigt noch nichts.',
  isElement: (name: string, kind: ElementKind, description: string | undefined): string =>
    `${name} ist ${KIND_IN_A_SENTENCE[kind]}${description === undefined ? '.' : `: ${description}`}`,
  uses: (from: string, to: string, label: string | undefined): string =>
    `${from} benutzt ${to}${label === undefined || label.trim() === '' ? '.' : `: ${label.trim()}`}`,
  drift: 'Drift',
  noDrift: 'Keine Drift: Diagramm und Code stimmen überein.',
  draftNoDrift: 'Auf einem Entwurf gibt es keine Drift: Sie wird gegen eine Deklaration gesagt.',
  draw: 'Zeichnen',
  problems: 'Probleme',

  diagram: 'Diagramm',
  levels: LEVELS,
  levelOf: (level: ViewLevel | undefined, scope: string | undefined): string =>
    level === undefined
      ? 'Keine Ebene'
      : level === 'component' && scope !== undefined
        ? `Komponentensicht von ${scope}`
        : LEVELS[level],
  file: 'Datei',
  description: 'Beschreibung',
  noDescription: 'Keine Beschreibung.',
  fromDeclaration: 'Name und Beschreibung sind die seiner Deklaration in `.arch/components.yml`.',
  name: 'Name',
  connections: 'Verbindungen',
  noConnections: 'Keine Verbindung.',
  openInStructure: 'In Struktur öffnen',
  remove: 'Aus dem Diagramm nehmen',
  connectTo: 'Verbinden mit',
  findElement: 'Element suchen …',
  everyConnected: 'Es benutzt schon jedes andere Element.',
  labelField: 'Beschriftung',
  dependencies: (count: number): string =>
    `Im Code: ${count} ${many(count, 'Abhängigkeit', 'Abhängigkeiten')} zwischen ihren Quelldateien.`,
  noDependencies: 'Im Code steht keine Abhängigkeit dahinter.',
  notAnalysedYet: 'Was im Code dahintersteht, folgt, sobald der Code analysiert ist.',
  repair: (problem: { kind: string; component?: string }): string =>
    problem.kind === 'component-gone'
      ? `${problem.component ?? ''} aus dem Diagramm nehmen`
      : 'Das Bild neu exportieren',
  byHand:
    'Die Suite kann nicht wissen, was hier gemeint war. Korrigieren Sie die Datei in einem Editor; die Ansicht folgt.',

  new: {
    title: 'Neues Diagramm',
    level: 'Ebene',
    scope: 'Scope',
    scopeHint: 'Die Komponente, in die die Sicht hineinsieht: Ihre Teile werden gezeigt.',
    noScope: 'Keine deklarierte Komponente hat Teile, in die sich hineinsehen ließe.',
    name: 'Titel',
    id: 'ID',
    idHint: 'Der Name seiner Datei: Kleinbuchstaben, Ziffern und Bindestriche.',
    looking: 'Der Code wird nach den Verbindungen zwischen ihnen gefragt …',
    shows: (components: number, connections: number): string =>
      `Es zeigt ${components} ${many(components, 'Komponente', 'Komponenten')} und zeichnet ${connections === 1 ? 'die eine Verbindung' : `die ${connections} Verbindungen`}, die der Code zwischen ihnen hat, angeordnet, wie die Struktur sie anordnet.`,
    showsRepository:
      'Es zeigt dieses Repository als einen Kasten. Fügen Sie die Externen Systeme hinzu, die es benutzt.',
    noComponents:
      'Noch ist nichts deklariert: Deklarieren Sie zuerst die Komponenten, dann zeigt das Diagramm sie.',
    create: 'Anlegen'
  },

  review: {
    save: {
      action: 'Speichern',
      title: (id: string): string => `Das Diagramm ${id} speichern`,
      refused: (id: string): string => `Das Diagramm ${id} kann nicht gespeichert werden`
    },
    export: {
      action: 'Exportieren',
      title: (picture: string): string => `${picture} exportieren`,
      refused: (id: string): string => `Das Diagramm ${id} kann nicht exportiert werden`,
      current: (picture: string): string =>
        `${picture} ist das Bild des Diagramms, wie es ist: Es gibt nichts zu schreiben.`
    },
    repair: {
      action: 'Reparieren',
      title: (id: string): string => `Das Diagramm ${id} reparieren`,
      refused: (id: string): string => `Das Diagramm ${id} kann nicht repariert werden`
    },
    create: {
      action: 'Anlegen',
      title: (id: string): string => `Das Diagramm ${id} anlegen`,
      refused: 'Das Diagramm kann nicht angelegt werden'
    },
    edit: (id: string): string => `Das Diagramm ${id} kann nicht geändert werden`,
    discard: {
      title: 'Änderungen am Diagramm verwerfen?',
      reason: (id: string): string =>
        `Die Änderungen an ${id} sind nicht gespeichert. Wenn Sie jetzt weitergehen, gehen sie verloren.`,
      action: 'Änderungen verwerfen'
    }
  },

  settings: 'Einstellungen',
  backToDiagrams: 'Zurück zum Diagramm',
  diagramKind: 'Diagramm',
  shownIn: 'Diagramme',
  shownInNone: 'Kein Diagramm zeigt sie.'
}
