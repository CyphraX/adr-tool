import type { RelationType } from '@adr-tool/core'
import type { Decision } from '../../../shared/ipc'

/**
 * Every text of the window that is not built from an ADR, a Problem or a change: labels,
 * hints, titles, questions. The sentences that are built from those are in wording.ts.
 * No component and no state carries English of its own, and nothing compares a text to
 * decide what to do — so a translation replaces these two files and searches for nothing.
 *
 * A text with a number or a name in it is a function, so that a language can put the
 * number where it wants it. A name between backticks is set in code (`codeSpans`).
 */

const many = (count: number, one: string, more: string): string => (count === 1 ? one : more)

export const t = {
  cancel: 'Cancel',
  close: 'Close',
  save: 'Save',
  search: 'Search',
  backToAdrs: 'Back to the ADRs',
  /** On the mark of an ADR with Problems, in the list and in the graph. */
  problemCount: (count: number): string => `${count} ${many(count, 'Problem', 'Problems')}`,
  neverTookEffect: 'never took effect',

  welcome: {
    noRepository: 'No repository open',
    noRepositoryLead:
      'Open the folder of a git repository to read its Architecture Decision Records.',
    badConfiguration: "This repository's ADR configuration cannot be used",
    noAdrs: (repository: string): string => `No ADRs found in ${repository}`,
    whereItLooks:
      "ADR Tool looks for `.adr/config.yml`, then for adr-tools' `.adr-dir`, then for the folders `docs/adr`, `doc/adr` and `docs/decisions`. As soon as one of them appears, the ADRs show up here.",
    orStartHere: 'Or start here: the first ADR is created in `docs/adr`.',
    createFirst: 'Create the first ADR',
    selectToRead: 'Select an ADR to read it.',
    selectToSeeProblems: 'Select an ADR to see what is wrong with it.'
  },

  tabs: {
    label: 'Open repositories',
    open: 'Open repository',
    close: (repository: string): string => `Close ${repository}`
  },

  sidebar: {
    label: 'Decision Logs and filters',
    logs: 'Decision Logs',
    root: '(repository root)',
    status: 'Status',
    all: 'All',
    relations: 'Relations',
    graph: 'Graph',
    check: 'Check',
    problems: 'Problems',
    migrate: 'Migrate',
    branch: 'Branch',
    branchHint: 'The branch that is checked out, and the ADR files with uncommitted changes',
    detached: 'detached HEAD',
    uncommitted: (files: number): string => `${files} uncommitted`
  },

  list: {
    label: 'ADRs',
    searchKey: { mac: '⌘K', other: 'Ctrl K' },
    newAdr: 'New ADR',
    number: 'No.',
    date: 'Date',
    title: 'Title',
    status: 'Status',
    decided: 'Decided',
    empty: 'This Decision Log has no ADRs yet.',
    noneWithStatus: 'No ADR has this Status.',
    uncommitted: 'Uncommitted changes'
  },

  detail: {
    adr: 'ADR',
    uncommitted: 'uncommitted changes',
    uncommittedHint: 'This file has changes that are not committed yet',
    supersede: 'Supersede',
    amend: 'Amend',
    edit: 'Edit',
    metadata: 'Metadata',
    migrate: 'Migrate',
    history: 'History',
    created: 'Created',
    decided: 'Decided',
    decisionMakers: 'Decision-makers',
    tags: 'Tags',
    relations: 'Relations',
    corrections: 'Corrections',
    corrected: 'Corrected',
    /** What a Correction records: its day, and who corrected what when the file says so. */
    correction: (date: string, author: string | undefined, note: string | undefined): string =>
      `${date}${author ? ` by ${author}` : ''}${note ? `: ${note}` : ''}`,
    showChange: 'Show the change',
    problems: 'Problems'
  },

  editor: {
    layout: 'Editor layout',
    source: 'Source',
    split: 'Source and preview',
    correction: 'Correction',
    notePlaceholder: 'What did you correct? e.g. Spelling',
    discard: 'Discard',
    missing:
      "This ADR's file is no longer on disk. Your text is still here; copy it if you need it.",
    changedOnDisk:
      'This file changed on disk while you were editing. Saving is paused until you choose: keep your text, which replaces what is on disk when you save — the preview shows exactly what — or load the file and lose your text.',
    keepMine: 'Keep my text',
    loadFromDisk: 'Load the file from disk',
    correctionHint:
      'This ADR is no longer proposed, so saving records a Correction. A Correction never changes what a reader would understand to have been decided.'
  },

  diff: {
    newFile: ' — new file',
    renamedOnly: 'The file is renamed. Its text does not change.',
    wasRenamedOnly: 'The file was renamed. Its text did not change.'
  },

  history: {
    title: (prefix: string): string => `History of ADR ${prefix}`,
    asking: 'Asking git …',
    unknown:
      'git knows nothing about this file: the folder is not a git repository, git is not installed, or the file has never been committed.',
    correctionNotFound:
      'No commit of this file records that Correction as it reads now. This is the whole history of the file.',
    commits: 'Commits',
    onDisk: 'on disk',
    renamedFrom: (fileName: string): string => `renamed from ${fileName}`,
    gone: 'git cannot show this change any more. The file or the commit is gone.',
    reading: 'Reading the change …'
  },

  metadata: {
    title: (prefix: string): string => `Metadata of ADR ${prefix}`,
    decisionMakers: 'Decision-makers',
    decisionMakersPlaceholder: 'A name, then Enter',
    tags: 'Tags',
    tagsPlaceholder: 'A tag, then Enter',
    /** What a Relation of each type says, next to its name. */
    about: {
      supersedes: 'Replaces that decision as a whole, once this ADR is accepted.',
      amends: 'Refines or extends part of that decision, once this ADR is accepted.',
      'depends-on': 'This decision only holds while that one does.',
      'relates-to': 'Worth reading together.'
    } satisfies Record<RelationType, string>,
    notInLog: (id: string): string => `${id} — not in this Decision Log`,
    remove: (item: string): string => `Remove ${item}`,
    addTo: (list: string): string => `Add to ${list}`,
    noneLeft: 'No ADR left to add',
    pickerPlaceholder: 'Add an ADR: number or title',
    hintDecided:
      'What this ADR supersedes or amends was fixed when it was decided. Status and dates change through the actions of the ADR, never here.',
    hintProposed: 'Status and dates change through the actions of the ADR, never here.',
    review: 'Review changes'
  },

  newAdr: {
    heading: 'New ADR',
    supersedes: (prefix: string): string => `New ADR that supersedes ADR ${prefix}`,
    amends: (prefix: string): string => `New ADR that amends ADR ${prefix}`,
    aboutSupersedes: (title: string): string =>
      `It replaces the decision of “${title}” as a whole. That ADR stays as it is until the new one is accepted; then it becomes superseded.`,
    aboutAmends: (title: string): string =>
      `It refines or extends part of “${title}”. That ADR keeps its Status; once the new one is accepted, it points to it.`,
    title: 'Title',
    titlePlaceholder: 'What is being decided, in a few words',
    template: 'Template',
    /** After the name of a Template that comes from the repository's own `.adr` folder. */
    ofRepository: ' (this repository)',
    hint: 'The ADR starts as proposed. The tool gives it the next number and its file name; you see the file before it is written.',
    create: 'Create'
  },

  problems: {
    heading: 'Problems',
    none: 'No Problems in this Decision Log.'
  },

  graph: {
    heading: 'Relations',
    empty:
      'No ADR of this Decision Log has a Relation yet. Supersede or amend an ADR, or add a Relation in its Metadata, and it shows up here.',
    howToRead:
      'Read it from left to right: an ADR stands to the right of what it supersedes, amends or depends on, and its arrow points there.',
    legend: 'What the lines mean',
    proposed: 'proposed',
    unrelated: (count: number): string =>
      many(
        count,
        'One ADR has no Relation and is not drawn.',
        `${count} ADRs have no Relation and are not drawn.`
      )
  },

  searching: {
    label: 'Search the ADRs',
    placeholder: 'Search titles, text, tags, people — or type a number',
    found: 'ADRs found',
    more: (shown: number, all: number): string =>
      `The best ${shown} of ${all}. Another word narrows it down.`,
    none: 'No ADR has all of these words.'
  },

  /** The dialog that shows a change before it is written, a refusal, or a question. */
  review: {
    decision: {
      accept: {
        action: 'Accept',
        title: (prefix: string): string => `Accept ADR ${prefix}`,
        refused: (prefix: string): string => `Cannot accept ADR ${prefix}`
      },
      reject: {
        action: 'Reject',
        title: (prefix: string): string => `Reject ADR ${prefix}`,
        refused: (prefix: string): string => `Cannot reject ADR ${prefix}`
      },
      deprecate: {
        action: 'Deprecate',
        title: (prefix: string): string => `Deprecate ADR ${prefix}`,
        refused: (prefix: string): string => `Cannot deprecate ADR ${prefix}`
      }
    } satisfies Record<Decision, unknown>,
    repair: {
      action: 'Repair',
      title: (prefix: string): string => `Repair ADR ${prefix}`,
      refused: (prefix: string): string => `Cannot repair ADR ${prefix}`,
      caution: {
        lead: 'Before you repair:',
        advice:
          'A Repair takes what the ADRs say in supersedes and amends as true. If that is what is wrong, cancel and fix the file by hand.'
      }
    },
    renumber: {
      action: 'Renumber',
      title: (prefix: string): string => `Renumber ADR ${prefix}`,
      refused: (prefix: string): string => `Cannot renumber ADR ${prefix}`,
      caution: {
        lead: 'The tool does not change the text of an ADR:',
        advice:
          'A link in the text that points to the old file name has to be changed by hand, after the Renumber.'
      }
    },
    migrate: {
      action: 'Migrate',
      adr: (prefix: string): string => `Migrate ADR ${prefix}`,
      adrRefused: (prefix: string): string => `Cannot migrate ADR ${prefix}`,
      log: (path: string): string => `Migrate the ADRs of ${path}`,
      logRefused: (path: string): string => `Cannot migrate the ADRs of ${path}`,
      caution: {
        lead: 'What Migration leaves as it is:',
        advice:
          'Migration writes what the tool read from these files, and nothing it would have to guess. What is named here can be put right by hand, before or afterwards.'
      }
    },
    create: {
      action: 'Create',
      title: 'Create the ADR',
      refused: 'The ADR cannot be created'
    },
    metadata: {
      title: (prefix: string): string => `Change the Metadata of ADR ${prefix}`,
      refused: (prefix: string): string => `Cannot change the Metadata of ADR ${prefix}`,
      unreadable: (prefix: string): string => `Cannot edit the Metadata of ADR ${prefix}`,
      unreadableReason: (id: string): string =>
        `The frontmatter of ${id} cannot be read. Fix it before the tool writes to it.`
    },
    body: {
      title: (prefix: string): string => `Save ADR ${prefix}`,
      refused: (prefix: string): string => `Cannot save ADR ${prefix}`,
      caution: {
        lead: 'This looks like more than a Correction:',
        advice:
          'If it changes what was decided, cancel and write a new ADR that amends or supersedes this one. If it does not, save.'
      }
    },
    notWritten: 'The change was not written',
    discard: {
      title: 'Discard your changes?',
      reason: 'The text in the editor has not been saved. Leaving the editor now loses it.',
      action: 'Discard changes',
      stay: 'Keep editing'
    }
  }
}
