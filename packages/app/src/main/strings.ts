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
  changedSincePreview: (files: string): string =>
    `Nothing was written: ${files} changed on disk after the preview was made. Try again to see the change against the current files.`
}
