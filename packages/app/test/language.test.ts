import { describe, expect, it } from 'vitest'
import {
  PROBLEM_CODES,
  memoryFileSystem,
  openRepository,
  type FileChange,
  type Problem
} from '@adr-tool/core'
import { languageOf } from '../src/shared/language'
import { setLanguage, t } from '../src/main/strings'
import { de } from '../src/renderer/src/lib/strings.de'
import { en } from '../src/renderer/src/lib/strings.en'
import { de as deWording } from '../src/renderer/src/lib/wording.de'
import { en as enWording } from '../src/renderer/src/lib/wording.en'

// docs/plan-roadmap.md, part 12

/** What German writes as English does: the tool's words, names, and symbols. */
const SAME_IN_GERMAN = new Set([
  'English',
  'Deutsch',
  'ADR',
  'ADRs',
  'Decision Logs',
  'Status',
  'Board',
  'Dashboard',
  'Branch',
  'Branches',
  'Export',
  'Tags',
  'Live',
  'Commits',
  'Code',
  'Graph',
  'Matrix',
  'Details',
  'ID',
  '⌘K',
  'Ce',
  'Ca',
  'I',
  'H',
  'Fan-in',
  'Fan-out'
])

/** Arguments to try a text that is a function with: a name or a count, a list, an object. */
const SAMPLES: unknown[] = ['2026-03-01', 3, ['a.md', 'b.md'], { id: '0042', title: 'T' }]

/** What a text that is a function says, with the first sample arguments it takes. */
function sampled(text: (...values: unknown[]) => unknown, other: unknown): [unknown, unknown] {
  for (const sample of SAMPLES) {
    const values = Array.from({ length: Math.max(1, text.length) }, () => sample)
    try {
      const said = text(...values)
      if (typeof said !== 'string' || said === '' || said.includes('undefined')) continue
      return [said, (other as (...values: unknown[]) => unknown)(...values)]
    } catch {
      // Not this kind of value: the next sample.
    }
  }
  return [undefined, undefined]
}

/** Texts with a value in them that German writes as English does, by where they stand. */
const SAME_AT = new Set([
  'dashboard.total',
  'dashboard.adrCount',
  'structure.graph.directory',
  'structure.value',
  'structure.page.filesIn'
])

/** Every text of `english` that `german` says the same, by where it stands. */
function untranslated(english: unknown, german: unknown, at = ''): string[] {
  if (typeof english === 'function') {
    if (SAME_AT.has(at)) return []
    const [said, other] = sampled(english as (...values: unknown[]) => unknown, german)
    return untranslated(said, other, at)
  }
  if (typeof english === 'string') {
    return english === german && !SAME_IN_GERMAN.has(english) ? [`${at}: ${english}`] : []
  }
  if (english === null || typeof english !== 'object') return []
  return Object.entries(english).flatMap(([key, value]) =>
    untranslated(value, (german as Record<string, unknown>)[key], at ? `${at}.${key}` : key)
  )
}

describe('the language of the window (part 12)', () => {
  it('is the first preferred language it speaks, and English otherwise', () => {
    expect(languageOf(['de-AT', 'en-US'])).toBe('de')
    expect(languageOf(['fr-FR', 'de_CH'])).toBe('de')
    expect(languageOf(['fr', 'it'])).toBe('en')
    expect(languageOf([])).toBe('en')
  })

  it('says every text of the window in German, but the words German takes as they are', () => {
    expect(untranslated(en, de)).toEqual([])
    expect(untranslated(enWording, deWording)).toEqual([])
  })

  it('words a change, a Problem and its cause in German', () => {
    const changed: FileChange = { path: 'a.md', before: 'a\n', after: 'b\n' }
    const created: FileChange = { path: 'b.md', before: '', after: 'b\n', creates: true }
    expect(deWording.summarizeChange([changed, created])).toBe(
      'Dies legt eine Datei an und ändert eine Datei. Sonst bleibt an ihr alles, wie es ist.'
    )
    expect(deWording.summarizeChange([])).toBe('Dies ändert nichts.')
    // One of each kind: the German sentence is never the English one.
    const problems: Problem[] = [
      { kind: 'unterminated-frontmatter', adr: '0001-a' },
      { kind: 'invalid-frontmatter', adr: '0001-a', detail: 'x' },
      { kind: 'invalid-metadata', adr: '0001-a', key: 'status', detail: 'x' },
      { kind: 'status-not-lowercase', adr: '0001-a', written: 'Accepted' },
      { kind: 'unknown-target', adr: '0001-a', key: 'supersedes', target: '0009-x' },
      { kind: 'self-reference', adr: '0001-a', key: 'amends' },
      { kind: 'unknown-component', adr: '0001-a', component: 'core' },
      { kind: 'missing-back-reference', adr: '0001-a', key: 'superseded-by', source: '0002-b' },
      { kind: 'unfounded-back-reference', adr: '0001-a', key: 'superseded-by', source: '0002-b' },
      { kind: 'not-marked-superseded', adr: '0001-a', source: '0002-b' },
      { kind: 'superseded-without-successor', adr: '0001-a' },
      { kind: 'supersedes-cycle', adrs: ['0001-a', '0002-b'] },
      { kind: 'duplicate-number', number: 1, adrs: ['0001-a', '0001-b'] },
      { kind: 'invalid-configuration', path: '.adr/config.yml', detail: 'x' },
      { kind: 'missing-log-directory', path: 'docs/adr' }
    ]
    expect(problems.map((problem) => problem.kind).sort()).toEqual([...PROBLEM_CODES].sort())
    for (const problem of problems) {
      // The key and its detail, nothing else: the detail is worded by its code.
      if (problem.kind === 'invalid-metadata') continue
      expect(deWording.describeProblem(problem)).not.toBe(enWording.describeProblem(problem))
    }
    expect(deWording.describeCause(problems[0]!)).toBe(
      'Nur gemeldet, weil sich das Frontmatter von 0001-a nicht lesen lässt.'
    )
  })

  it('words the detail of a Problem and why a file has no Migration by their codes', async () => {
    const repository = await openRepository(
      memoryFileSystem({
        'docs/adr/0001-a.md': '---\nstatus: approved\n---\n\n# A\n',
        'docs/adr/0002-b.md': '# 2. B\n\nDate: 2026-01-01\n\n## Status\n\nSuperseded by 3\n'
      })
    )
    const [log] = repository.logs
    const problem = log!.problems.find((one) => one.kind === 'invalid-metadata')!
    expect(enWording.describeProblem(problem)).toContain('approved')
    expect(deWording.describeProblem(problem)).not.toBe(enWording.describeProblem(problem))
    expect(deWording.describeProblem(problem)).toMatch(/^status: /)
    const foreign = log!.adrs.find((adr) => adr.id === '0002-b')!
    expect(foreign.noMigrationSaid).toBeDefined()
    expect(deWording.describeForeign(foreign)).toContain('Dieses ADR nennt seinen Nachfolger')
  })

  it('has the main process speak the language the window says', () => {
    expect(t.openRepository).toBe('Open repository')
    setLanguage('de')
    expect(t.openRepository).toBe('Repository öffnen')
    expect(t.branches.numberTaken(4, ['a', 'b'], '0004-x')).toContain('den Branches a und b')
    setLanguage('en')
    expect(t.commit.noMessage).toBe('A commit needs a message.')
  })
})
