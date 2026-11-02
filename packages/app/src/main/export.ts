import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { openRepository } from '@adr-tool/core'
import { EXPORT_MARKER, PRINT_PAGE, exportSite } from '@adr-tool/core/export'
import { nodeFileSystem } from './node-file-system'
import { t } from './strings'

/** An image larger than this is not copied: it is no image of an ADR. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/** Whether `path` is `root` or lies below it. Both are absolute. */
const within = (root: string, path: string): boolean => {
  const rest = relative(root, path)
  return rest === '' || (!rest.startsWith('..') && !isAbsolute(rest))
}

export type Exported =
  | { readonly ok: true; readonly index: string; readonly adrs: number; readonly print: string }
  | { readonly ok: false; readonly reason: string }

/**
 * Write the Decision Logs of the repository at `root` as HTML pages that open from disk into
 * `out` (docs/plan-roadmap.md, part 10): an empty directory, one an earlier export wrote, or
 * one that is not there yet. The same as `adr export` (packages/cli/src/export.ts); nothing of
 * the repository is changed.
 */
export async function writeExport(root: string, out: string, date: string): Promise<Exported> {
  const repository = await openRepository(nodeFileSystem(root))
  if (repository.logs.length === 0) return { ok: false, reason: t.export.noLog }
  const before = await earlierExport(out)
  if (typeof before === 'string') return { ok: false, reason: before }

  const site = exportSite(repository, { title: basename(root), date })
  const target = (path: string): string => {
    const full = resolve(out, path)
    if (!within(out, full) || full === out) throw new Error(t.export.outside(path))
    return full
  }
  for (const file of site.files) {
    const full = target(file.path)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, file.text, 'utf8')
  }
  const realRoot = await realpath(root)
  for (const image of site.images) {
    // Only an image of the repository, and not one a symbolic link leads out of it to.
    const source = await realpath(resolve(root, image)).catch(() => undefined)
    const info = source && within(realRoot, source) ? await stat(source) : undefined
    if (!info?.isFile() || info.size > MAX_IMAGE_BYTES) continue
    const full = target(image)
    await mkdir(dirname(full), { recursive: true })
    await copyFile(source!, full)
  }
  const now = new Set([...site.files.map((file) => file.path), ...site.images])
  for (const stale of before.filter((path) => !now.has(path))) {
    const full = resolve(out, stale)
    if (!within(out, full) || full === out) continue
    if ((await lstat(full).catch(() => undefined))?.isFile()) await rm(full)
  }
  const adrs = repository.logs.reduce((sum, log) => sum + log.adrs.length, 0)
  return { ok: true, index: join(out, 'index.html'), print: join(out, PRINT_PAGE), adrs }
}

/** The files an earlier export wrote into `out`; a reason when `out` holds anything else. */
async function earlierExport(out: string): Promise<string[] | string> {
  const info = await stat(out).catch(() => undefined)
  if (!info) return []
  if (!info.isDirectory()) return t.export.notDirectory(out)
  const entries = await readdir(out)
  if (entries.length === 0) return []
  if (!entries.includes(EXPORT_MARKER)) return t.export.notEmpty(out)
  try {
    const marker = JSON.parse(await readFile(join(out, EXPORT_MARKER), 'utf8')) as unknown
    const files = (marker as { files?: unknown }).files
    return Array.isArray(files) ? files.filter((file) => typeof file === 'string') : []
  } catch {
    return []
  }
}

/**
 * Print a page to PDF: the page that holds every ADR, one per printed page. `print` loads it
 * in a window nobody sees, which runs no script and fetches nothing — and answers the PDF.
 */
export async function exportPdf(
  root: string,
  file: string,
  date: string,
  print: (page: string) => Promise<Buffer>
): Promise<Exported> {
  const scratch = await mkdtemp(join(tmpdir(), 'softarch-export-'))
  try {
    const site = await writeExport(root, join(scratch, 'site'), date)
    if (!site.ok) return site
    await writeFile(file, await print(pathToFileURL(site.print).href))
    return { ...site, index: file }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}
