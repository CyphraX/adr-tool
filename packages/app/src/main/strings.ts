import type { Language } from '../shared/language'
import type { Stranded } from '@adr-tool/core'

/**
 * The texts the main process puts in front of a person: what it says when it refuses, the
 * title of the folder dialog, the entry of a history that is no commit yet — in the language
 * the window speaks, which the window says (`setLanguage`). The window's own texts are in the
 * renderer (lib/strings.ts, lib/wording.ts); what `core` says when it refuses an operation is
 * `core`'s, and the window words it by its code.
 */

/** `a`, `a and b`, `a, b and c`. */
const list = (items: readonly string[]): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

/** `a`, `a und b`, `a, b und c`. */
const liste = (items: readonly string[]): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} und ${items.at(-1)}`

/** What a file system said, as a sentence of its own: in its words, with a full stop. */
const sentence = (said: string): string => (/[.!?]$/.test(said) ? said : `${said}.`)

const en = {
  openRepository: 'Open repository',
  notCommittedYet: 'Not committed yet',
  notUnderstood: 'This request cannot be understood.',
  repositoryClosed: 'This repository is no longer open.',
  /** The Decision Log at the top of a repository has no path to name it by. */
  noLogAt: (logPath: string | undefined): string =>
    logPath
      ? `There is no Decision Log at ${logPath} any more.`
      : 'This Decision Log is not there any more.',
  changeGone: 'This change is no longer available.',
  analysisFailed: (reason: string): string =>
    `The code of this repository could not be analysed: ${reason}`,
  annotationsFailed: (reason: string): string =>
    `The Annotations of this repository could not be read: ${reason}`,
  /** Planning a change of the Rules file failed for a reason it has no refusal for. */
  planFailed: (reason: string): string => `Nothing could be planned: ${sentence(reason)}`,
  notASourceFile: (path: string): string =>
    `${path} is not a Source File of this repository, so it is not shown.`,
  sourceFileTooLarge: (path: string, megabytes: number): string =>
    `${path} is too large to show here: more than ${megabytes} MB.`,
  sourceFileUnreadable: (path: string): string =>
    `${path} cannot be read. It may have been moved or deleted since the code was analysed.`,
  /** The window named a file as a Diagram that the repository does not have as one. */
  notADiagram: (path: string): string =>
    `${path} is not one of the Diagrams of this repository, so nothing is planned for it.`,
  changedSincePreview: (files: string): string =>
    `Nothing was written: ${files} changed on disk after the preview was made. Try again to see the change against the current files.`,
  /**
   * A step of the change was refused, with what the file system said, and what was done is
   * undone (ADR-0015).
   */
  writeFailed: (error: string): string =>
    `Nothing was written. ${sentence(error)} Every file is as it was before.`,
  /** … and undoing failed too: each file that is not as it was, with where its text is kept. */
  writtenInPart: (error: string, stranded: readonly Stranded[]): string =>
    `The change is written in part. ${sentence(error)} Undoing it failed as well, and these files are not as they were: ${list(
      stranded.map(({ path, textAt }) =>
        textAt === undefined ? `${path}, which is new` : `${path}, whose text is now in ${textAt}`
      )
    )}. Put them back by hand before you try again.`,
  /** The menu of the app (menu.ts); `name` is the name of the app. */
  menu: {
    about: (name: string): string => `About ${name}`,
    hide: (name: string): string => `Hide ${name}`,
    hideOthers: 'Hide Others',
    unhide: 'Show All',
    quit: (name: string): string => `Quit ${name}`,
    file: 'File',
    exit: 'Exit',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    delete: 'Delete',
    selectAll: 'Select All',
    view: 'View',
    resetZoom: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    fullScreen: 'Toggle Full Screen',
    window: 'Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    front: 'Bring All to Front',
    close: 'Close Window'
  },
  /** The window is to unload — a reload, or a close nobody asked about — while it holds text. */
  unload: {
    message: 'Discard what is not saved?',
    detail:
      'The window holds text that has not been saved: in the editor, or in a dialog. Going on now loses it.',
    discard: 'Discard',
    keep: 'Keep editing'
  },
  commit: {
    noGit: 'This folder is not in a git repository, so there is nothing to commit to.',
    noAdr: (id: string): string => `There is no ADR ${id} in this Decision Log any more.`,
    nothing: (id: string): string => `${id} has no uncommitted changes.`,
    noMessage: 'A commit needs a message.',
    notInRepository: (path: string): string => `${path} is not a file of this repository.`,
    failed: 'git did not commit, and did not say why.',
    gone: 'This commit is no longer available. Try again.',
    changedSincePreview: (files: string): string =>
      `Nothing was committed: ${files} changed on disk after the preview was made. Try again to see what would be committed now.`,
    stillAnnounced: (files: string): string =>
      `git could not take ${files} out of the index again, where the app had announced them for the commit. \`git rm --cached\` with their paths does that; the files on disk stay as they are.`
  },
  export: {
    siteTitle: 'Export as web pages',
    siteButton: 'Export here',
    pdfTitle: 'Export as PDF',
    noLog: 'This repository has no Decision Log to export.',
    notDirectory: (path: string): string => `${path} is not a folder.`,
    notEmpty: (path: string): string =>
      `${path} is not empty, and no export was written there. Choose an empty folder, or one an earlier export wrote.`,
    link: (out: string, path: string): string =>
      `${path} in ${out} is a symbolic link, and the export writes nothing through one. Remove it, or choose another folder.`,
    inTheWay: (out: string, path: string): string =>
      `${path} in ${out} is in the way of the export. Remove it, or choose another folder.`
  },
  branches: {
    numberTaken: (number: number, branches: readonly string[], id: string): string =>
      `On the ${branches.length === 1 ? 'branch' : 'branches'} ${list(branches)}, ${id} has the number ${number} too. Whichever of the two is merged second has to be renumbered.`
  }
}

const de: typeof en = {
  openRepository: 'Repository öffnen',
  notCommittedYet: 'Noch nicht committet',
  notUnderstood: 'Diese Anfrage ist nicht zu verstehen.',
  repositoryClosed: 'Dieses Repository ist nicht mehr geöffnet.',
  noLogAt: (logPath: string | undefined): string =>
    logPath
      ? `Unter ${logPath} gibt es kein Decision Log mehr.`
      : 'Dieses Decision Log ist nicht mehr da.',
  changeGone: 'Diese Änderung ist nicht mehr verfügbar.',
  analysisFailed: (reason: string): string =>
    `Der Code dieses Repositorys ließ sich nicht analysieren: ${reason}`,
  annotationsFailed: (reason: string): string =>
    `Die Annotationen dieses Repositorys ließen sich nicht lesen: ${reason}`,
  planFailed: (reason: string): string => `Es ließ sich nichts planen: ${sentence(reason)}`,
  notASourceFile: (path: string): string =>
    `${path} ist keine Quelldatei dieses Repositorys und wird daher nicht gezeigt.`,
  sourceFileTooLarge: (path: string, megabytes: number): string =>
    `${path} ist zu groß, um hier gezeigt zu werden: mehr als ${megabytes} MB.`,
  sourceFileUnreadable: (path: string): string =>
    `${path} lässt sich nicht lesen. Vielleicht wurde die Datei verschoben oder gelöscht, seit der Code analysiert wurde.`,
  notADiagram: (path: string): string =>
    `${path} ist keines der Diagramme dieses Repositorys, daher wird dafür nichts geplant.`,
  changedSincePreview: (files: string): string =>
    `Nichts wurde geschrieben, denn seit der Vorschau hat sich auf der Festplatte etwas geändert: ${files}. Versuchen Sie es noch einmal, um die Änderung gegen die aktuellen Dateien zu sehen.`,
  writeFailed: (error: string): string =>
    `Nichts wurde geschrieben. ${sentence(error)} Jede Datei ist so, wie sie vorher war.`,
  writtenInPart: (error: string, stranded: readonly Stranded[]): string =>
    `Die Änderung ist nur zum Teil geschrieben. ${sentence(error)} Auch das Rückgängigmachen ist fehlgeschlagen, und diese Dateien sind nicht, wie sie waren: ${liste(
      stranded.map(({ path, textAt }) =>
        textAt === undefined
          ? `${path} (neu angelegt)`
          : `${path} (der frühere Text steht jetzt in ${textAt})`
      )
    )}. Stellen Sie sie von Hand wieder her, bevor Sie es noch einmal versuchen.`,
  menu: {
    about: (name: string): string => `Über ${name}`,
    hide: (name: string): string => `${name} ausblenden`,
    hideOthers: 'Andere ausblenden',
    unhide: 'Alle einblenden',
    quit: (name: string): string => `${name} beenden`,
    file: 'Datei',
    exit: 'Beenden',
    edit: 'Bearbeiten',
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    cut: 'Ausschneiden',
    copy: 'Kopieren',
    paste: 'Einsetzen',
    delete: 'Löschen',
    selectAll: 'Alles auswählen',
    view: 'Darstellung',
    resetZoom: 'Originalgröße',
    zoomIn: 'Vergrößern',
    zoomOut: 'Verkleinern',
    fullScreen: 'Vollbild ein/aus',
    window: 'Fenster',
    minimize: 'Minimieren',
    zoom: 'Zoomen',
    front: 'Alle nach vorne bringen',
    close: 'Fenster schließen'
  },
  unload: {
    message: 'Verwerfen, was nicht gespeichert ist?',
    detail:
      'Das Fenster enthält Text, der nicht gespeichert ist: im Editor oder in einem Dialog. Wenn Sie jetzt weitermachen, geht er verloren.',
    discard: 'Verwerfen',
    keep: 'Weiter bearbeiten'
  },
  commit: {
    noGit:
      'Dieser Ordner liegt in keinem git-Repository, es gibt also nichts, wohin committet werden könnte.',
    noAdr: (id: string): string => `In diesem Decision Log gibt es kein ADR ${id} mehr.`,
    nothing: (id: string): string => `${id} hat keine Änderungen, die nicht committet sind.`,
    noMessage: 'Ein Commit braucht eine Nachricht.',
    notInRepository: (path: string): string => `${path} ist keine Datei dieses Repositorys.`,
    failed: 'git hat nicht committet und nicht gesagt, warum.',
    gone: 'Dieser Commit ist nicht mehr verfügbar. Versuchen Sie es noch einmal.',
    changedSincePreview: (files: string): string =>
      `Nichts wurde committet, denn seit der Vorschau hat sich auf der Festplatte etwas geändert: ${files}. Versuchen Sie es noch einmal, um zu sehen, was jetzt committet würde.`,
    stillAnnounced: (files: string): string =>
      `git konnte ${files} nicht wieder aus dem Index nehmen, wo die App sie für den Commit angemeldet hatte. \`git rm --cached\` mit ihren Pfaden tut das; die Dateien auf der Festplatte bleiben, wie sie sind.`
  },
  export: {
    siteTitle: 'Als Webseiten exportieren',
    siteButton: 'Hierhin exportieren',
    pdfTitle: 'Als PDF exportieren',
    noLog: 'Dieses Repository hat kein Decision Log zum Exportieren.',
    notDirectory: (path: string): string => `${path} ist kein Ordner.`,
    notEmpty: (path: string): string =>
      `${path} ist nicht leer, und dort wurde kein Export geschrieben. Wählen Sie einen leeren Ordner oder einen, den ein früherer Export geschrieben hat.`,
    link: (out: string, path: string): string =>
      `${path} in ${out} ist ein symbolischer Link, und der Export schreibt durch keinen. Entfernen Sie ihn, oder wählen Sie einen anderen Ordner.`,
    inTheWay: (out: string, path: string): string =>
      `${path} in ${out} steht dem Export im Weg. Entfernen Sie es, oder wählen Sie einen anderen Ordner.`
  },
  branches: {
    numberTaken: (number: number, branches: readonly string[], id: string): string =>
      `Auf ${branches.length === 1 ? 'dem Branch' : 'den Branches'} ${liste(branches)} hat ${id} ebenfalls die Nummer ${number}. Welches der beiden als zweites gemergt wird, muss umnummeriert werden.`
  }
}

const TEXTS: Record<Language, typeof en> = { en, de }
let current: Language = 'en'

/** The language the window speaks; until it says, English. */
export function setLanguage(language: Language): void {
  current = language
}

/** The texts in the language of the window, looked up when they are said. */
export const t: typeof en = new Proxy(en, {
  get: (_, key) => TEXTS[current][key as keyof typeof en]
})
