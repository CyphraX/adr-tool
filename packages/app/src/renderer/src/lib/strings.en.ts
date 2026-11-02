import type { RelationState, RelationType } from '@adr-tool/core'
import type { Decision } from '../../../shared/ipc'
import type { Refusal } from './views'

/**
 * What the window itself says: labels, hints, titles, questions — by where they stand, so
 * the same English word may be here twice ("Status" heads a column and a filter) and a
 * language that needs two words has two places. What is said about the domain is in
 * wording.ts: what a Status, a Relation, a Problem, a Repair, a Correction or a change is
 * called, and the sentences built from them.
 *
 * No component and no state carries English of its own, nothing compares a text to decide
 * what to do, and nothing tells list items apart by their text — so a translation is a file
 * beside this one of the same shape (strings.de.ts), and searches for nothing.
 *
 * A text with a number or a name in it is a function, so that a language can put the
 * number where it wants it. A name between backticks is set in code (`codeSpans`).
 */

export interface Caution {
  lead: string
  advice: string
}

/** How an operation is called in the dialog that shows its change, or says why there is none. */
export interface ReviewWording {
  /** On the button that applies the change. */
  action: string
  title: (prefix: string) => string
  refused: (prefix: string) => string
  /** How the warnings of the change are introduced, and what to do about them. */
  caution?: Caution
}

const many = (count: number, one: string, more: string): string => (count === 1 ? one : more)

/** A count as the window writes it: 9,115. */
const count = (value: number): string => value.toLocaleString('en')

/** What a line of the Relations graph says, read out: "ADR 0003 (…) supersedes ADR 0001 (…)". */
const LINE_VERB: Record<RelationType, string> = {
  supersedes: 'supersedes',
  amends: 'amends',
  'depends-on': 'depends on',
  'relates-to': 'relates to'
}

/** The metrics of section 5 of the Structure format, as the window names and shows them. */
export const METRICS = [
  'files',
  'lines',
  'efferent',
  'afferent',
  'instability',
  'fanOut',
  'fanIn',
  'cohesion',
  'internalShare'
] as const
export type MetricKey = (typeof METRICS)[number]

export interface MetricWording {
  /** In the heading of a column. */
  short: string
  /** On the Component page. */
  long: string
  /** Its definition, in the tooltip of either. */
  definition: string
}

export const en = {
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
    partOfConfiguration: "Part of this repository's ADR configuration cannot be used:",
    noAdrs: (repository: string): string => `No ADRs found in ${repository}`,
    whereItLooks:
      "Softarch Suite looks for `.adr/config.yml`, then for adr-tools' `.adr-dir`, then for the folders `docs/adr`, `doc/adr` and `docs/decisions`. As soon as one of them appears, the ADRs show up here.",
    orStartHere: 'Or start here: the first ADR is created in `docs/adr`.',
    createFirst: 'Create the first ADR',
    selectToRead: 'Select an ADR to read it.',
    selectToSeeProblems: 'Select an ADR to see what is wrong with it.'
  },

  /** What the lines between the panes are called, for those who move them by keyboard. */
  panes: {
    sidebar: 'Width of the sidebar',
    middle: 'Width of the middle pane'
  },

  /** The modules of the suite, between which the window switches for the repository in front. */
  modules: {
    label: 'Modules',
    decisions: 'Decisions',
    structure: 'Structure'
  },

  tabs: {
    label: 'Open repositories',
    open: 'Open repository',
    close: (repository: string): string => `Close ${repository}`
  },

  language: {
    label: 'Language of the window',
    /** The choice that leaves it to the system's language. */
    system: 'System language',
    /** Each language by its own name. */
    names: { en: 'English', de: 'Deutsch' }
  },

  sidebar: {
    label: 'Decision Logs and filters',
    logs: 'Decision Logs',
    root: '(repository root)',
    status: 'Status',
    all: 'All',
    views: 'Views',
    graph: 'Relations graph',
    timeline: 'Timeline',
    timelineHint: 'The ADRs by the dates they were created and decided',
    board: 'Board',
    boardHint: 'The ADRs by Status; drag one to Accept, Reject, Deprecate or Supersede it',
    dashboard: 'Dashboard',
    dashboardHint: 'The Decision Log in figures: Status, Problems, waiting proposals, Components',
    check: 'Check',
    problems: 'Problems',
    migrate: 'Migrate',
    branch: 'Branch',
    branchHint: 'The branch that is checked out, and the ADR files with uncommitted changes',
    detached: 'detached HEAD',
    uncommitted: (files: number): string => `${files} uncommitted`,
    export: 'Export',
    exportSite: 'Web pages…',
    exportSiteHint:
      'Every Decision Log as web pages in a folder: an index by Status and a page per ADR, which open from disk in any browser',
    exportPdf: 'PDF…',
    exportPdfHint: 'Every ADR in one PDF, one ADR per page',
    branches: 'Branches',
    otherBranches: 'Other branches',
    otherBranchesHint:
      'ADRs that branches which are not checked out add or decide, read from git without checking anything out',
    together: 'Open repositories',
    allAdrs: 'Every ADR',
    allAdrsHint: 'The ADRs of every repository that is open, in one list',
    allProblems: 'Every Problem',
    allProblemsHint: 'The Problems of every repository that is open, in one list'
  },

  /** Every open repository at once (docs/plan-roadmap.md, part 13). */
  together: {
    adrs: 'Every ADR of the open repositories',
    problems: 'Every Problem of the open repositories',
    count: (adrs: number, repositories: number): string =>
      `${many(adrs, 'One ADR', `${adrs} ADRs`)} in ${repositories} repositories`,
    noProblems: 'No Problems in any open repository.',
    noneHere: 'No Problems.',
    repository: 'The repository itself',
    hint: 'Select an ADR to read it: the repository it belongs to comes to the front.'
  },

  /** Every Problem of the repository in front, of every module (docs/plan-vision.md, part 2). */
  repositoryProblems: {
    /** The row in the sidebar of every module that leads there. */
    entry: 'Repository Problems',
    entryHint:
      'Every Problem of this repository in one list: of its Decision Logs, of the declaration of its Components, and of the Traces between them',
    counting: 'Structure is still analysing the code: its Problems are counted once it is done.',
    check: 'Check',
    heading: 'Problems of the repository',
    lead: 'Every Problem the suite knows in this repository. A click opens what it is about, in its module; a Repair is previewed before anything is written.',
    none: 'No Problems in this repository.',
    noneHere: 'No Problems.',
    traces: 'Traces from ADRs to Components',
    backToStructure: 'Back to the Components',
    declaration: 'The declaration',
    component: 'Component',
    reading: 'Structure is analysing the code. Its Problems follow once it is done.',
    again: 'Structure is analysing the code again: these are the Problems of its last analysis.',
    failed: (reason: string): string => `Structure could not analyse the code: ${reason}`,
    draft:
      'Nothing is declared yet: what the checks find on the Draft are hints, which Structure shows beside it.',
    byHand:
      'The suite cannot know what was meant here. Fix `.arch/components.yml` in an editor; the view follows.'
  },

  /** A Mermaid block of an ADR, drawn in the preview and in the live mode. */
  diagram: {
    cannotDraw: (said: string): string =>
      `This Mermaid diagram cannot be drawn. Mermaid says: ${said}`,
    cannotDrawAtAll: 'This Mermaid diagram cannot be drawn.',
    /** Below a drawn block in the preview, as in the export: its text, for a screen reader too. */
    source: 'Mermaid source'
  },

  export: {
    exporting: 'Exporting…',
    siteTitle: 'Exported as web pages',
    pdfTitle: 'Exported as PDF',
    done: (adrs: number, path: string): string =>
      `${adrs} ${adrs === 1 ? 'ADR' : 'ADRs'} exported to ${path}.`,
    open: 'Open',
    refused: 'Cannot export'
  },

  timeline: {
    label: 'Timeline of the ADRs',
    lead: 'Each ADR from the day it was created to the day it was decided. A proposed ADR runs on to today.',
    empty: 'No ADR of this Decision Log names a date.',
    undated: (count: number): string =>
      `${count} ${many(count, 'ADR names', 'ADRs name')} no date:`,
    span: (created: string | undefined, decided: string | undefined, waiting: boolean): string =>
      [
        created && `created ${created}`,
        decided && `decided ${decided}`,
        waiting && 'waiting for a decision'
      ]
        .filter(Boolean)
        .join(', '),
    /** A month on the axis: its short name, and the year in January and on the first line. */
    month: (date: string, withYear: boolean): string => {
      const name = new Date(`${date}T00:00:00Z`).toLocaleString('en', {
        month: 'short',
        timeZone: 'UTC'
      })
      return withYear ? `${name} ${date.slice(0, 4)}` : name
    }
  },

  board: {
    label: 'Board of the ADRs by Status',
    lead: 'Drag an ADR to another Status. Each move is an operation of the tool, previewed before anything is written.',
    empty: 'None',
    drop: {
      accept: 'Drop to accept',
      reject: 'Drop to reject',
      deprecate: 'Drop to deprecate',
      supersede: 'Drop to write an ADR that supersedes it'
    },
    refusedTitle: (prefix: string): string => `ADR ${prefix} cannot move there`,
    refused: {
      foreign:
        'It is written in a foreign format, which the tool reads and never writes. Migrate it first.',
      unmigratable:
        'It is written in a foreign format, which the tool reads and never writes, and it cannot be migrated as it stands: its header says why. Change its file by hand.',
      unreadable: 'Its frontmatter cannot be read. Fix it first.',
      unknown: 'Its Status is none of the five values. Fix its Status first.',
      undecided: 'A proposed ADR is accepted or rejected first.',
      decided:
        'A decision is not taken back. An accepted or deprecated ADR is superseded by a new one, and an accepted one can be deprecated.',
      rejected: 'A rejected ADR stays rejected. Write a new proposal instead.',
      superseded: 'A superseded ADR stays superseded.'
    } satisfies Record<Refusal, string>
  },

  dashboard: {
    label: 'Dashboard of the Decision Log',
    total: (count: number): string => `${count} ${many(count, 'ADR', 'ADRs')}`,
    byStatus: 'By Status',
    problems: 'Problems',
    noProblems: 'No Problems.',
    problemCount: (count: number): string =>
      `${count} ${many(count, 'Problem', 'Problems')} to look at`,
    showProblems: 'Show the Problems',
    waiting: 'Waiting for a decision',
    noneWaiting: 'No ADR is proposed.',
    days: (days: number | undefined): string =>
      days === undefined ? 'no date' : `${days} ${many(days, 'day', 'days')}`,
    median: (days: number): string =>
      `Half of them have waited ${days} ${many(days, 'day', 'days')} or less.`,
    recent: 'Recent decisions',
    noneDecided: 'No ADR names the date it was decided.',
    components: 'Components affected',
    noComponents: 'No ADR names a Component it affects.',
    withoutComponent: (count: number): string =>
      `${count} accepted ${many(count, 'ADR names', 'ADRs name')} no Component.`,
    adrCount: (count: number): string => `${count} ${many(count, 'ADR', 'ADRs')}`
  },

  branches: {
    label: 'ADRs on other branches',
    lead: 'What branches that are not checked out add or decide, compared with this one. Read from git; nothing is checked out.',
    refresh: 'Refresh',
    asking: 'Asking git…',
    none: 'No other branch adds or decides an ADR that this branch does not have.',
    failed: 'Git could not list the branches.',
    unread: (names: string): string =>
      `Git could not read every ADR of ${names}: what they add or decide is not shown.`,
    also: (names: string): string => `also ${names}`,
    lastCommit: (date: string): string => `last commit ${date}`,
    added: 'new',
    addedHint: 'This branch has no ADR with this ID.',
    here: (status: string): string => `${status} here`,
    sameNumber: (ids: string): string => `Number taken here by ${ids}`,
    sameNumberHint:
      'Both ADRs have this number. Whichever of the two is merged second has to be renumbered.',
    select: 'Select an ADR to read it as its branch has it.',
    reading: 'Reading the ADR from git…',
    gone: 'This ADR is no longer on the branch.',
    readOnly: (branch: string): string =>
      `As on ${branch}, read from git. Check out the branch to change it.`
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
    commit: 'Commit',
    created: 'Created',
    decided: 'Decided',
    decisionMakers: 'Decision-makers',
    tags: 'Tags',
    relations: 'Relations',
    affects: 'Affects',
    components: 'Components',
    notDeclared: 'not a declared Component',
    showComponent: (name: string): string => `Show ${name} in Structure`,
    corrections: 'Corrections',
    corrected: 'Corrected',
    showChange: 'Show the change',
    problems: 'Problems',
    otherRepositories: 'Relations to other repositories',
    /** An ADR of another repository that cannot be shown: why not. */
    repositoryNotOpen: (repository: string): string => `${repository} is not open`,
    notInRepository: (repository: string): string => `not in ${repository}`,
    showIn: (repository: string): string => `Show it in ${repository}`
  },

  editor: {
    layout: 'Editor layout',
    source: 'Source',
    split: 'Source and preview',
    live: 'Live',
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

  commit: {
    title: (prefix: string): string => `Commit ADR ${prefix}`,
    asking: 'Asking git what would be committed …',
    summary: (files: number, others: number): string =>
      `This commits ${many(files, 'one file as it is', `${files} files as they are`)} on disk, and nothing else.${
        others === 0
          ? ''
          : ` ${many(others, 'One other changed file stays as it is', `${others} other changed files stay as they are`)}, staged or not.`
      }`,
    related: 'Also commit the ADRs it names or that name it',
    relatedHint:
      'Accepting an ADR writes the Back-reference into the ADR it supersedes or amends. Committed apart, the history would hold a Problem in between.',
    message: 'Message',
    hooks:
      "git commits as it does on the command line: with this repository's hooks and your signing, if you have set them up. Nothing is pushed.",
    action: 'Commit',
    committing: 'Committing …',
    again: 'Try again',
    committed: (sha: string): string => `Committed as ${sha.slice(0, 7)}.`,
    detached:
      'HEAD is detached: the commit goes on no branch. Create a branch at it afterwards to keep it.',
    madeButSaid: (sha: string, said: string): string =>
      `Committed as ${sha.slice(0, 7)}. After the commit, git said:\n\n${said}`
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
    notInLog: (id: string): string =>
      id.includes('/') ? `${id} — not in this repository` : `${id} — not in this Decision Log`,
    remove: (item: string): string => `Remove ${item}`,
    addTo: (list: string): string => `Add to ${list}`,
    noneLeft: 'No ADR left to add',
    pickerPlaceholder: 'Add an ADR: number or title',
    components: 'Components',
    componentsAbout: 'The parts of the code this decision affects.',
    notDeclared: (id: string): string => `${id} — not a declared Component`,
    noComponentLeft: 'No Component left to add',
    componentPlaceholder: 'Add a Component: name or ID',
    noDeclaration:
      'Components can be named once they are declared. Adopt the Draft in the Structure view first.',
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

  structure: {
    label: 'Components and what the analysis found',
    components: 'Components',
    declared: 'Declared in `.arch/components.yml`.',
    draft:
      'A Draft, derived from build files and folders because nothing is declared yet. It is a proposal: nothing is written until you adopt it.',
    adopt: 'Adopt the Draft',
    adoptHint:
      'Write these Components into `.arch/components.yml`. You see the file before it is written.',
    code: 'Code',
    sourceFiles: (count: number): string => many(count, 'One Source File', `${count} Source Files`),
    testFiles: (count: number): string =>
      many(count, 'one of them a test', `${count} of them tests`),
    dependencies: (count: number): string => many(count, 'One Dependency', `${count} Dependencies`),
    libraries: (count: number): string => many(count, 'One Library', `${count} Libraries`),
    analysedIn: (milliseconds: number): string =>
      `Analysed in ${(milliseconds / 1000).toFixed(1)} s`,
    javaLowerBound:
      'Java is read without a classpath, so its Dependencies are a lower bound: reflection, fully qualified names in code and members inherited from a type a file does not name are not seen.',
    includeTests: 'Include test files',
    notResolved: 'Not resolved',
    notAnalysed: 'Not analysed',
    problems: 'Problems',
    hints: 'Hints on the Draft',
    repair: 'Repair',
    analysing: 'Analysing the code of this repository …',
    failed: 'The code could not be analysed',

    graph: {
      label: 'Components and the Dependencies between them',
      top: 'All Components',
      way: 'Where you are',
      ownFiles: (name: string): string => `${name} (own files)`,
      directory: (name: string): string => `${name}/`,
      unassigned: 'Unassigned',
      files: (count: number): string => many(count, 'one file', `${count} files`),
      draft: 'Draft',
      howToRead:
        'Read it from left to right: a Component stands to the right of what it depends on, and its arrow points there. Double-click a Component or a directory to see its parts.',
      empty: 'There is nothing to show here: no Source File lies below this Component.',
      legend: 'What the lines mean',
      dependency: 'Dependency',
      typeOnly: 'type-only',
      inCycle: 'in a Cycle',
      weakest: 'weakest Dependency of a Cycle',
      weight: (count: number): string =>
        many(count, 'One Source File Dependency', `${count} Source File Dependencies`)
    },

    views: {
      label: 'Show this level as',
      graph: 'Graph',
      matrix: 'Matrix',
      metrics: 'Metrics'
    },

    metric: {
      files: {
        short: 'Files',
        long: 'Source Files',
        definition: 'Size: the Source Files it contains.'
      },
      lines: {
        short: 'Lines',
        long: 'Lines',
        definition:
          'Size: the lines of the Source Files it contains. A file has as many lines as line breaks, and one more when text follows the last one.'
      },
      efferent: {
        short: 'Ce',
        long: 'Efferent coupling, Ce',
        definition:
          'Efferent coupling, Ce: the Source Files inside that depend on at least one Source File outside.'
      },
      afferent: {
        short: 'Ca',
        long: 'Afferent coupling, Ca',
        definition:
          'Afferent coupling, Ca: the Source Files outside that depend on at least one Source File inside.'
      },
      instability: {
        short: 'I',
        long: 'Instability, I',
        definition:
          'Instability, I = Ce / (Ca + Ce): 0 is maximally stable, 1 maximally unstable. Undefined when both are zero.'
      },
      fanOut: {
        short: 'Fan-out',
        long: 'Fan-out',
        definition: 'Fan-out: the Components with the same parent that this one depends on.'
      },
      fanIn: {
        short: 'Fan-in',
        long: 'Fan-in',
        definition: 'Fan-in: the Components with the same parent that depend on this one.'
      },
      cohesion: {
        short: 'H',
        long: 'Relational cohesion, H',
        definition:
          'Relational cohesion, H = (R + 1) / N, with N the Source Files inside and R the Dependencies among them.'
      },
      internalShare: {
        short: 'Internal',
        long: 'Internal share',
        definition:
          'Internal share: the Dependencies among the files inside, divided by all Dependencies that start or end inside. Undefined when there are none.'
      }
    } satisfies Record<MetricKey, MetricWording>,
    /** A metric's value as a cell or the page shows it. */
    value: (key: MetricKey, value: number | undefined): string =>
      value === undefined
        ? '–'
        : key === 'instability' || key === 'cohesion'
          ? value.toFixed(2)
          : key === 'internalShare'
            ? `${Math.round(value * 100)} %`
            : count(value),
    undefinedValue: 'undefined: nothing to divide by',

    metrics: {
      label: 'The metrics of the nodes of this level',
      node: 'Node',
      howToRead:
        'Each Component is measured on the Source Files it contains; outside is everything else, Unassigned files included. Test files count only when they are included, type-only Dependencies always. Point at a heading for its definition. Own files and Unassigned have a size and no other metric.',
      javaLowerBound:
        'Java is read without a classpath: where there is Java, these numbers are a lower bound.'
    },

    matrix: {
      label: 'The dependency structure matrix of this level',
      howToRead:
        'Read a row across: a number is how many Source File Dependencies the row has on the column. Below the diagonal a row uses what stands above it; above the diagonal, in red, lies what closes a Cycle. A box marks the rows of a Cycle.',
      expand: (name: string): string => `Expand ${name} into its parts`,
      collapse: (name: string): string => `Fold ${name} back`,
      cell: (from: string, to: string, weight: number): string =>
        `${from} uses ${to}: ${many(weight, 'one Source File Dependency', `${weight} Source File Dependencies`)}`,
      legend: 'What the cells mean',
      below: 'uses what stands above',
      above: 'closes a Cycle',
      cycle: 'the rows of a Cycle'
    },

    viewer: {
      label: 'Source File',
      back: (show: 'graph' | 'matrix' | 'metrics'): string =>
        ({
          graph: 'Back to the graph',
          matrix: 'Back to the matrix',
          metrics: 'Back to the metrics'
        })[show],
      marked: (lines: readonly number[]): string =>
        `${many(lines.length, 'Line', 'Lines')} ${lines.join(', ')} marked`,
      reading: 'Reading the file …',
      readOnly: 'Read-only',
      open: (path: string): string => `Open ${path}`,
      openAt: (path: string, line: number): string => `Open ${path} at line ${line}`
    },

    page: {
      component: 'Component',
      directory: 'Directory',
      id: 'ID',
      path: 'Path',
      notAComponent:
        'A directory below a Component without children: no Component, so nothing declares it, no ADR names it and it has no name of its own. Its Source Files belong to the Component.',
      patterns: 'Patterns',
      paths: 'paths',
      tests: 'tests',
      none: 'none',
      size: (files: number, lines: number): string =>
        `${many(files, 'One Source File', `${count(files)} Source Files`)}, ${many(lines, 'one line', `${count(lines)} lines`)}`,
      testFiles: (tests: number, counted: boolean): string =>
        counted
          ? many(tests, 'One of them a test', `${count(tests)} of them tests`)
          : many(tests, 'One test file, left out', `${count(tests)} test files, left out`),
      empty: 'It contains no Source File, and so has no metrics.',
      files: 'Source Files',
      filesIn: (directory: string): string => `In \`${directory}\`:`,
      metrics: 'Metrics',
      cycles: 'Cycles it is part of',
      noCycle: 'None at its level.',
      atItsLevel: 'At its own level, among the Components beside it.',
      atItsDirectoryLevel: 'At its own level, among the directories and Source Files beside it.',
      decisions: 'Decisions',
      noDecision: 'No ADR affects it.',
      inside: (name: string): string => `through ${name}`,
      rename: 'Rename',
      renameLabel: (name: string): string => `New segment for ${name}`,
      renameHint: (id: string): string =>
        `The ID ${id} changes, and the IDs of the Components inside it with it. Every ADR that names one of them is rewritten in the same change.`,
      notASegment:
        'Lowercase letters, digits and dashes, starting and ending with a letter or a digit.',
      preview: 'Preview'
    },

    detail: {
      label: 'Details',
      cycles: 'Cycles',
      noCycles: 'No Cycle at this level.',
      cycle: (members: number): string => `A Cycle of ${members}`,
      typeOnlyCycle: 'Type-only: it does not exist at run time.',
      roundTrip: 'For example',
      weakest: 'Weakest Dependency',
      hint: 'Select a Component to see what it depends on and what uses it, or a line to see the Source File Dependencies behind it.',
      dependsOn: 'Depends on',
      usedBy: 'Used by',
      nothing: 'Nothing at this level.',
      showParts: 'Show its parts',
      sourceFile: 'Source File',
      lines: (lines: readonly number[]): string =>
        `${many(lines.length, 'line', 'lines')} ${lines.join(', ')}`,
      lineWord: (count: number): string => many(count, 'line', 'lines'),
      typeOnly: 'type-only',
      notResolved: 'Uses that are not resolved',
      notResolvedHint:
        'Their target cannot be determined, so they are neither a Dependency nor the use of a Library. The suite never guesses.',
      firstOf: (shown: number, total: number): string => `The first ${shown} of ${total}.`,
      notAnalysed: 'Files that cannot be parsed',
      notAnalysedHint:
        'They keep their Component and have no Dependencies of their own until they can be parsed.',
      unreadable: 'could not be read',
      none: 'None.'
    }
  },

  graph: {
    heading: 'Relations',
    empty:
      'No ADR of this Decision Log has a Relation yet. Supersede or amend an ADR, or add a Relation in its Metadata, and it shows up here.',
    howToRead:
      'Read it from left to right: an ADR stands to the right of what it supersedes, amends or depends on, and its arrow points there.',
    legend: 'What the lines mean',
    proposed: 'proposed',
    inLog: (log: string, title: string): string => `${title} — in the Decision Log ${log}`,
    unrelated: (count: number): string =>
      many(
        count,
        'One ADR has no Relation and is not drawn.',
        `${count} ADRs have no Relation and are not drawn.`
      ),
    /** … while some Relation types are left out. */
    unrelatedShown: (count: number): string =>
      many(
        count,
        'One ADR has no Relation of the types shown and is not drawn.',
        `${count} ADRs have no Relation of the types shown and are not drawn.`
      ),
    noneShown: 'No Relation of the types ticked below. Tick a type to draw its Relations.',
    filterHint: 'Show or hide the Relations of this type',
    /** The buttons that change the size of the drawing; on a Mac the key is ⌘. */
    zoom: (mac: boolean): string =>
      `Size of the drawing. ${mac ? '⌘' : 'Ctrl'} and the mouse wheel change it too.`,
    smaller: 'Smaller',
    larger: 'Larger',
    percent: (percent: number): string => `${percent}%`,
    actualSize: 'Show it at its actual size',
    fit: 'Fit',
    fitHint: 'Show all of the drawing in the pane',
    /** The lines, read out: a list a screen reader finds beside the drawing. */
    spoken: 'The Relations in the drawing',
    adrName: (prefix: string, title: string, log: string | undefined): string =>
      log === undefined ? `ADR ${prefix} (${title})` : `ADR ${prefix} (${title}) of ${log}`,
    line: (from: string, type: RelationType, to: string, state: RelationState): string =>
      `${from} ${LINE_VERB[type]} ${to}${state === 'pending' ? ', proposed' : state === 'void' ? ', which never took effect' : ''}`
  },

  searching: {
    label: 'Search ADRs, Components and Source Files',
    placeholder: 'Search ADRs, Components, Source Files — or type the number of an ADR',
    found: 'Found',
    adrs: 'ADRs',
    components: 'Components',
    sourceFiles: 'Source Files',
    /** Beside each hit: what kind of thing it is. */
    component: 'Component',
    sourceFile: 'Source File',
    draft: 'Draft',
    unassigned: 'Unassigned',
    more: (shown: number, all: number): string =>
      `The best ${shown} of ${all}. Another word narrows it down.`,
    moreOf: (shown: number, all: number): string => `The best ${shown} of ${all}.`,
    none: 'Nothing has all of these words.',
    analysing:
      'Structure is still analysing the code: its Components and Source Files are searched once it is done.',
    analysingAgain:
      'Structure is analysing the code again: its Components and Source Files are searched as it last found them.',
    notAnalysed: (reason: string): string =>
      `Components and Source Files are not searched: ${reason}`
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
    } satisfies Record<Decision, ReviewWording>,
    repair: {
      action: 'Repair',
      title: (prefix: string): string => `Repair ADR ${prefix}`,
      refused: (prefix: string): string => `Cannot repair ADR ${prefix}`,
      caution: {
        lead: 'Before you repair:',
        advice:
          'A Repair takes what the ADRs say in supersedes and amends as true. If that is what is wrong, cancel and fix the file by hand.'
      }
    } satisfies ReviewWording,
    renumber: {
      action: 'Renumber',
      title: (prefix: string): string => `Renumber ADR ${prefix}`,
      refused: (prefix: string): string => `Cannot renumber ADR ${prefix}`,
      caution: {
        lead: 'The tool does not change the text of an ADR:',
        advice:
          'A link in the text that points to the old file name has to be changed by hand, after the Renumber.'
      }
    } satisfies ReviewWording,
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
    adopt: {
      action: 'Adopt',
      title: 'Adopt the Draft',
      refused: 'The Draft cannot be adopted'
    },
    rename: {
      action: 'Rename',
      title: (from: string, to: string): string => `Rename ${from} to ${to}`,
      refused: (id: string): string => `Cannot rename ${id}`
    },
    structureRepair: {
      action: 'Repair',
      title: (component: string): string => `Repair the declaration of ${component}`,
      refused: (component: string): string => `Cannot repair the declaration of ${component}`
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
    writtenInPart: 'Some files are not as they were',
    discard: {
      title: 'Discard your changes?',
      reason: 'The text in the editor has not been saved. Leaving the editor now loses it.',
      action: 'Discard changes',
      stay: 'Keep editing'
    },
    discardDialog: {
      title: 'Discard what you entered?',
      reason:
        'A dialog holds what you entered, and it has not been carried out. Closing the window now loses it.',
      action: 'Discard and close'
    }
  }
}
