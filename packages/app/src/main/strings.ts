import type { Language } from '../shared/language'

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
  notASourceFile: (path: string): string =>
    `${path} is not a Source File of this repository, so it is not shown.`,
  sourceFileTooLarge: (path: string, megabytes: number): string =>
    `${path} is too large to show here: more than ${megabytes} MB.`,
  sourceFileUnreadable: (path: string): string =>
    `${path} cannot be read. It may have been moved or deleted since the code was analysed.`,
  changedSincePreview: (files: string): string =>
    `Nothing was written: ${files} changed on disk after the preview was made. Try again to see the change against the current files.`,
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
  notASourceFile: (path: string): string =>
    `${path} ist keine Quelldatei dieses Repositorys und wird daher nicht gezeigt.`,
  sourceFileTooLarge: (path: string, megabytes: number): string =>
    `${path} ist zu groß, um hier gezeigt zu werden: mehr als ${megabytes} MB.`,
  sourceFileUnreadable: (path: string): string =>
    `${path} lässt sich nicht lesen. Vielleicht wurde die Datei verschoben oder gelöscht, seit der Code analysiert wurde.`,
  changedSincePreview: (files: string): string =>
    `Nichts wurde geschrieben: ${files} hat sich auf der Festplatte geändert, nachdem die Vorschau erstellt wurde. Versuchen Sie es noch einmal, um die Änderung gegen die aktuellen Dateien zu sehen.`,
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
      `Nichts wurde committet: ${files} hat sich auf der Festplatte geändert, nachdem die Vorschau erstellt wurde. Versuchen Sie es noch einmal, um zu sehen, was jetzt committet würde.`,
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
