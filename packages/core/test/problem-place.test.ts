import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  locateProblem,
  memoryFileSystem,
  openRepository,
  type DecisionLog,
  type Problem
} from '../src'
import { nodeFileSystem } from './node-file-system'

const fixture = fileURLToPath(new URL('./fixtures/broken', import.meta.url))

/** Where each Problem of a log is: `path:line code`, in the order the log reports them. */
async function places(files: Record<string, string>): Promise<string[]> {
  const fs = memoryFileSystem(files)
  const { logs, problems } = await openRepository(fs)
  const all: [Problem, DecisionLog | undefined][] = [
    ...problems.map((problem): [Problem, undefined] => [problem, undefined]),
    ...logs.flatMap((log) => log.problems.map((problem): [Problem, DecisionLog] => [problem, log]))
  ]
  return Promise.all(
    all.map(async ([problem, log]) => {
      const { path, line } = await locateProblem(fs, problem, log)
      return `${path}${line === undefined ? '' : `:${line}`} ${problem.kind}`
    })
  )
}

describe('where a Problem is', () => {
  it('is the line of the item it is about, in a block list or a flow list', async () => {
    expect(
      await places({
        'docs/adr/0001-a.md': [
          '---',
          'status: accepted',
          'depends-on:',
          '  - 0002-b',
          '  - 0042-gone',
          "relates-to: [0002-b, '0043-gone']",
          '---',
          '',
          '# A'
        ].join('\n'),
        'docs/adr/0002-b.md': '---\nstatus: accepted\n---\n\n# B\n'
      })
    ).toEqual(['docs/adr/0001-a.md:5 unknown-target', 'docs/adr/0001-a.md:6 unknown-target'])
  })

  it('is the line of the Status for what is wrong with the Status', async () => {
    expect(
      await places({
        'docs/adr/0001-a.md': '---\ncreated: 2026-01-01\nstatus: Accepted\n---\n\n# A\n',
        'docs/adr/0002-b.md': '---\n\nstatus: on hold\n---\n\n# B\n'
      })
    ).toEqual([
      'docs/adr/0001-a.md:3 status-not-lowercase',
      'docs/adr/0002-b.md:3 invalid-metadata'
    ])
  })

  it('is where the YAML parser stops, and line 1 for a frontmatter that never ends', async () => {
    expect(
      await places({
        'docs/adr/0001-a.md':
          '---\nstatus: accepted\ntags: [one\ncreated: 2026-01-01\n---\n\n# A\n',
        'docs/adr/0002-b.md': '---\nstatus: accepted\n\n# B\n'
      })
    ).toEqual([
      expect.stringMatching(/^docs\/adr\/0001-a\.md:[34] invalid-frontmatter$/),
      'docs/adr/0002-b.md:1 unterminated-frontmatter'
    ])
  })

  it('counts lines the same way in a file with CRLF and a byte order mark', async () => {
    expect(
      await places({
        'docs/adr/0001-a.md': '\uFEFF---\r\nstatus: accepted\r\n---\r\n\r\n# A\r\n'
      })
    ).toEqual([])
    const fs = memoryFileSystem({
      'docs/adr/0001-a.md':
        '\uFEFF---\r\nstatus: accepted\r\ndepends-on: [0009-x]\r\n---\r\n\r\n# A\r\n'
    })
    const { logs } = await openRepository(fs)
    expect(await locateProblem(fs, logs[0]!.problems[0]!, logs[0])).toEqual({
      path: 'docs/adr/0001-a.md',
      line: 3
    })
  })

  it('is line 1 for a Back-reference that is missing altogether', async () => {
    expect(
      await places({
        'docs/adr/0001-old.md': '---\nstatus: superseded\n---\n\n# Old\n',
        'docs/adr/0002-new.md': '---\nstatus: accepted\nsupersedes: [0001-old]\n---\n\n# New\n'
      })
    ).toEqual(['docs/adr/0001-old.md:1 missing-back-reference'])
  })

  it('is the first of several ADRs, without a line for a number they share', async () => {
    expect(
      await places({
        'docs/adr/0001-a.md': '---\nstatus: proposed\nsupersedes: [0002-b]\n---\n\n# A\n',
        'docs/adr/0002-b.md': '---\nstatus: proposed\nsupersedes: [0001-a]\n---\n\n# B\n',
        'docs/adr/0002-c.md': '---\nstatus: accepted\n---\n\n# C\n'
      })
    ).toEqual(['docs/adr/0001-a.md:3 supersedes-cycle', 'docs/adr/0002-b.md duplicate-number'])
  })

  it('is the file of the repository without a line for a Problem of the repository', async () => {
    expect(
      await places({
        '.adr/config.yml': 'logs:\n  - path: docs/decisions\n',
        'docs/adr/0001-a.md': '# A\n'
      })
    ).toEqual(['docs/decisions missing-log-directory'])
  })

  it('is found by its text in a file of a foreign format', async () => {
    expect(
      await places({
        'doc/adr/0001-record.md': '# 1. Record\n\nDate: 2016-02-12\n\n## Status\n\nAccepted\n',
        'doc/adr/0002-next.md': [
          '# 2. Next',
          '',
          'Date: 2016-02-13',
          '',
          '## Status',
          '',
          'Accepted',
          '',
          'Amends [9. Gone](0009-gone.md)',
          ''
        ].join('\n')
      })
    ).toEqual(['doc/adr/0002-next.md:9 unknown-target'])
  })

  it('is where the fixture `broken` says it', async () => {
    const fs = nodeFileSystem(fixture)
    const { logs } = await openRepository(fs)
    const log = logs[0]!
    const found = await Promise.all(
      log.problems.map(async (problem) => {
        const { path, line } = await locateProblem(fs, problem, log)
        return `${path.replace('docs/adr/', '')}${line === undefined ? '' : `:${line}`} ${problem.kind}`
      })
    )
    expect(found.sort()).toEqual(
      [
        '0002-old-database.md:2 not-marked-superseded',
        '0003-new-database.md:6 unknown-target',
        '0004-api-style.md:2 status-not-lowercase',
        '0004-api-style.md:6 self-reference',
        '0001-foundation.md:1 missing-back-reference',
        '0003-new-database.md:1 missing-back-reference',
        '0006-export.md duplicate-number',
        '0007-caching.md:5 unfounded-back-reference',
        '0007-caching.md:2 superseded-without-successor',
        '0009-queue.md:4 supersedes-cycle'
      ].sort()
    )
  })
})
