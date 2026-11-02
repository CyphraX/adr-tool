import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { repositoryFiles } from '../src/files'
import { run } from '../src/run'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const fixtures = fileURLToPath(new URL('../../core/test/fixtures/', import.meta.url))

/** Runs the command as a shell would, and keeps what it prints. */
async function adr(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  return adrIn(repository, ...args)
}

async function adrIn(
  cwd: string,
  ...args: string[]
): Promise<{ code: number; out: string; err: string }> {
  let out = ''
  let err = ''
  const code = await run(args, {
    out: (text) => void (out += text),
    err: (text) => void (err += text),
    cwd
  })
  return { code, out, err }
}

const scratch: string[] = []
afterAll(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

/** A repository on disk: path → text. */
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'adr-lint-'))
  scratch.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

const adrText = (...lines: string[]): string =>
  ['---', ...lines, '---', '', '# Title', ''].join('\n')

describe('adr lint (docs/cli.md)', () => {
  it('lists the Problems of the fixture `broken` with file, line and code, and ends with 1', async () => {
    const { code, out, err } = await adr('lint', join(fixtures, 'broken'))
    expect(code).toBe(1)
    expect(err).toBe('')
    expect(out.trimEnd().split('\n')).toEqual([
      'docs/adr/0004-api-style.md:2: status-not-lowercase: The Status is written "Rejected". It has to be lowercase.',
      'docs/adr/0003-new-database.md:6: unknown-target: depends-on names 0042-never-written, which is not in this Decision Log.',
      'docs/adr/0004-api-style.md:6: self-reference: relates-to names this ADR itself.',
      'docs/adr/0002-old-database.md:2: not-marked-superseded: 0003-new-database has been accepted and supersedes this ADR, but its Status is not superseded.',
      'docs/adr/0007-caching.md:5: unfounded-back-reference: superseded-by lists 0008-no-caching, which has no such Relation in effect.',
      'docs/adr/0001-foundation.md:1: missing-back-reference: 0005-split-module has been accepted and points here, but amended-by does not list it.',
      'docs/adr/0003-new-database.md:1: missing-back-reference: 0005-split-module has been accepted and points here, but amended-by does not list it.',
      'docs/adr/0007-caching.md:2: superseded-without-successor: The Status is superseded, but no accepted ADR supersedes this one.',
      'docs/adr/0009-queue.md:4: supersedes-cycle: These ADRs supersede each other in a circle: 0009-queue, 0010-cron.',
      'docs/adr/0006-export.md: duplicate-number: Number 6 is used by 0006-export and 0006-import.',
      '',
      '10 Problems in 1 Decision Log.'
    ])
  })

  it('finds nothing in this repository, and ends with 0', async () => {
    expect(await adr('lint')).toEqual({ code: 0, out: 'No Problems in 1 Decision Log.\n', err: '' })
  })

  it('fails on this repository once an ADR gets a broken Relation', async () => {
    const copy = mkdtempSync(join(tmpdir(), 'adr-lint-own-'))
    scratch.push(copy)
    cpSync(join(repository, 'docs/adr'), join(copy, 'docs/adr'), { recursive: true })
    const file = join(copy, 'docs/adr/0003-on-disk-contract.md')
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(/^status:/m, 'depends-on: [0099-gone]\nstatus:')
    )
    const { code, out } = await adr('lint', copy)
    expect(code).toBe(1)
    expect(out).toMatch(
      /^docs\/adr\/0003-on-disk-contract\.md:\d+: unknown-target: depends-on names 0099-gone/
    )
  })

  it('puts what follows from a Status outside the five values under it, and counts it apart', async () => {
    const root = repo({
      'docs/adr/0001-old.md': adrText('status: superseded', 'superseded-by: [0002-new]'),
      'docs/adr/0002-new.md': adrText('status: approved', 'supersedes: [0001-old]')
    })
    const { code, out } = await adr('lint', root)
    expect(code).toBe(1)
    expect(out.trimEnd().split('\n')).toEqual([
      'docs/adr/0002-new.md:2: invalid-metadata: status: "approved" is not one of proposed, accepted, rejected, deprecated, superseded',
      '  Reported only because the Status of 0002-new is none of the five values, which voids its Relations.',
      '  docs/adr/0001-old.md:3: unfounded-back-reference: superseded-by lists 0002-new, which has no such Relation in effect.',
      '  docs/adr/0001-old.md:2: superseded-without-successor: The Status is superseded, but no accepted ADR supersedes this one.',
      '',
      '1 Problem in 1 Decision Log, and 2 that follow from it.'
    ])
  })

  it('checks Traces against the Components the repository declares', async () => {
    const root = repo({
      '.arch/components.yml': 'components:\n  billing:\n    paths: [src/billing/**]\n',
      'docs/adr/0001-a.md': adrText('status: accepted', 'affects: [billing, shipping]')
    })
    const { code, out } = await adr('lint', root)
    expect(code).toBe(1)
    expect(out).toContain(
      'docs/adr/0001-a.md:3: unknown-component: affects names shipping, which is not a declared Component.'
    )
  })

  it('names a Problem of the repository as a whole by its file, without a line', async () => {
    const root = repo({ '.adr/config.yml': 'logs:\n  - path: docs/decisions\n' })
    const { code, out } = await adr('lint', root)
    expect(code).toBe(1)
    expect(out).toBe(
      'docs/decisions: missing-log-directory: The configured directory docs/decisions does not exist.\n\n' +
        '1 Problem, and no Decision Log that could be checked.\n'
    )
  })

  it('prints one JSON document with --format json', async () => {
    const root = repo({
      'docs/adr/0001-old.md': adrText('status: superseded', 'superseded-by: [0002-new]'),
      'docs/adr/0002-new.md': adrText('status: approved', 'supersedes: [0001-old]'),
      'docs/adr/0003-x.md': adrText('status: accepted', 'depends-on: [0042-gone]')
    })
    const { code, out } = await adr('lint', root, '--format', 'json')
    expect(code).toBe(1)
    const report = JSON.parse(out)
    expect(report.logs).toEqual(['docs/adr'])
    expect(report.problems).toHaveLength(2)
    expect(report.problems[1]).toEqual({
      code: 'unknown-target',
      message: 'depends-on names 0042-gone, which is not in this Decision Log.',
      path: 'docs/adr/0003-x.md',
      line: 3,
      log: 'docs/adr',
      problem: { kind: 'unknown-target', adr: '0003-x', key: 'depends-on', target: '0042-gone' },
      consequences: []
    })
    expect(report.problems[0].consequences.map((one: { code: string }) => one.code)).toEqual([
      'unfounded-back-reference',
      'superseded-without-successor'
    ])
    expect(report.problems[0].consequences[0]).not.toHaveProperty('consequences')
    expect((await adr('lint', '--format=json')).out).toBe('{"logs":["docs/adr"],"problems":[]}\n')
  })

  it('prints workflow commands of GitHub with --format github', async () => {
    const root = repo({
      'docs/adr/0001-old.md': adrText('status: superseded', 'superseded-by: [0002-new]'),
      'docs/adr/0002-new.md': adrText('status: approved', 'supersedes: [0001-old]')
    })
    const { out } = await adr('lint', root, '--format', 'github')
    expect(out.trimEnd().split('\n')).toEqual([
      '::error file=docs/adr/0002-new.md,line=2,title=invalid-metadata::status: "approved" is not one of proposed, accepted, rejected, deprecated, superseded',
      '::notice file=docs/adr/0001-old.md,line=3,title=unfounded-back-reference::superseded-by lists 0002-new, which has no such Relation in effect. Reported only because the Status of 0002-new is none of the five values, which voids its Relations.',
      '::notice file=docs/adr/0001-old.md,line=2,title=superseded-without-successor::The Status is superseded, but no accepted ADR supersedes this one. Reported only because the Status of 0002-new is none of the five values, which voids its Relations.',
      '1 Problem in 1 Decision Log, and 2 that follow from it.'
    ])
  })

  it('ends with 2 when nothing can be checked, and says why on standard error', async () => {
    const empty = repo({ 'README.md': '# Nothing here\n' })
    for (const [args, said] of [
      [['lint', empty], /No Decision Log found/],
      [['lint', join(empty, 'missing')], /is not a directory/],
      [['lint', join(empty, 'README.md')], /is not a directory/],
      [['lint', '--format', 'xml'], /--format/],
      [['lint', 'a', 'b'], /one path/],
      [['check'], /Unknown command/],
      [[], /Usage/]
    ] as const) {
      const { code, out, err } = await adr(...args)
      expect([args, code, out]).toEqual([args, 2, ''])
      expect(err).toMatch(said)
    }
  })

  it('says how it is used with --help, and ends with 0', async () => {
    const { code, out } = await adr('--help')
    expect(code).toBe(0)
    expect(out).toMatch(/^Usage: adr lint \[path\] \[--format text\|json\|github\]/)
    expect((await adr('lint', '--help')).code).toBe(0)
  })

  it('takes options anywhere, and a path after --', async () => {
    expect((await adr('--format', 'json', 'lint')).out).toBe(
      '{"logs":["docs/adr"],"problems":[]}\n'
    )
    const root = repo({ '-dir/docs/adr/0001-a.md': adrText('status: accepted') })
    expect((await adrIn(root, 'lint', '--', '-dir')).code).toBe(0)
    // A value that looks like an option is still the value, and not understood.
    const { code, err } = await adr('lint', '--format', '-h')
    expect(code).toBe(2)
    expect(err).toMatch(/--format takes/)
  })

  it('keeps each Problem on one line, whatever a value holds', async () => {
    const root = repo({
      'docs/adr/0001-a.md': adrText(
        'status: "on hold\\n::error file=x.md,line=1::fake"',
        'depends-on: ["0009-gone\\r\\nmore"]'
      )
    })
    const { out } = await adr('lint', root)
    const lines = out.trimEnd().split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe(
      'docs/adr/0001-a.md:2: invalid-metadata: status: "on hold\\n::error file=x.md,line=1::fake" is not one of proposed, accepted, rejected, deprecated, superseded'
    )
    expect(lines[1]).toContain('names 0009-gone\\r\\nmore, which')
    expect(lines.some((line) => line.startsWith('::'))).toBe(false)
    const configured = repo({ '.adr/config.yml': 'logs:\n  - path: "::error file=x::y"\n' })
    expect((await adr('lint', configured)).out).toMatch(/^\.\/::error file=x::y: /)
  })

  it('names the files of --format github from the directory it runs in', async () => {
    const root = repo({
      'service/docs/adr/0001-a.md': adrText('status: accepted', 'depends-on: [0009-gone]')
    })
    const { out } = await adrIn(root, 'lint', 'service', '--format', 'github')
    expect(out).toMatch(/^::error file=service\/docs\/adr\/0001-a\.md,line=3,/)
  })

  it('counts a Problem of the configuration apart from the Decision Logs', async () => {
    const root = repo({
      '.adr/config.yml': 'logs:\n  - path: docs/adr\n  - path: docs/gone\n',
      'docs/adr/0001-a.md': adrText('status: accepted', 'depends-on: [0009-gone]')
    })
    const { out } = await adr('lint', root)
    expect(out.trimEnd().split('\n').at(-1)).toBe(
      '2 Problems in the configuration and 1 Decision Log.'
    )
  })

  it('says on standard error that it cannot check Traces against a declaration it cannot read', async () => {
    const root = repo({
      '.arch/components.yml': 'components:\n  billing: [x]\n',
      'docs/adr/0001-a.md': adrText('status: accepted', 'affects: [nothing-declared]')
    })
    const { code, err } = await adr('lint', root)
    expect(code).toBe(0)
    expect(err).toMatch(
      /^adr lint: \.arch\/components\.yml cannot be read \(.*\), so the Traces in affects are not checked\.\n$/
    )
  })

  it('reads nothing outside the repository, not through a symbolic link either', async () => {
    const outside = repo({
      'secret.md': adrText('status: TOP-SECRET-VALUE'),
      'adr/0001-out.md': adrText('status: TOP-SECRET-VALUE')
    })
    const root = repo({ 'docs/adr/0001-a.md': adrText('status: accepted') })
    symlinkSync(join(outside, 'secret.md'), join(root, 'docs/adr/0002-leak.md'))
    mkdirSync(join(root, 'docs/adr/0003-dir.md'))
    symlinkSync(join(root, 'docs/adr/0001-a.md'), join(root, 'docs/adr/0004-same.md'))
    const { code, out, err } = await adr('lint', root)
    expect(out).not.toContain('TOP-SECRET')
    expect(err).toBe('')
    // A link inside the repository is followed; the duplicate it makes is a Problem as any.
    expect(code).toBe(0)

    const linked = repo({ 'README.md': '# A\n' })
    mkdirSync(join(linked, 'docs'))
    symlinkSync(join(outside, 'adr'), join(linked, 'docs/adr'))
    expect((await adr('lint', linked)).code).toBe(2)

    const files = repositoryFiles(root)
    expect(await files.readText('docs/adr/0002-leak.md')).toBeUndefined()
    expect(await files.readText('docs/adr/0004-same.md')).toContain('accepted')
    expect((await files.list('docs/adr'))?.map((entry) => `${entry.name} ${entry.kind}`)).toEqual(
      expect.arrayContaining(['0001-a.md file', '0003-dir.md directory', '0004-same.md file'])
    )
    expect((await files.list('docs/adr'))?.some((entry) => entry.name === '0002-leak.md')).toBe(
      false
    )
  })

  it('reads the repository at the root of the file system as any other', async () => {
    const files = repositoryFiles('/')
    expect(await files.list('.')).toEqual(
      expect.arrayContaining([{ name: 'tmp', kind: 'directory' }])
    )
  })
})
