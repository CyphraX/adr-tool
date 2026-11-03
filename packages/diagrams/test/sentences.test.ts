import { describe, expect, it } from 'vitest'
import {
  DIAGRAM_PROBLEM_CODES,
  DIAGRAMS_SENTENCES,
  diagramsEnglishOf,
  saidOf,
  saidOfDrift,
  wordingOf,
  type DiagramProblem,
  type Drift
} from '../src'

// Every Problem and every Drift has a code and an English sentence (docs/plan-roadmap.md,
// part 12): the window words the code in its own language.
const PATH = 'docs/architecture/diagrams/packages.yml'
const at = { path: PATH, line: 3 }

/** One Problem of every kind, as the specification words it (docs/diagrams-format.md, section 5). */
const problems: [DiagramProblem, string][] = [
  [
    {
      ...at,
      path: '.arch/config.yml',
      kind: 'unreadable-config',
      detail: { code: 'config-not-map', values: {} }
    },
    '.arch/config.yml cannot be read: its top level must be a map. No Diagram is looked for until it is fixed.'
  ],
  [
    { ...at, path: '.arch/config.yml', kind: 'invalid-diagrams-directory' },
    '"diagrams" in .arch/config.yml must be a relative path inside the repository. No Diagram is looked for until it is fixed.'
  ],
  [
    {
      ...at,
      kind: 'unreadable-diagram',
      detail: { code: 'element-without-position', values: { line: 7 } }
    },
    `${PATH} cannot be read: the element on line 7 has no position "at".`
  ],
  [
    { ...at, kind: 'no-level' },
    'The Diagram has no level. A level is one of system-context, container and component.'
  ],
  [
    { ...at, kind: 'unknown-level', level: 'layers' },
    'The Diagram has the level "layers", which the suite does not know. A level is one of system-context, container and component.'
  ],
  [
    { ...at, kind: 'no-scope' },
    'The Diagram is a component view and has no scope: it does not say which Component it looks into.'
  ],
  [
    { ...at, kind: 'scope-without-component-level', level: 'container' },
    'The Diagram is a container view and has a scope, which only a component view has. The scope is not read.'
  ],
  [
    { ...at, kind: 'invalid-element-id', id: 'GitHub' },
    '"GitHub" is not a valid element ID. An element ID consists of lowercase letters, digits and dashes, and starts and ends with a letter or a digit.'
  ],
  [{ ...at, kind: 'duplicate-element', id: 'core' }, 'core is shown twice. The first one is read.'],
  [
    { ...at, kind: 'self-connection', id: 'core' },
    'The connection from core to core is not drawn: an element does not use itself.'
  ],
  [
    { ...at, kind: 'unknown-element', from: 'core', to: 'kernal', id: 'kernal' },
    'The connection from core to kernal names kernal, which is not an element of the Diagram. It is not drawn.'
  ],
  [
    { ...at, kind: 'duplicate-connection', from: 'core', to: 'kernel' },
    'The Diagram connects core to kernel twice. The first connection is read.'
  ],
  [
    { ...at, kind: 'component-gone', component: 'billing' },
    'The Diagram shows billing, which is not a declared Component.'
  ],
  [
    { ...at, kind: 'unknown-scope', component: 'billing' },
    'The Diagram looks into billing, which is not a declared Component.'
  ],
  [
    {
      ...at,
      kind: 'component-does-not-fit',
      component: 'core/metadata',
      level: 'container',
      scope: ''
    },
    'core/metadata does not belong in a container view, which shows the Components at the top of the hierarchy.'
  ],
  [
    { ...at, kind: 'repository-does-not-fit', id: 'suite' },
    'The repository suite stands for every Component, and only a system context shows it.'
  ]
]

describe('the sentences of diagrams', () => {
  it('say every Problem as the specification has it, as the sentence of its code', () => {
    expect(problems.map(([problem]) => problem.kind)).toEqual(DIAGRAM_PROBLEM_CODES)
    for (const [problem, sentence] of problems) {
      expect(saidOf(problem).code).toBe(problem.kind)
      expect(wordingOf(problem)).toBe(sentence)
      expect(diagramsEnglishOf(saidOf(problem))).toBe(sentence)
    }
  })

  it('say each kind of Drift', () => {
    const drift: [Drift, string][] = [
      [
        { kind: 'connection-not-in-code', from: 'app', to: 'core', line: 4 },
        'The Diagram connects app to core, but no Source File of app depends on one of core.'
      ],
      [
        {
          kind: 'connection-not-in-code',
          from: 'app',
          to: 'core',
          line: 4,
          uncertain: { notResolved: 0, notAnalysed: 2 }
        },
        'The Diagram connects app to core. No Source File of app is known to depend on one of core, but that is not certain: 2 Source Files of app cannot be read.'
      ],
      [
        {
          kind: 'dependency-not-in-diagram',
          from: 'app',
          to: 'core',
          weight: 12,
          typeOnly: false,
          dependencies: []
        },
        'app depends on core in the code, through 12 Source File Dependencies, and the Diagram does not connect them.'
      ],
      [
        {
          kind: 'scope-dependency-not-in-diagram',
          from: 'app',
          to: 'core',
          scope: 'core',
          weight: 3,
          typeOnly: false,
          dependencies: []
        },
        "app depends on core's own files in the code, through 3 Source File Dependencies, and the Diagram connects app to no part of core."
      ],
      [
        {
          kind: 'scope-dependency-not-in-diagram',
          from: 'core',
          to: 'kernel',
          scope: 'core',
          weight: 1,
          typeOnly: true,
          dependencies: []
        },
        "core's own files depend on kernel in the code, through one Source File Dependency, and the Diagram connects no part of core to kernel."
      ]
    ]
    for (const [one, sentence] of drift) {
      expect(saidOfDrift(one).code).toBe(
        'uncertain' in one ? 'connection-perhaps-not-in-code' : one.kind
      )
      expect(diagramsEnglishOf(saidOfDrift(one))).toBe(sentence)
    }
  })

  it('have one for every code of a Problem, and take the kernel’s', () => {
    for (const code of DIAGRAM_PROBLEM_CODES) expect(DIAGRAMS_SENTENCES).toHaveProperty([code])
    expect(DIAGRAMS_SENTENCES).toHaveProperty(['already-exists'])
    expect(DIAGRAMS_SENTENCES).toHaveProperty(['no-longer-exists'])
  })
})
