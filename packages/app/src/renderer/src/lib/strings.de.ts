import type { RelationState, RelationType } from '@adr-tool/core'
import type { Decision } from '../../../shared/ipc'
import type { MetricKey, MetricWording, ReviewWording, en } from './strings.en'
import type { Refusal } from './views'

/**
 * What the window says in German (docs/plan-roadmap.md, part 12): the same shape as
 * strings.en.ts, which explains how the texts are arranged. The words of the domain stay
 * the tool's own — ADR, Decision Log, Status, Relation, Trace, Frontmatter — and the rest is
 * said as German says it: Metadaten, Rückverweis, Reparatur, Korrektur, Vorlage, Komponente,
 * Entwurf, Quelldatei, Abhängigkeit, Zyklus.
 */

const many = (count: number, one: string, more: string): string => (count === 1 ? one : more)

/** A count as the window writes it: 9.115. */
const count = (value: number): string => value.toLocaleString('de')

/** What a line of the Relations graph says, read out, with the verb where German puts it. */
const LINE: Record<RelationType, (from: string, to: string) => string> = {
  supersedes: (from, to) => `${from} ersetzt ${to}`,
  amends: (from, to) => `${from} ergänzt ${to}`,
  'depends-on': (from, to) => `${from} hängt von ${to} ab`,
  'relates-to': (from, to) => `${from} bezieht sich auf ${to}`
}

export const de: typeof en = {
  cancel: 'Abbrechen',
  close: 'Schließen',
  save: 'Speichern',
  search: 'Suchen',
  backToAdrs: 'Zurück zu den ADRs',
  problemCount: (count: number): string => `${count} ${many(count, 'Problem', 'Probleme')}`,
  neverTookEffect: 'nie wirksam geworden',

  welcome: {
    noRepository: 'Kein Repository geöffnet',
    noRepositoryLead:
      'Öffnen Sie den Ordner eines git-Repositorys, um seine Architecture Decision Records zu lesen.',
    badConfiguration: 'Die ADR-Konfiguration dieses Repositorys ist nicht verwendbar',
    partOfConfiguration: 'Ein Teil der ADR-Konfiguration dieses Repositorys ist nicht verwendbar:',
    noAdrs: (repository: string): string => `Keine ADRs in ${repository} gefunden`,
    whereItLooks:
      'Softarch Suite sucht nach `.adr/config.yml`, dann nach `.adr-dir` von adr-tools, dann nach den Ordnern `docs/adr`, `doc/adr` und `docs/decisions`. Sobald einer davon da ist, erscheinen die ADRs hier.',
    orStartHere: 'Oder beginnen Sie hier: Das erste ADR wird in `docs/adr` angelegt.',
    createFirst: 'Erstes ADR anlegen',
    selectToRead: 'Wählen Sie ein ADR, um es zu lesen.',
    selectToSeeProblems: 'Wählen Sie ein ADR, um zu sehen, was daran nicht stimmt.'
  },

  panes: {
    sidebar: 'Breite der Seitenleiste',
    middle: 'Breite des mittleren Bereichs'
  },

  modules: {
    label: 'Module',
    decisions: 'Entscheidungen',
    structure: 'Struktur'
  },

  tabs: {
    label: 'Geöffnete Repositorys',
    open: 'Repository öffnen',
    close: (repository: string): string => `${repository} schließen`
  },

  language: {
    label: 'Sprache des Fensters',
    system: 'Systemsprache',
    names: { en: 'English', de: 'Deutsch' }
  },

  sidebar: {
    label: 'Decision Logs und Filter',
    logs: 'Decision Logs',
    root: '(Wurzel des Repositorys)',
    status: 'Status',
    all: 'Alle',
    views: 'Ansichten',
    graph: 'Relationsgraph',
    timeline: 'Zeitachse',
    timelineHint: 'Die ADRs nach den Tagen, an denen sie angelegt und entschieden wurden',
    board: 'Board',
    boardHint:
      'Die ADRs nach Status; ziehen Sie eines, um es anzunehmen, abzulehnen, als veraltet zu markieren oder zu ersetzen',
    dashboard: 'Dashboard',
    dashboardHint: 'Das Decision Log in Zahlen: Status, Probleme, wartende Vorschläge, Komponenten',
    check: 'Prüfen',
    problems: 'Probleme',
    migrate: 'Migrieren',
    branch: 'Branch',
    branchHint: 'Der ausgecheckte Branch und die ADR-Dateien mit nicht committeten Änderungen',
    detached: 'losgelöster HEAD',
    uncommitted: (files: number): string => `${files} nicht committet`,
    export: 'Export',
    exportSite: 'Webseiten …',
    exportSiteHint:
      'Jedes Decision Log als Webseiten in einem Ordner: ein Index nach Status und eine Seite je ADR, die sich ohne Server in jedem Browser öffnen',
    exportPdf: 'PDF …',
    exportPdfHint: 'Jedes ADR in einem PDF, ein ADR pro Seite',
    branches: 'Branches',
    otherBranches: 'Andere Branches',
    otherBranchesHint:
      'ADRs, die nicht ausgecheckte Branches hinzufügen oder entscheiden, aus git gelesen, ohne etwas auszuchecken',
    together: 'Geöffnete Repositorys',
    allAdrs: 'Alle ADRs',
    allAdrsHint: 'Die ADRs aller geöffneten Repositorys in einer Liste',
    allProblems: 'Alle Probleme',
    allProblemsHint: 'Die Probleme aller geöffneten Repositorys in einer Liste'
  },

  together: {
    adrs: 'Alle ADRs der geöffneten Repositorys',
    problems: 'Alle Probleme der geöffneten Repositorys',
    count: (adrs: number, repositories: number): string =>
      `${many(adrs, 'Ein ADR', `${adrs} ADRs`)} in ${repositories} Repositorys`,
    noProblems: 'Keine Probleme in einem der geöffneten Repositorys.',
    noneHere: 'Keine Probleme.',
    repository: 'Das Repository selbst',
    hint: 'Wählen Sie ein ADR, um es zu lesen: Das Repository, zu dem es gehört, kommt nach vorn.'
  },

  repositoryProblems: {
    entry: 'Repository-Probleme',
    entryHint:
      'Alle Probleme dieses Repositorys in einer Liste: seiner Decision Logs, der Deklaration seiner Komponenten und der Traces dazwischen',
    counting:
      'Die Struktur analysiert den Code noch; ihre Probleme werden gezählt, sobald sie fertig ist.',
    asOf: (at: number): string =>
      `Gezählt mit der Analyse des Codes um ${new Date(at).toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })} Uhr. Beim Öffnen der Liste wird er erneut analysiert.`,
    asOfShort: (at: number): string =>
      `Stand der Analyse des Codes um ${new Date(at).toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })} Uhr.`,
    check: 'Prüfen',
    heading: 'Probleme des Repositorys',
    lead: 'Alle Probleme, die die Suite in diesem Repository kennt. Ein Klick öffnet, worum es geht, in seinem Modul; eine Reparatur sehen Sie, bevor etwas geschrieben wird.',
    none: 'Keine Probleme in diesem Repository.',
    noneHere: 'Keine Probleme.',
    traces: 'Traces von ADRs zu Komponenten',
    backToStructure: 'Zurück zu den Komponenten',
    declaration: 'Die Deklaration',
    component: 'Komponente',
    reading:
      'Die Struktur analysiert den Code. Was sie an Problemen findet, folgt, sobald sie fertig ist.',
    again: 'Die Struktur analysiert den Code erneut: Dies sind die Probleme ihrer letzten Analyse.',
    failed: (reason: string): string => `Die Struktur konnte den Code nicht analysieren: ${reason}`,
    draft:
      'Noch ist nichts deklariert: Was die Prüfungen am Entwurf finden, sind Hinweise, die die Struktur neben ihm zeigt.',
    byHand:
      'Die Suite kann nicht wissen, was hier gemeint war. Korrigieren Sie `.arch/components.yml` in einem Editor; die Ansicht folgt.'
  },

  diagram: {
    cannotDraw: (said: string): string =>
      `Dieses Mermaid-Diagramm lässt sich nicht zeichnen. Mermaid sagt: ${said}`,
    cannotDrawAtAll: 'Dieses Mermaid-Diagramm lässt sich nicht zeichnen.',
    source: 'Mermaid-Quelltext'
  },

  export: {
    exporting: 'Wird exportiert …',
    siteTitle: 'Als Webseiten exportiert',
    pdfTitle: 'Als PDF exportiert',
    done: (adrs: number, path: string): string =>
      `${adrs} ${adrs === 1 ? 'ADR' : 'ADRs'} nach ${path} exportiert.`,
    open: 'Öffnen',
    refused: 'Export nicht möglich'
  },

  timeline: {
    label: 'Zeitachse der ADRs',
    lead: 'Jedes ADR vom Tag, an dem es angelegt wurde, bis zum Tag seiner Entscheidung. Ein vorgeschlagenes ADR läuft bis heute weiter.',
    empty: 'Kein ADR dieses Decision Logs nennt ein Datum.',
    undated: (count: number): string =>
      `${count} ${many(count, 'ADR nennt', 'ADRs nennen')} kein Datum:`,
    span: (created: string | undefined, decided: string | undefined, waiting: boolean): string =>
      [
        created && `angelegt ${created}`,
        decided && `entschieden ${decided}`,
        waiting && 'wartet auf eine Entscheidung'
      ]
        .filter(Boolean)
        .join(', '),
    month: (date: string, withYear: boolean): string => {
      const name = new Date(`${date}T00:00:00Z`).toLocaleString('de', {
        month: 'short',
        timeZone: 'UTC'
      })
      return withYear ? `${name} ${date.slice(0, 4)}` : name
    }
  },

  board: {
    label: 'Board der ADRs nach Status',
    lead: 'Ziehen Sie ein ADR in einen anderen Status. Jeder Zug ist eine Operation des Werkzeugs, und Sie sehen die Änderung, bevor etwas geschrieben wird.',
    empty: 'Keines',
    drop: {
      accept: 'Ablegen zum Annehmen',
      reject: 'Ablegen zum Ablehnen',
      deprecate: 'Ablegen, um es als veraltet zu markieren',
      supersede: 'Ablegen, um ein ADR zu schreiben, das es ersetzt'
    },
    refusedTitle: (prefix: string): string => `ADR ${prefix} kann nicht dorthin`,
    refused: {
      foreign:
        'Es ist in einem fremden Format geschrieben, das das Werkzeug liest und nie schreibt. Migrieren Sie es zuerst.',
      unmigratable:
        'Es ist in einem fremden Format geschrieben, das das Werkzeug liest und nie schreibt, und lässt sich so, wie es ist, nicht migrieren: sein Kopf sagt, warum. Ändern Sie seine Datei von Hand.',
      unreadable: 'Sein Frontmatter ist nicht lesbar. Beheben Sie das zuerst.',
      unknown: 'Sein Status ist keiner der fünf Werte. Korrigieren Sie zuerst den Status.',
      undecided: 'Ein vorgeschlagenes ADR wird zuerst angenommen oder abgelehnt.',
      decided:
        'Eine Entscheidung wird nicht zurückgenommen. Ein angenommenes oder veraltetes ADR wird durch ein neues ersetzt, und ein angenommenes kann als veraltet markiert werden.',
      rejected:
        'Ein abgelehntes ADR bleibt abgelehnt. Schreiben Sie stattdessen einen neuen Vorschlag.',
      superseded: 'Ein ersetztes ADR bleibt ersetzt.'
    } satisfies Record<Refusal, string>
  },

  dashboard: {
    label: 'Dashboard des Decision Logs',
    total: (count: number): string => `${count} ${many(count, 'ADR', 'ADRs')}`,
    byStatus: 'Nach Status',
    problems: 'Probleme',
    noProblems: 'Keine Probleme.',
    problemCount: (count: number): string =>
      `${count} ${many(count, 'Problem', 'Probleme')} anzusehen`,
    showProblems: 'Probleme zeigen',
    waiting: 'Wartet auf eine Entscheidung',
    noneWaiting: 'Kein ADR ist vorgeschlagen.',
    days: (days: number | undefined): string =>
      days === undefined ? 'kein Datum' : `${days} ${many(days, 'Tag', 'Tage')}`,
    median: (days: number): string =>
      `Die Hälfte davon wartet seit höchstens ${days} ${many(days, 'Tag', 'Tagen')}.`,
    recent: 'Letzte Entscheidungen',
    noneDecided: 'Kein ADR nennt den Tag seiner Entscheidung.',
    components: 'Betroffene Komponenten',
    noComponents: 'Kein ADR nennt eine Komponente, die es betrifft.',
    withoutComponent: (count: number): string =>
      `${count} ${many(count, 'angenommenes ADR nennt', 'angenommene ADRs nennen')} keine Komponente.`,
    adrCount: (count: number): string => `${count} ${many(count, 'ADR', 'ADRs')}`
  },

  branches: {
    label: 'ADRs auf anderen Branches',
    lead: 'Was nicht ausgecheckte Branches im Vergleich zu diesem hinzufügen oder entscheiden. Aus git gelesen; nichts wird ausgecheckt.',
    refresh: 'Aktualisieren',
    asking: 'git wird gefragt …',
    none: 'Kein anderer Branch fügt ein ADR hinzu oder entscheidet eines, das dieser Branch nicht hat.',
    failed: 'git konnte die Branches nicht auflisten.',
    unread: (names: string): string =>
      `git konnte nicht jedes ADR von ${names} lesen: Was sie hinzufügen oder entscheiden, wird nicht gezeigt.`,
    also: (names: string): string => `auch ${names}`,
    lastCommit: (date: string): string => `letzter Commit ${date}`,
    added: 'neu',
    addedHint: 'Dieser Branch hat kein ADR mit dieser ID.',
    here: (status: string): string => `hier ${status}`,
    sameNumber: (ids: string): string => `Nummer hier vergeben an ${ids}`,
    sameNumberHint:
      'Beide ADRs haben diese Nummer. Das von beiden, das als zweites gemergt wird, muss umnummeriert werden.',
    select: 'Wählen Sie ein ADR, um es so zu lesen, wie sein Branch es hat.',
    reading: 'Das ADR wird aus git gelesen …',
    gone: 'Dieses ADR ist nicht mehr auf dem Branch.',
    readOnly: (branch: string): string =>
      `Wie auf ${branch}, aus git gelesen. Checken Sie den Branch aus, um es zu ändern.`
  },

  list: {
    label: 'ADRs',
    searchKey: { mac: '⌘K', other: 'Strg K' },
    newAdr: 'Neues ADR',
    number: 'Nr.',
    date: 'Datum',
    title: 'Titel',
    status: 'Status',
    decided: 'Entschieden',
    empty: 'Dieses Decision Log hat noch keine ADRs.',
    noneWithStatus: 'Kein ADR hat diesen Status.',
    uncommitted: 'Nicht committete Änderungen'
  },

  detail: {
    adr: 'ADR',
    uncommitted: 'nicht committete Änderungen',
    uncommittedHint: 'Diese Datei hat Änderungen, die noch nicht committet sind',
    supersede: 'Ersetzen',
    amend: 'Ergänzen',
    edit: 'Bearbeiten',
    metadata: 'Metadaten',
    migrate: 'Migrieren',
    history: 'Verlauf',
    commit: 'Committen',
    created: 'Angelegt',
    decided: 'Entschieden',
    decisionMakers: 'Entscheidende',
    tags: 'Tags',
    relations: 'Relationen',
    affects: 'Betrifft',
    components: 'Komponenten',
    notDeclared: 'keine deklarierte Komponente',
    showComponent: (name: string): string => `${name} in der Struktur zeigen`,
    corrections: 'Korrekturen',
    corrected: 'Korrigiert',
    showChange: 'Änderung zeigen',
    problems: 'Probleme',
    otherRepositories: 'Relationen zu anderen Repositorys',
    repositoryNotOpen: (repository: string): string => `${repository} ist nicht geöffnet`,
    notInRepository: (repository: string): string => `nicht in ${repository}`,
    showIn: (repository: string): string => `In ${repository} zeigen`
  },

  editor: {
    layout: 'Aufteilung des Editors',
    source: 'Quelltext',
    split: 'Quelltext und Vorschau',
    live: 'Live',
    correction: 'Korrektur',
    notePlaceholder: 'Was haben Sie korrigiert? z. B. Rechtschreibung',
    discard: 'Verwerfen',
    missing:
      'Die Datei dieses ADRs ist nicht mehr auf der Festplatte. Ihr Text ist noch hier; kopieren Sie ihn, wenn Sie ihn brauchen.',
    changedOnDisk:
      'Diese Datei hat sich auf der Festplatte geändert, während Sie sie bearbeitet haben. Speichern ist angehalten, bis Sie wählen: Ihren Text behalten, der beim Speichern ersetzt, was auf der Festplatte steht — die Vorschau zeigt genau was —, oder die Datei laden und Ihren Text verlieren.',
    keepMine: 'Meinen Text behalten',
    loadFromDisk: 'Datei von der Festplatte laden',
    correctionHint:
      'Dieses ADR ist nicht mehr vorgeschlagen, also hält Speichern eine Korrektur fest. Eine Korrektur ändert nie, was ein Leser als entschieden verstehen würde.'
  },

  diff: {
    newFile: ' — neue Datei',
    renamedOnly: 'Die Datei wird umbenannt. Ihr Text ändert sich nicht.',
    wasRenamedOnly: 'Die Datei wurde umbenannt. Ihr Text hat sich nicht geändert.'
  },

  commit: {
    title: (prefix: string): string => `ADR ${prefix} committen`,
    asking: 'git wird gefragt, was committet würde …',
    summary: (files: number, others: number): string =>
      `Das committet ${many(files, 'eine Datei so, wie sie', `${files} Dateien so, wie sie`)} auf der Festplatte ${many(files, 'steht', 'stehen')}, und nichts sonst.${
        others === 0
          ? ''
          : ` ${many(others, 'Eine andere geänderte Datei bleibt, wie sie ist', `${others} andere geänderte Dateien bleiben, wie sie sind`)}, ob gestaged oder nicht.`
      }`,
    related: 'Auch die ADRs committen, die es nennt oder die es nennen',
    relatedHint:
      'Wer ein ADR annimmt, schreibt den Rückverweis in das ADR, das es ersetzt oder ergänzt. Getrennt committet, enthielte der Verlauf dazwischen ein Problem.',
    message: 'Nachricht',
    hooks:
      'git committet wie auf der Kommandozeile: mit den Hooks dieses Repositorys und Ihrer Signatur, wenn Sie sie eingerichtet haben. Nichts wird gepusht.',
    action: 'Committen',
    committing: 'Wird committet …',
    again: 'Erneut versuchen',
    committed: (sha: string): string => `Committet als ${sha.slice(0, 7)}.`,
    detached:
      'HEAD ist losgelöst: Der Commit landet auf keinem Branch. Legen Sie danach dort einen Branch an, um ihn zu behalten.',
    madeButSaid: (sha: string, said: string): string =>
      `Committet als ${sha.slice(0, 7)}. Nach dem Commit sagte git:\n\n${said}`
  },

  history: {
    title: (prefix: string): string => `Verlauf von ADR ${prefix}`,
    asking: 'git wird gefragt …',
    unknown:
      'git weiß nichts über diese Datei: Der Ordner ist kein git-Repository, git ist nicht installiert, oder die Datei wurde nie committet.',
    correctionNotFound:
      'Kein Commit dieser Datei hält diese Korrektur so fest, wie sie jetzt lautet. Das ist der ganze Verlauf der Datei.',
    commits: 'Commits',
    onDisk: 'auf der Festplatte',
    renamedFrom: (fileName: string): string => `umbenannt von ${fileName}`,
    gone: 'git kann diese Änderung nicht mehr zeigen. Die Datei oder der Commit ist weg.',
    reading: 'Die Änderung wird gelesen …'
  },

  metadata: {
    title: (prefix: string): string => `Metadaten von ADR ${prefix}`,
    decisionMakers: 'Entscheidende',
    decisionMakersPlaceholder: 'Ein Name, dann Enter',
    tags: 'Tags',
    tagsPlaceholder: 'Ein Tag, dann Enter',
    about: {
      supersedes: 'Ersetzt jene Entscheidung als Ganzes, sobald dieses ADR angenommen ist.',
      amends:
        'Präzisiert oder erweitert einen Teil jener Entscheidung, sobald dieses ADR angenommen ist.',
      'depends-on': 'Diese Entscheidung gilt nur, solange jene gilt.',
      'relates-to': 'Lohnt sich zusammen zu lesen.'
    } satisfies Record<RelationType, string>,
    notInLog: (id: string): string =>
      id.includes('/')
        ? `${id} — nicht in diesem Repository`
        : `${id} — nicht in diesem Decision Log`,
    remove: (item: string): string => `${item} entfernen`,
    addTo: (list: string): string => `Zu ${list} hinzufügen`,
    noneLeft: 'Kein ADR mehr zum Hinzufügen',
    pickerPlaceholder: 'Ein ADR hinzufügen: Nummer oder Titel',
    components: 'Komponenten',
    componentsAbout: 'Die Teile des Codes, die diese Entscheidung betrifft.',
    notDeclared: (id: string): string => `${id} — keine deklarierte Komponente`,
    noComponentLeft: 'Keine Komponente mehr zum Hinzufügen',
    componentPlaceholder: 'Eine Komponente hinzufügen: Name oder ID',
    noDeclaration:
      'Komponenten lassen sich nennen, sobald sie deklariert sind. Übernehmen Sie zuerst den Entwurf in der Struktur-Ansicht.',
    hintDecided:
      'Was dieses ADR ersetzt oder ergänzt, wurde mit seiner Entscheidung festgelegt. Status und Daten ändern sich über die Aktionen des ADRs, nie hier.',
    hintProposed: 'Status und Daten ändern sich über die Aktionen des ADRs, nie hier.',
    review: 'Änderungen ansehen'
  },

  newAdr: {
    heading: 'Neues ADR',
    supersedes: (prefix: string): string => `Neues ADR, das ADR ${prefix} ersetzt`,
    amends: (prefix: string): string => `Neues ADR, das ADR ${prefix} ergänzt`,
    aboutSupersedes: (title: string): string =>
      `Es ersetzt die Entscheidung „${title}“ als Ganzes. Jenes ADR bleibt, wie es ist, bis das neue angenommen ist; dann wird es ersetzt.`,
    aboutAmends: (title: string): string =>
      `Es präzisiert oder erweitert einen Teil von „${title}“. Jenes ADR behält seinen Status; sobald das neue angenommen ist, verweist es darauf.`,
    title: 'Titel',
    titlePlaceholder: 'Was entschieden wird, in wenigen Worten',
    template: 'Vorlage',
    ofRepository: ' (dieses Repository)',
    hint: 'Das ADR beginnt als vorgeschlagen. Das Werkzeug gibt ihm die nächste Nummer und seinen Dateinamen; Sie sehen die Datei, bevor sie geschrieben wird.',
    create: 'Anlegen'
  },

  problems: {
    heading: 'Probleme',
    none: 'Keine Probleme in diesem Decision Log.'
  },

  structure: {
    label: 'Komponenten und was die Analyse gefunden hat',
    components: 'Komponenten',
    declared: 'Deklariert in `.arch/components.yml`.',
    draft:
      'Ein Entwurf, abgeleitet aus Build-Dateien und Ordnern, weil noch nichts deklariert ist. Er ist ein Vorschlag: Nichts wird geschrieben, bis Sie ihn übernehmen.',
    adopt: 'Entwurf übernehmen',
    adoptHint:
      'Schreibt diese Komponenten in `.arch/components.yml`. Sie sehen die Datei, bevor sie geschrieben wird.',
    code: 'Code',
    sourceFiles: (count: number): string => many(count, 'Eine Quelldatei', `${count} Quelldateien`),
    testFiles: (count: number): string => many(count, 'davon ein Test', `davon ${count} Tests`),
    dependencies: (count: number): string =>
      many(count, 'Eine Abhängigkeit', `${count} Abhängigkeiten`),
    libraries: (count: number): string => many(count, 'Eine Bibliothek', `${count} Bibliotheken`),
    analysedIn: (milliseconds: number): string =>
      `Analysiert in ${(milliseconds / 1000).toLocaleString('de', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`,
    lowerBound: {
      java: 'Java wird ohne Classpath gelesen, daher sind seine Abhängigkeiten eine Untergrenze: Reflection, voll qualifizierte Namen im Code und Member, die von einem Typ geerbt werden, den eine Datei nicht nennt, werden nicht gesehen.',
      python:
        'Python wird gelesen, ohne es auszuführen, daher sind seine Abhängigkeiten eine Untergrenze: Importe durch einen Aufruf von importlib oder __import__ werden nicht gesehen, und .pyi-Stubs werden nicht gelesen.',
      go: 'Go wird ohne den go-Befehl gelesen, daher sind seine Abhängigkeiten eine Untergrenze: Methodenaufrufe über Werte und Build-Constraints werden nicht verfolgt.'
    },
    includeTests: 'Testdateien einbeziehen',
    notResolved: 'Nicht aufgelöst',
    notAnalysed: 'Nicht analysiert',
    problems: 'Probleme',
    hints: 'Hinweise zum Entwurf',
    repair: 'Reparieren',
    analysing: 'Der Code dieses Repositorys wird analysiert …',
    failed: 'Der Code konnte nicht analysiert werden',

    graph: {
      label: 'Komponenten und die Abhängigkeiten zwischen ihnen',
      top: 'Alle Komponenten',
      way: 'Wo Sie sind',
      ownFiles: (name: string): string => `${name} (eigene Dateien)`,
      directory: (name: string): string => `${name}/`,
      unassigned: 'Nicht zugeordnet',
      files: (count: number): string => many(count, 'eine Datei', `${count} Dateien`),
      draft: 'Entwurf',
      howToRead:
        'Von links nach rechts lesen: Eine Komponente steht rechts von dem, wovon sie abhängt, und ihr Pfeil zeigt dorthin. Ein Doppelklick auf eine Komponente oder ein Verzeichnis zeigt seine Teile.',
      empty: 'Hier gibt es nichts zu zeigen: Keine Quelldatei liegt unter dieser Komponente.',
      legend: 'Was die Linien bedeuten',
      dependency: 'Abhängigkeit',
      typeOnly: 'nur Typen',
      inCycle: 'in einem Zyklus',
      weakest: 'schwächste Abhängigkeit eines Zyklus',
      weight: (count: number): string =>
        many(
          count,
          'Eine Abhängigkeit zwischen Quelldateien',
          `${count} Abhängigkeiten zwischen Quelldateien`
        )
    },

    views: {
      label: 'Diese Ebene zeigen als',
      graph: 'Graph',
      matrix: 'Matrix',
      metrics: 'Metriken',
      sequence: 'Hauptreihe'
    },

    metric: {
      files: {
        short: 'Dateien',
        long: 'Quelldateien',
        definition: 'Größe: die Quelldateien, die sie enthält.'
      },
      lines: {
        short: 'Zeilen',
        long: 'Zeilen',
        definition:
          'Größe: die Zeilen der Quelldateien, die sie enthält. Eine Datei hat so viele Zeilen wie Zeilenumbrüche, und eine mehr, wenn nach dem letzten noch Text folgt.'
      },
      efferent: {
        short: 'Ce',
        long: 'Efferente Kopplung, Ce',
        definition:
          'Efferente Kopplung, Ce: die Quelldateien innen, die von mindestens einer Quelldatei außen abhängen.'
      },
      afferent: {
        short: 'Ca',
        long: 'Afferente Kopplung, Ca',
        definition:
          'Afferente Kopplung, Ca: die Quelldateien außen, die von mindestens einer Quelldatei innen abhängen.'
      },
      instability: {
        short: 'I',
        long: 'Instabilität, I',
        definition:
          'Instabilität, I = Ce / (Ca + Ce): 0 ist maximal stabil, 1 maximal instabil. Undefiniert, wenn beide null sind.'
      },
      fanOut: {
        short: 'Fan-out',
        long: 'Fan-out',
        definition: 'Fan-out: die Komponenten mit demselben Elternteil, von denen diese abhängt.'
      },
      fanIn: {
        short: 'Fan-in',
        long: 'Fan-in',
        definition: 'Fan-in: die Komponenten mit demselben Elternteil, die von dieser abhängen.'
      },
      cohesion: {
        short: 'H',
        long: 'Relationale Kohäsion, H',
        definition:
          'Relationale Kohäsion, H = (R + 1) / N, mit N den Quelldateien innen und R den Abhängigkeiten zwischen ihnen.'
      },
      internalShare: {
        short: 'Intern',
        long: 'Interner Anteil',
        definition:
          'Interner Anteil: die Abhängigkeiten zwischen den Dateien innen, geteilt durch alle Abhängigkeiten, die innen beginnen oder enden. Undefiniert, wenn es keine gibt.'
      },
      abstractness: {
        short: 'A',
        long: 'Abstraktheit, A',
        definition:
          'Abstraktheit, A: die abstrakten Deklarationen unter allen, die sie deklariert — Interfaces, abstrakte Klassen, Typ-Aliase — gegenüber Klassen, Enums und Funktionen. 0 ist ganz konkret, 1 ganz abstrakt. Undefiniert, wenn sie nichts deklariert.'
      },
      distance: {
        short: 'D',
        long: 'Abstand von der Hauptreihe, D',
        definition:
          'Abstand von der Hauptreihe, D = |A + I − 1|: 0 auf der Linie von stabil und abstrakt zu instabil und konkret, 1 in einer Ecke — stabil und konkret, schwer zu ändern; oder instabil und abstrakt, ohne Nutzen. Undefiniert, wo A oder I es ist.'
      }
    } satisfies Record<MetricKey, MetricWording>,
    value: (key: MetricKey, value: number | undefined): string =>
      value === undefined
        ? '–'
        : key === 'instability' ||
            key === 'cohesion' ||
            key === 'abstractness' ||
            key === 'distance'
          ? value.toLocaleString('de', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : key === 'internalShare'
            ? `${Math.round(value * 100)} %`
            : count(value),
    undefinedValue: 'undefiniert: nichts, wodurch zu teilen wäre',

    metrics: {
      label: 'Die Metriken der Knoten dieser Ebene',
      node: 'Knoten',
      howToRead:
        'Jede Komponente wird an den Quelldateien gemessen, die sie enthält; außen ist alles andere, nicht zugeordnete Dateien eingeschlossen. Testdateien zählen nur, wenn sie einbezogen sind, Abhängigkeiten nur über Typen immer. Zeigen Sie auf eine Überschrift für ihre Definition. Eigene Dateien und Nicht zugeordnet haben eine Größe und keine weitere Metrik.',
      lowerBound: {
        java: 'Java wird ohne Classpath gelesen: Wo es Java gibt, sind diese Zahlen eine Untergrenze.',
        python:
          'Importe durch einen Aufruf werden in Python nicht gesehen: Wo es Python gibt, sind diese Zahlen eine Untergrenze.',
        go: 'Methodenaufrufe über Werte und Build-Constraints werden in Go nicht verfolgt: Wo es Go gibt, sind diese Zahlen eine Untergrenze.'
      },
      propagationCost: (value: number | undefined): string =>
        value === undefined
          ? 'Ausbreitungskosten dieser Ebene: undefiniert, sie hat weniger als zwei Knoten.'
          : `Ausbreitungskosten dieser Ebene: ${Math.round(value * 100)} %.`,
      propagationCostDefinition:
        'Ausbreitungskosten: unter allen geordneten Paaren von Knoten dieser Ebene, ohne Nicht zugeordnet, der Anteil, in dem der erste den zweiten über Abhängigkeiten erreicht — wie weit eine Änderung reichen kann. Ein Knoten zählt nicht als einer, der sich selbst erreicht.'
    },

    sequence: {
      label: 'Abstraktheit gegen Instabilität der Komponenten dieser Ebene',
      howToRead:
        'Jede Komponente ist ein Punkt: je weiter rechts, desto instabiler, je weiter oben, desto abstrakter. Die Hauptreihe ist die Diagonale von stabil und abstrakt zu instabil und konkret; je weiter eine Komponente von ihr liegt, desto größer ihr Abstand D. Unten links liegt die Zone des Schmerzes — stabil und konkret, schwer zu ändern; oben rechts die Zone der Nutzlosigkeit — abstrakt und von nichts genutzt.',
      instability: 'Instabilität, I',
      abstractness: 'Abstraktheit, A',
      line: 'Hauptreihe',
      pain: 'Zone des Schmerzes',
      uselessness: 'Zone der Nutzlosigkeit',
      list: 'Am weitesten von der Hauptreihe zuerst',
      point: (name: string, a: string, i: string, d: string): string =>
        `${name}: A ${a}, I ${i}, D ${d}`,
      none: 'Keine Komponente dieser Ebene hat sowohl eine Abstraktheit als auch eine Instabilität.',
      missing: (names: string): string =>
        `Nicht eingezeichnet, mangels Abstraktheit oder Instabilität: ${names}.`
    },

    matrix: {
      label: 'Die Abhängigkeitsmatrix dieser Ebene',
      howToRead:
        'Eine Zeile quer lesen: Eine Zahl sagt, wie viele Abhängigkeiten zwischen Quelldateien die Zeile auf die Spalte hat. Unter der Diagonale nutzt eine Zeile, was über ihr steht; über der Diagonale, in Rot, liegt, was einen Zyklus schließt. Ein Rahmen markiert die Zeilen eines Zyklus.',
      expand: (name: string): string => `${name} in seine Teile aufklappen`,
      collapse: (name: string): string => `${name} wieder zuklappen`,
      cell: (from: string, to: string, weight: number): string =>
        `${from} nutzt ${to}: ${many(weight, 'eine Abhängigkeit zwischen Quelldateien', `${weight} Abhängigkeiten zwischen Quelldateien`)}`,
      legend: 'Was die Zellen bedeuten',
      below: 'nutzt, was darüber steht',
      above: 'schließt einen Zyklus',
      cycle: 'die Zeilen eines Zyklus'
    },

    viewer: {
      label: 'Quelldatei',
      back: (show: 'graph' | 'matrix' | 'metrics' | 'sequence'): string =>
        ({
          graph: 'Zurück zum Graph',
          matrix: 'Zurück zur Matrix',
          metrics: 'Zurück zu den Metriken',
          sequence: 'Zurück zur Hauptreihe'
        })[show],
      marked: (lines: readonly number[]): string =>
        `${many(lines.length, 'Zeile', 'Zeilen')} ${lines.join(', ')} markiert`,
      reading: 'Die Datei wird gelesen …',
      readOnly: 'Nur lesen',
      open: (path: string): string => `${path} öffnen`,
      openAt: (path: string, line: number): string => `${path} in Zeile ${line} öffnen`
    },

    page: {
      component: 'Komponente',
      directory: 'Verzeichnis',
      id: 'ID',
      path: 'Pfad',
      notAComponent:
        'Ein Verzeichnis unter einer Komponente ohne Kinder: keine Komponente, also deklariert es nichts, kein ADR nennt es, und es hat keinen eigenen Namen. Seine Quelldateien gehören zur Komponente.',
      patterns: 'Muster',
      paths: 'Pfade',
      tests: 'Tests',
      none: 'keine',
      size: (files: number, lines: number): string =>
        `${many(files, 'Eine Quelldatei', `${count(files)} Quelldateien`)}, ${many(lines, 'eine Zeile', `${count(lines)} Zeilen`)}`,
      testFiles: (tests: number, counted: boolean): string =>
        counted
          ? many(tests, 'Davon ein Test', `Davon ${count(tests)} Tests`)
          : many(
              tests,
              'Eine Testdatei, nicht gezählt',
              `${count(tests)} Testdateien, nicht gezählt`
            ),
      empty: 'Sie enthält keine Quelldatei und hat daher keine Metriken.',
      files: 'Quelldateien',
      filesIn: (directory: string): string => `In \`${directory}\`:`,
      metrics: 'Metriken',
      functions: 'Komplexeste Funktionen',
      functionsHint:
        'Nach zyklomatischer Komplexität: 1 und eins mehr für jede Entscheidung, jede Sprache gezählt, wie ihr übliches Werkzeug sie zählt — ESLint für TypeScript und JavaScript (if, Schleife, case, catch, ?:, &&, ||, ??, ?., &&=, ||=, ??=, ein Vorgabewert), Checkstyle für Java, radon für Python, gocyclo für Go. Öffnen Sie eine, um sie zu lesen.',
      firstFunctions: (shown: number, total: number): string =>
        `Die ${shown} komplexesten von ${count(total)}.`,
      complexity: (value: number): string => `Komplexität ${value}`,
      noFunction: 'Keine Funktion in ihren Quelldateien.',
      classes: 'Klassen, deren Methoden zerfallen',
      classesHint:
        'LCOM4: die Gruppen von Methoden, die kein Feld teilen und keine Methode einer anderen Gruppe aufrufen. Mehr als eine, und die Klasse ließe sich teilen.',
      groups: (lcom4: number, methods: number): string =>
        `${lcom4} Gruppen aus ${methods} Methoden`,
      notMeasured: (files: string): string =>
        `Nicht von innen vermessen und darum hier nicht aufgeführt: ${files}. Das Vermessen schlug dort fehl; ihre Abhängigkeiten zählen trotzdem.`,
      cycles: 'Zyklen, zu denen sie gehört',
      noCycle: 'Keiner auf ihrer Ebene.',
      atItsLevel: 'Auf ihrer eigenen Ebene, unter den Komponenten neben ihr.',
      atItsDirectoryLevel:
        'Auf seiner eigenen Ebene, unter den Verzeichnissen und Quelldateien daneben.',
      decisions: 'Entscheidungen',
      noDecision: 'Kein ADR betrifft sie.',
      inside: (name: string): string => `über ${name}`,
      rename: 'Umbenennen',
      renameLabel: (name: string): string => `Neues Segment für ${name}`,
      renameHint: (id: string): string =>
        `Die ID ${id} ändert sich, und mit ihr die IDs der Komponenten darin. Jedes ADR, das eine davon nennt, wird in derselben Änderung umgeschrieben.`,
      notASegment:
        'Kleinbuchstaben, Ziffern und Bindestriche, am Anfang und Ende ein Buchstabe oder eine Ziffer.',
      preview: 'Vorschau'
    },

    detail: {
      label: 'Details',
      cycles: 'Zyklen',
      noCycles: 'Kein Zyklus auf dieser Ebene.',
      cycle: (members: number): string => `Ein Zyklus aus ${members}`,
      typeOnlyCycle: 'Nur über Typen: Zur Laufzeit gibt es ihn nicht.',
      roundTrip: 'Zum Beispiel',
      weakest: 'Schwächste Abhängigkeit',
      hint: 'Wählen Sie eine Komponente, um zu sehen, wovon sie abhängt und was sie nutzt, oder eine Linie, um die Abhängigkeiten zwischen Quelldateien dahinter zu sehen.',
      dependsOn: 'Hängt ab von',
      usedBy: 'Genutzt von',
      nothing: 'Nichts auf dieser Ebene.',
      showParts: 'Teile zeigen',
      sourceFile: 'Quelldatei',
      lines: (lines: readonly number[]): string =>
        `${many(lines.length, 'Zeile', 'Zeilen')} ${lines.join(', ')}`,
      lineWord: (count: number): string => many(count, 'Zeile', 'Zeilen'),
      typeOnly: 'nur Typen',
      notResolved: 'Nicht aufgelöste Verwendungen',
      notResolvedHint:
        'Ihr Ziel lässt sich nicht bestimmen, also sind sie weder eine Abhängigkeit noch die Verwendung einer Bibliothek. Die Suite rät nie.',
      firstOf: (shown: number, total: number): string => `Die ersten ${shown} von ${total}.`,
      notAnalysed: 'Dateien, die sich nicht parsen lassen',
      notAnalysedHint:
        'Sie behalten ihre Komponente und haben keine eigenen Abhängigkeiten, bis sie sich parsen lassen.',
      unreadable: 'konnte nicht gelesen werden',
      none: 'Keine.'
    }
  },

  graph: {
    heading: 'Relationen',
    empty:
      'Kein ADR dieses Decision Logs hat bisher eine Relation. Ersetzen oder ergänzen Sie ein ADR, oder fügen Sie in seinen Metadaten eine Relation hinzu, dann erscheint es hier.',
    howToRead:
      'Von links nach rechts lesen: Ein ADR steht rechts von dem, was es ersetzt, ergänzt oder wovon es abhängt, und sein Pfeil zeigt dorthin.',
    legend: 'Was die Linien bedeuten',
    proposed: 'vorgeschlagen',
    inLog: (log: string, title: string): string => `${title} — im Decision Log ${log}`,
    unrelated: (count: number): string =>
      many(
        count,
        'Ein ADR hat keine Relation und wird nicht gezeichnet.',
        `${count} ADRs haben keine Relation und werden nicht gezeichnet.`
      ),
    unrelatedShown: (count: number): string =>
      many(
        count,
        'Ein ADR hat keine Relation der gezeigten Typen und wird nicht gezeichnet.',
        `${count} ADRs haben keine Relation der gezeigten Typen und werden nicht gezeichnet.`
      ),
    noneShown:
      'Keine Relation der unten angehakten Typen. Haken Sie einen Typ an, um seine Relationen zu zeichnen.',
    filterHint: 'Die Relationen dieses Typs zeigen oder ausblenden',
    zoom: (mac: boolean): string =>
      `Größe der Zeichnung. ${mac ? '⌘' : 'Strg'} und das Mausrad ändern sie ebenfalls.`,
    smaller: 'Kleiner',
    larger: 'Größer',
    percent: (percent: number): string => `${percent} %`,
    actualSize: 'In Originalgröße zeigen',
    fit: 'Einpassen',
    fitHint: 'Die ganze Zeichnung im Bereich zeigen',
    spoken: 'Die Relationen in der Zeichnung',
    adrName: (prefix: string, title: string, log: string | undefined): string =>
      log === undefined ? `ADR ${prefix} (${title})` : `ADR ${prefix} (${title}) aus ${log}`,
    line: (from: string, type: RelationType, to: string, state: RelationState): string =>
      `${LINE[type](from, to)}${state === 'pending' ? ', vorgeschlagen' : state === 'void' ? ', nie wirksam geworden' : ''}`
  },

  searching: {
    label: 'ADRs, Komponenten und Quelldateien durchsuchen',
    placeholder: 'ADRs, Komponenten, Quelldateien suchen — oder die Nummer eines ADRs eingeben',
    found: 'Gefunden',
    adrs: 'ADRs',
    components: 'Komponenten',
    sourceFiles: 'Quelldateien',
    component: 'Komponente',
    sourceFile: 'Quelldatei',
    draft: 'Entwurf',
    unassigned: 'Nicht zugeordnet',
    more: (shown: number, all: number): string =>
      `Die besten ${shown} von ${all}. Ein weiteres Wort grenzt ein.`,
    moreOf: (shown: number, all: number): string => `Die besten ${shown} von ${all}.`,
    none: 'Nichts enthält alle diese Wörter.',
    analysing:
      'Die Struktur analysiert den Code noch; ihre Komponenten und Quelldateien werden durchsucht, sobald sie fertig ist.',
    analysingAgain:
      'Die Struktur analysiert den Code erneut; ihre Komponenten und Quelldateien werden durchsucht, wie sie sie zuletzt gefunden hat.',
    notAnalysed: (reason: string): string =>
      `Komponenten und Quelldateien werden nicht durchsucht: ${reason}`
  },

  review: {
    decision: {
      accept: {
        action: 'Annehmen',
        title: (prefix: string): string => `ADR ${prefix} annehmen`,
        refused: (prefix: string): string => `ADR ${prefix} kann nicht angenommen werden`
      },
      reject: {
        action: 'Ablehnen',
        title: (prefix: string): string => `ADR ${prefix} ablehnen`,
        refused: (prefix: string): string => `ADR ${prefix} kann nicht abgelehnt werden`
      },
      deprecate: {
        action: 'Als veraltet markieren',
        title: (prefix: string): string => `ADR ${prefix} als veraltet markieren`,
        refused: (prefix: string): string => `ADR ${prefix} kann nicht als veraltet markiert werden`
      }
    } satisfies Record<Decision, ReviewWording>,
    repair: {
      action: 'Reparieren',
      title: (prefix: string): string => `ADR ${prefix} reparieren`,
      refused: (prefix: string): string => `ADR ${prefix} kann nicht repariert werden`,
      caution: {
        lead: 'Bevor Sie reparieren:',
        advice:
          'Eine Reparatur nimmt als wahr, was die ADRs in supersedes und amends sagen. Wenn genau das falsch ist, brechen Sie ab und korrigieren Sie die Datei von Hand.'
      }
    } satisfies ReviewWording,
    renumber: {
      action: 'Umnummerieren',
      title: (prefix: string): string => `ADR ${prefix} umnummerieren`,
      refused: (prefix: string): string => `ADR ${prefix} kann nicht umnummeriert werden`,
      caution: {
        lead: 'Das Werkzeug ändert den Text eines ADRs nicht:',
        advice:
          'Ein Link im Text, der auf den alten Dateinamen zeigt, muss nach dem Umnummerieren von Hand geändert werden.'
      }
    } satisfies ReviewWording,
    migrate: {
      action: 'Migrieren',
      adr: (prefix: string): string => `ADR ${prefix} migrieren`,
      adrRefused: (prefix: string): string => `ADR ${prefix} kann nicht migriert werden`,
      log: (path: string): string => `Die ADRs von ${path} migrieren`,
      logRefused: (path: string): string => `Die ADRs von ${path} können nicht migriert werden`,
      caution: {
        lead: 'Was die Migration lässt, wie es ist:',
        advice:
          'Die Migration schreibt, was das Werkzeug aus diesen Dateien gelesen hat, und nichts, was es raten müsste. Was hier genannt ist, lässt sich von Hand richtigstellen, vorher oder danach.'
      }
    },
    create: {
      action: 'Anlegen',
      title: 'Das ADR anlegen',
      refused: 'Das ADR kann nicht angelegt werden'
    },
    adopt: {
      action: 'Übernehmen',
      title: 'Den Entwurf übernehmen',
      refused: 'Der Entwurf kann nicht übernommen werden'
    },
    rename: {
      action: 'Umbenennen',
      title: (from: string, to: string): string => `${from} in ${to} umbenennen`,
      refused: (id: string): string => `${id} kann nicht umbenannt werden`
    },
    structureRepair: {
      action: 'Reparieren',
      title: (component: string): string => `Die Deklaration von ${component} reparieren`,
      refused: (component: string): string =>
        `Die Deklaration von ${component} kann nicht repariert werden`
    },
    metadata: {
      title: (prefix: string): string => `Die Metadaten von ADR ${prefix} ändern`,
      refused: (prefix: string): string =>
        `Die Metadaten von ADR ${prefix} können nicht geändert werden`,
      unreadable: (prefix: string): string =>
        `Die Metadaten von ADR ${prefix} lassen sich nicht bearbeiten`,
      unreadableReason: (id: string): string =>
        `Das Frontmatter von ${id} ist nicht lesbar. Beheben Sie das, bevor das Werkzeug hineinschreibt.`
    },
    body: {
      title: (prefix: string): string => `ADR ${prefix} speichern`,
      refused: (prefix: string): string => `ADR ${prefix} kann nicht gespeichert werden`,
      caution: {
        lead: 'Das sieht nach mehr als einer Korrektur aus:',
        advice:
          'Wenn es ändert, was entschieden wurde, brechen Sie ab und schreiben Sie ein neues ADR, das dieses ergänzt oder ersetzt. Wenn nicht, speichern Sie.'
      }
    },
    notWritten: 'Die Änderung wurde nicht geschrieben',
    writtenInPart: 'Einige Dateien sind nicht, wie sie waren',
    discard: {
      title: 'Ihre Änderungen verwerfen?',
      reason:
        'Der Text im Editor ist nicht gespeichert. Wenn Sie den Editor jetzt verlassen, geht er verloren.',
      action: 'Änderungen verwerfen',
      stay: 'Weiter bearbeiten'
    },
    discardDialog: {
      title: 'Verwerfen, was Sie eingegeben haben?',
      reason:
        'Ein Dialog enthält, was Sie eingegeben haben, und es wurde nicht ausgeführt. Wenn Sie das Fenster jetzt schließen, geht es verloren.',
      action: 'Verwerfen und schließen'
    }
  }
}
