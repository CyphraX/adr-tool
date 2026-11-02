import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { run } from '../src/run'

// `core` gives the details of its Problems a code for the window (docs/plan-roadmap.md,
// part 12); `adr lint` stays as it was: English, and the Problem as docs/cli.md shows it.

const scratch: string[] = []
afterAll(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

describe('adr lint --format json', () => {
  it('gives a Problem with a detail as it did before the detail had a code', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adr-said-'))
    scratch.push(root)
    mkdirSync(join(root, 'docs/adr'), { recursive: true })
    writeFileSync(join(root, 'docs/adr/0001-a.md'), '---\ntags: {a: b}\n---\n# A\n')
    let out = ''
    const code = await run(['lint', '--format', 'json'], {
      out: (text) => void (out += text),
      err: () => undefined,
      cwd: root
    })
    expect(code).toBe(1)
    expect(out).toBe(
      '{"logs":["docs/adr"],"problems":[{"code":"invalid-metadata","message":"tags: Expected a list","path":"docs/adr/0001-a.md","line":2,"log":"docs/adr","problem":{"kind":"invalid-metadata","adr":"0001-a","key":"tags","detail":"Expected a list"},"consequences":[]}]}\n'
    )
  })
})
