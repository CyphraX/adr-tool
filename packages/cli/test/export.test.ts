import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { run } from '../src/run'

// docs/cli.md, `adr export`; docs/plan-roadmap.md, part 10

const repository = fileURLToPath(new URL('../../../', import.meta.url))

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

function directory(files: Record<string, string | Buffer> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'adr-export-'))
  scratch.push(root)
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

/** Every file below `root`, relative to it, sorted. */
function filesBelow(root: string): string[] {
  return (readdirSync(root, { recursive: true, withFileTypes: true }) as import('node:fs').Dirent[])
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1))
    .sort()
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3])
const adr = (status: string, body: string): string => `---\nstatus: ${status}\n---\n\n${body}`

describe('adr export (docs/cli.md)', () => {
  it("writes this repository's Decision Log as pages that link to each other", async () => {
    const out = join(directory(), 'site')
    const { code, out: said, err } = await adrIn(repository, 'export', '--out', out)
    expect([code, err]).toEqual([0, ''])
    expect(said).toMatch(/^Exported \d+ ADRs of 1 Decision Log to .*site\. Open .*index\.html\.\n$/)
    const pages = filesBelow(out)
    expect(pages).toEqual(
      expect.arrayContaining([
        'index.html',
        'print.html',
        'softarch-export.json',
        'style.css',
        'docs/adr/0002-never-reserialize-markdown.html'
      ])
    )
    // Every link between pages leads to a page that is there.
    for (const page of pages.filter((path) => path.endsWith('.html'))) {
      const text = readFileSync(join(out, page), 'utf8')
      for (const [, href] of text.matchAll(/href="([^"#]+\.html)(?:#[^"]*)?"/g)) {
        const target = join(out, page, '..', decodeURIComponent(href!))
        expect([page, href, existsSync(target)]).toEqual([page, href, true])
      }
    }
  })

  it('copies the images of the ADRs byte for byte, and only those of the repository', async () => {
    const outside = directory({ 'secret.png': PNG })
    const root = directory({
      'docs/adr/0001-a.md': adr(
        'accepted',
        '# A\n\n![Schema](img/schema.png) ![Gone](img/gone.png) ![Leak](img/leak.png)\n'
      ),
      'docs/adr/img/schema.png': PNG
    })
    symlinkSync(join(outside, 'secret.png'), join(root, 'docs/adr/img/leak.png'))
    const out = join(directory(), 'site')
    const { code, err } = await adrIn(root, 'export', '--out', out)
    expect(code).toBe(0)
    expect(readFileSync(join(out, 'docs/adr/img/schema.png'))).toEqual(PNG)
    expect(existsSync(join(out, 'docs/adr/img/leak.png'))).toBe(false)
    expect(err).toContain(
      'docs/adr/img/gone.png is shown by an ADR and is not a file of the repository'
    )
    expect(err).toContain(
      'docs/adr/img/leak.png is shown by an ADR and is not a file of the repository'
    )
  })

  it('writes into an empty directory or an earlier export, and nowhere else', async () => {
    const root = directory({
      'docs/adr/0001-a.md': adr('accepted', '# A\n'),
      'docs/adr/0002-b.md': adr('proposed', '# B\n')
    })
    const busy = directory({ 'notes.txt': 'mine' })
    const refused = await adrIn(root, 'export', '--out', busy)
    expect(refused.code).toBe(2)
    expect(refused.err).toMatch(/is not empty, and no export was written there/)
    expect(filesBelow(busy)).toEqual(['notes.txt'])

    const out = join(directory(), 'site')
    expect((await adrIn(root, 'export', '--out', out)).code).toBe(0)
    expect(filesBelow(out)).toContain('docs/adr/0002-b.html')
    // The ADR goes; the next export over the first one takes its page away, and nothing else.
    rmSync(join(root, 'docs/adr/0002-b.md'))
    writeFileSync(join(out, 'mine.txt'), 'kept')
    expect((await adrIn(root, 'export', `--out=${out}`)).code).toBe(0)
    expect(filesBelow(out)).not.toContain('docs/adr/0002-b.html')
    expect(filesBelow(out)).toContain('mine.txt')
  })

  it('writes and removes nothing through a symbolic link that stands in the export', async () => {
    const root = directory({ 'docs/adr/0001-a.md': adr('accepted', '# A\n') })
    const elsewhere = directory({ 'victim.txt': 'keep', 'notes.txt': 'keep' })
    const out = join(directory(), 'site')
    expect((await adrIn(root, 'export', '--out', out)).code).toBe(0)

    // A directory of the export is a link to elsewhere, and the marker names a file there.
    rmSync(join(out, 'docs'), { recursive: true })
    symlinkSync(elsewhere, join(out, 'docs'))
    const marker = JSON.parse(readFileSync(join(out, 'softarch-export.json'), 'utf8'))
    writeFileSync(
      join(out, 'softarch-export.json'),
      JSON.stringify({ ...marker, files: [...marker.files, 'docs/victim.txt'] })
    )
    const { code, err } = await adrIn(root, 'export', '--out', out)
    expect(code).toBe(2)
    expect(err).toContain('docs in')
    expect(err).toContain('is a symbolic link: the export writes nothing through one')
    expect(filesBelow(elsewhere)).toEqual(['notes.txt', 'victim.txt'])

    // A file of the export is a link to elsewhere: it is not written through either.
    rmSync(join(out, 'docs'))
    rmSync(join(out, 'style.css'))
    symlinkSync(join(elsewhere, 'notes.txt'), join(out, 'style.css'))
    expect((await adrIn(root, 'export', '--out', out)).code).toBe(2)
    expect(readFileSync(join(elsewhere, 'notes.txt'), 'utf8')).toBe('keep')

    // A hard link: the export writes a file of its own, and the other stays as it was.
    rmSync(join(out, 'style.css'))
    linkSync(join(elsewhere, 'notes.txt'), join(out, 'style.css'))
    expect((await adrIn(root, 'export', '--out', out)).code).toBe(0)
    expect(readFileSync(join(elsewhere, 'notes.txt'), 'utf8')).toBe('keep')
    expect(readFileSync(join(out, 'style.css'), 'utf8')).toContain(':root')
  })

  it('removes only what the marker names as the export writes it, and only what is gone', async () => {
    const root = directory({
      'docs/adr/0001-first.md': adr('accepted', '# First\n\n![Gone](img/gone.png)\n')
    })
    const out = join(directory(), 'site')
    expect((await adrIn(root, 'export', '--out', out)).code).toBe(0)
    // An image that could not be copied is not the export's: a file someone puts there stays.
    const marker = JSON.parse(readFileSync(join(out, 'softarch-export.json'), 'utf8'))
    expect(marker.files).not.toContain('docs/adr/img/gone.png')
    mkdirSync(join(out, 'docs/adr/img'))
    writeFileSync(join(out, 'docs/adr/img/gone.png'), 'mine')
    writeFileSync(
      join(out, 'softarch-export.json'),
      JSON.stringify({
        ...marker,
        files: ['./index.html', 'docs//adr/0001-first.html', 'style.css/', '../outside.txt']
      })
    )
    const again = await adrIn(root, 'export', '--out', out)
    expect(again.code).toBe(0)
    expect(filesBelow(out)).toEqual([
      'docs/adr/0001-first.html',
      'docs/adr/img/gone.png',
      'index.html',
      'print.html',
      'softarch-export.json',
      'style.css'
    ])
  })

  it('exports the Decision Logs named with --log', async () => {
    const root = directory({
      '.adr/config.yml': 'logs:\n  - path: docs/adr\n  - path: billing/adr\n',
      'docs/adr/0001-a.md': adr('accepted', '# A\n'),
      'billing/adr/0001-b.md': adr('accepted', '# B\n')
    })
    const out = join(directory(), 'site')
    const { code, out: said } = await adrIn(root, 'export', '--out', out, '--log', 'billing/adr/')
    expect(code).toBe(0)
    expect(said).toMatch(/^Exported 1 ADR of 1 Decision Log/)
    // A log named twice is one log.
    const twice = await adrIn(
      root,
      'export',
      '--out',
      out,
      '--log',
      'billing/adr',
      '--log',
      './billing/adr'
    )
    expect(twice.out).toMatch(/^Exported 1 ADR of 1 Decision Log /)
    expect(filesBelow(out)).toContain('billing/adr/0001-b.html')
    expect(filesBelow(out)).not.toContain('docs/adr/0001-a.html')

    const unknown = await adrIn(root, 'export', '--out', out, '--log', 'nowhere')
    expect(unknown.code).toBe(2)
    expect(unknown.err).toBe(
      'adr export: There is no Decision Log at nowhere. The repository has: docs/adr, billing/adr.\n'
    )
  })

  it('ends with 2 when nothing can be exported, and says why', async () => {
    const empty = directory({ 'README.md': '# Nothing\n' })
    for (const [args, said] of [
      [['export', empty, '--out', join(empty, 'site')], /No Decision Log found/],
      [['export', empty], /needs --out/],
      [['export', '--format', 'json', '--out', 'x'], /--format is an option of adr lint/],
      [['lint', '--out', 'x'], /--out and --log are options of adr export/],
      [['export', '--out'], /--out takes a directory/]
    ] as const) {
      const { code, out, err } = await adrIn(empty, ...args)
      expect([args, code, out]).toEqual([args, 2, ''])
      expect(err).toMatch(said)
    }
    expect(existsSync(join(empty, 'site'))).toBe(false)
  })
})
