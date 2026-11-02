import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { normalizePath, openRepository } from '@adr-tool/core'
import { EXPORT_MARKER, PRINT_PAGE, exportSite } from '@adr-tool/core/export'
import { repositoryFiles, within } from './files'

/** An image larger than this is not copied: it is no image of an ADR. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

export interface ExportRequest {
  /** The repository whose Decision Logs are exported. */
  readonly root: string
  /** Where the export goes: an empty directory, one an earlier export wrote, or none yet. */
  readonly out: string
  /** The Decision Logs to export, by their directories; every log when left out. */
  readonly logs?: readonly string[]
  readonly title: string
  readonly date: string
  /** What is left out, and why: an image that is no file of the repository, one too large. */
  readonly warn: (text: string) => void
}

/** Why nothing, or not all, was exported. The command line and the app each say it in words. */
export type ExportRefusal =
  | { readonly kind: 'no-log'; readonly root: string }
  | { readonly kind: 'unknown-log'; readonly log: string; readonly known: readonly string[] }
  /** `out` is there and is no directory. */
  | { readonly kind: 'not-directory'; readonly out: string }
  /** `out` holds something, and no export was written there. */
  | { readonly kind: 'not-empty'; readonly out: string }
  /** A file or directory of the export is a symbolic link in `out`: nothing is written through it. */
  | { readonly kind: 'link'; readonly out: string; readonly path: string }
  /** Something else stands in `out` where the export puts a file or a directory. */
  | { readonly kind: 'in-the-way'; readonly out: string; readonly path: string }

export type ExportResult =
  | {
      readonly ok: true
      readonly adrs: number
      readonly logs: number
      readonly files: number
      readonly index: string
      readonly print: string
    }
  | { readonly ok: false; readonly reason: ExportRefusal }

/** The command line's words for a refusal (docs/cli.md, `adr export`). */
export function describeRefusal(refusal: ExportRefusal): string {
  const name = (log: string): string => log || '.'
  switch (refusal.kind) {
    case 'no-log':
      return `No Decision Log found in ${refusal.root}: none is configured in .adr/config.yml or .adr-dir, and none of docs/adr, doc/adr, docs/decisions exists.`
    case 'unknown-log':
      return `There is no Decision Log at ${name(refusal.log)}. The repository has: ${refusal.known.map(name).join(', ')}.`
    case 'not-directory':
      return `${refusal.out} is not a directory.`
    case 'not-empty':
      return `${refusal.out} is not empty, and no export was written there: name an empty directory, or one an earlier export wrote.`
    case 'link':
      return `${refusal.path} in ${refusal.out} is a symbolic link: the export writes nothing through one. Remove it, or name another directory.`
    case 'in-the-way':
      return `${refusal.path} in ${refusal.out} is in the way of the export: remove it, or name another directory.`
  }
}

/** Raised while writing; what was written so far stays, and the marker names it. */
class Refused extends Error {
  constructor(readonly refusal: ExportRefusal) {
    super(refusal.kind)
  }
}

/**
 * Export Decision Logs as HTML pages that open from disk (docs/cli.md, `adr export`;
 * ADR-0014): the one thing the command line writes, and only into `out`. Nothing of the
 * repository is changed. The app's Export writes through this too.
 */
export async function exportTo(request: ExportRequest): Promise<ExportResult> {
  const { root, warn } = request
  const out = resolve(request.out)
  const repository = await openRepository(repositoryFiles(root, warn))
  if (repository.logs.length === 0) return refused({ kind: 'no-log', root })
  const known = repository.logs.map((log) => log.path)
  const logs = request.logs && [...new Set(request.logs.map((log) => normalizePath(log) ?? log))]
  const unknown = logs?.find((log) => !known.includes(log))
  if (unknown !== undefined) return refused({ kind: 'unknown-log', log: unknown, known })

  // Only an export is written over: a directory of anything else is left as it is.
  const before = await earlierExport(out)
  if (!Array.isArray(before)) return refused(before)

  const site = exportSite(repository, {
    ...(logs && { logs }),
    title: request.title,
    date: request.date
  })
  let copied: string[] = []
  try {
    await mkdir(out, { recursive: true })
    const files = filesIn(await realpath(out), out)
    // First a marker that names everything this export may write beside what the earlier one
    // wrote: an export that stops halfway is one the next export can write over.
    await files.write(EXPORT_MARKER, site.marker([...before, ...site.images]).text)
    for (const file of site.files) await files.write(file.path, file.text)
    copied = await copyImages(root, site.images, files, warn)
    // What the earlier export had and this one has not.
    const now = new Set([...site.files.map((file) => file.path), ...copied, EXPORT_MARKER])
    for (const stale of before.filter((path) => !now.has(path))) await files.remove(stale)
    await files.write(EXPORT_MARKER, site.marker(copied).text)
  } catch (error) {
    if (error instanceof Refused) return refused(error.refusal)
    throw error
  }

  const adrs = repository.logs
    .filter((log) => logs === undefined || logs.includes(log.path))
    .reduce((sum, log) => sum + log.adrs.length, 0)
  return {
    ok: true,
    adrs,
    logs: logs?.length ?? known.length,
    files: site.files.length + copied.length,
    index: join(out, 'index.html'),
    print: join(out, PRINT_PAGE)
  }
}

const refused = (reason: ExportRefusal): ExportResult => ({ ok: false, reason })

/** Copy the images that are files of the repository, and say which are left out. */
async function copyImages(
  root: string,
  images: readonly string[],
  files: Files,
  warn: (text: string) => void
): Promise<string[]> {
  const copied: string[] = []
  const realRoot = await realpath(root)
  for (const image of images) {
    // Only a file of the repository, and not one a symbolic link leads out of it to.
    const source = await realpath(resolve(root, image)).catch(() => undefined)
    const info = source && within(realRoot, source) ? await stat(source) : undefined
    if (!source || !info?.isFile()) {
      warn(`${image} is shown by an ADR and is not a file of the repository: it is left out.`)
      continue
    }
    if (info.size > MAX_IMAGE_BYTES) {
      warn(`${image} is larger than 20 MiB: it is left out.`)
      continue
    }
    await files.copy(source, image)
    copied.push(image)
  }
  return copied
}

interface Files {
  write(path: string, text: string): Promise<void>
  copy(source: string, path: string): Promise<void>
  /** Remove a file an earlier export wrote; anything but such a file is left where it is. */
  remove(path: string): Promise<void>
}

/**
 * The files of the export below `base`, the real path of `out`. Nothing is written or removed
 * through a symbolic link, or over anything but a regular file: what stands in `out` may come
 * from anywhere — a checkout, a share — and must not lead the export out of it. A file is
 * written as a new one, so that a hard link to it elsewhere is left as it was.
 */
function filesIn(base: string, out: string): Files {
  /**
   * Where `path` goes below `base`, its directories made on the way, or `undefined` when it
   * cannot go there and `quietly` is set; otherwise that is refused.
   */
  async function place(path: string, quietly: boolean): Promise<string | undefined> {
    if (normalizePath(path) !== path || path === '') {
      if (quietly) return undefined
      throw new Refused({ kind: 'in-the-way', out, path })
    }
    const parts = path.split('/')
    let at = base
    for (const [position, part] of parts.entries()) {
      at = join(at, part)
      const last = position === parts.length - 1
      const info = await lstat(at).catch(() => undefined)
      if (info === undefined) {
        if (quietly) return undefined
        if (!last) await mkdir(at)
        continue
      }
      const fits = last ? info.isFile() : info.isDirectory()
      if (fits && !info.isSymbolicLink()) continue
      if (quietly) return undefined
      const shown = parts.slice(0, position + 1).join('/')
      throw new Refused({ kind: info.isSymbolicLink() ? 'link' : 'in-the-way', out, path: shown })
    }
    return at
  }
  /** A new file at `path`: what is there is taken away first. */
  const fresh = async (path: string): Promise<string> => {
    const full = (await place(path, false))!
    await rm(full, { force: true })
    return full
  }
  return {
    write: async (path, text) =>
      writeFile(await fresh(path), text, { encoding: 'utf8', flag: 'wx' }),
    copy: async (source, path) => copyFile(source, await fresh(path)),
    remove: async (path) => {
      const full = await place(path, true)
      if (full !== undefined) await rm(full)
    }
  }
}

/**
 * The files an earlier export wrote into `out`, by its marker, each as the export names it;
 * none for a directory that is empty or not there yet. A directory with anything else in it
 * is refused.
 */
async function earlierExport(out: string): Promise<string[] | ExportRefusal> {
  const info = await stat(out).catch(() => undefined)
  if (!info) return []
  if (!info.isDirectory()) return { kind: 'not-directory', out }
  const entries = await readdir(out)
  if (entries.length === 0) return []
  const marker = join(out, EXPORT_MARKER)
  if (!(await lstat(marker).catch(() => undefined))?.isFile()) return { kind: 'not-empty', out }
  try {
    const files = (JSON.parse(await readFile(marker, 'utf8')) as { files?: unknown }).files
    if (!Array.isArray(files)) return []
    // Only paths as the export writes them: `./index.html` or `docs//a.html` name nothing.
    return files.filter(
      (file): file is string =>
        typeof file === 'string' && file !== '' && normalizePath(file) === file
    )
  } catch {
    return []
  }
}
