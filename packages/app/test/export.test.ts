import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { exportPdf, writeExport } from '../src/main/export'

// docs/plan-roadmap.md, part 10

const showcase = fileURLToPath(new URL('../../core/test/fixtures/showcase/', import.meta.url))
const scratch: string[] = []
afterAll(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })))
const directory = (): string => {
  const made = mkdtempSync(join(tmpdir(), 'adr-app-export-'))
  scratch.push(made)
  return made
}

describe('the export from the app', () => {
  it('writes the web pages into a folder, and again over its own export', async () => {
    const out = join(directory(), 'site')
    const first = await writeExport(showcase, out, '2026-11-02')
    expect(first).toEqual({
      ok: true,
      index: join(out, 'index.html'),
      print: join(out, 'print.html'),
      adrs: 8
    })
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toContain('<h1>showcase</h1>')
    expect((await writeExport(showcase, out, '2026-11-03')).ok).toBe(true)
  })

  it('writes into no folder that holds anything else', async () => {
    const busy = directory()
    writeFileSync(join(busy, 'notes.txt'), 'mine')
    expect(await writeExport(showcase, busy, '2026-11-02')).toEqual({
      ok: false,
      reason: `${busy} is not empty, and no export was written there. Choose an empty folder, or one an earlier export wrote.`
    })
    expect(existsSync(join(busy, 'index.html'))).toBe(false)
  })

  it('prints the page with every ADR to a PDF, and leaves nothing else behind', async () => {
    const file = join(directory(), 'decisions.pdf')
    let printed = ''
    let page = ''
    const result = await exportPdf(showcase, file, '2026-11-02', async (url) => {
      page = fileURLToPath(url)
      printed = readFileSync(page, 'utf8')
      return Buffer.from('%PDF-1.7\n')
    })
    expect(result).toMatchObject({ ok: true, index: file, adrs: 8 })
    expect(readFileSync(file, 'utf8')).toBe('%PDF-1.7\n')
    expect(printed.match(/<article class="adr" id=/g)).toHaveLength(8)
    // The pages it was printed from are gone.
    expect(existsSync(page)).toBe(false)
  })

  it('exports nothing from a repository without a Decision Log', async () => {
    const empty = directory()
    mkdirSync(join(empty, 'src'))
    expect(await writeExport(empty, join(empty, 'site'), '2026-11-02')).toEqual({
      ok: false,
      reason: 'This repository has no Decision Log to export.'
    })
  })
})
