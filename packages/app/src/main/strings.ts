/**
 * The texts the main process puts in front of a person: what it says when it refuses, the
 * title of the folder dialog, the entry of a history that is no commit yet. The window's own
 * texts are in the renderer (lib/strings.ts, lib/wording.ts); what `core` says when it
 * refuses an operation is `core`'s.
 */
export const t = {
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
  }
}
