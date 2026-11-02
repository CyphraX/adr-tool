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
import { dirname, resolve } from 'node:path'
import { normalizePath, openRepository } from '@adr-tool/core'
import { EXPORT_MARKER, exportSite } from '@adr-tool/core/export'
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
  readonly warn: (text: string) => void
}

export type ExportResult =
  | { readonly ok: true; readonly adrs: number; readonly logs: number; readonly files: number }
  | { readonly ok: false; readonly reason: string }

/**
 * Export Decision Logs as HTML pages that open from disk (docs/cli.md, `adr export`): the one
 * thing the command line writes, and only into `out`. Nothing of the repository is changed.
 */
export async function exportTo(request: ExportRequest): Promise<ExportResult> {
  const { root, warn } = request
  const out = resolve(request.out)
  const repository = await openRepository(repositoryFiles(root, warn))
  if (repository.logs.length === 0) {
    return {
      ok: false,
      reason: `No Decision Log found in ${root}: none is configured in .adr/config.yml or .adr-dir, and none of docs/adr, doc/adr, docs/decisions exists.`
    }
  }
  const known = repository.logs.map((log) => log.path)
  const logs = request.logs?.map((log) => normalizePath(log) ?? log)
  const unknown = logs?.find((log) => !known.includes(log))
  if (unknown !== undefined) {
    return {
      ok: false,
      reason: `There is no Decision Log at ${unknown || '.'}. The repository has: ${known.map((log) => log || '.').join(', ')}.`
    }
  }

  // Only an export is written over: a directory of anything else is left as it is.
  const before = await earlierExport(out)
  if (typeof before === 'string') return { ok: false, reason: before }

  const site = exportSite(repository, {
    ...(logs && { logs }),
    title: request.title,
    date: request.date
  })
  const target = (path: string): string => {
    const full = resolve(out, path)
    if (!within(out, full) || full === out) throw new Error(`${path} lies outside ${out}.`)
    return full
  }
  for (const file of site.files) {
    const full = target(file.path)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, file.text, 'utf8')
  }
  let copied = 0
  const realRoot = await realpath(root)
  for (const image of site.images) {
    const source = await realpath(resolve(root, image)).catch(() => undefined)
    const info = source && within(realRoot, source) ? await stat(source) : undefined
    if (!info?.isFile()) {
      warn(`${image} is shown by an ADR and is not a file of the repository: it is left out.`)
      continue
    }
    if (info.size > MAX_IMAGE_BYTES) {
      warn(`${image} is larger than 20 MiB: it is left out.`)
      continue
    }
    const full = target(image)
    await mkdir(dirname(full), { recursive: true })
    await copyFile(source!, full)
    copied++
  }

  // What the earlier export had and this one has not.
  const now = new Set([...site.files.map((file) => file.path), ...site.images])
  for (const stale of before.filter((path) => !now.has(path))) {
    const full = resolve(out, stale)
    if (!within(out, full) || full === out) continue
    const info = await lstat(full).catch(() => undefined)
    if (info?.isFile()) await rm(full)
  }

  const exported = site.files.length + copied
  const adrs = repository.logs
    .filter((log) => logs === undefined || logs.includes(log.path))
    .reduce((sum, log) => sum + log.adrs.length, 0)
  return { ok: true, adrs, logs: logs?.length ?? known.length, files: exported }
}

/**
 * The files an earlier export wrote into `out`, by its marker; none for a directory that is
 * empty or not there yet. A directory with anything else in it is refused: the reason says so.
 */
async function earlierExport(out: string): Promise<string[] | string> {
  const info = await stat(out).catch(() => undefined)
  if (!info) return []
  if (!info.isDirectory()) return `${out} is not a directory.`
  const entries = await readdir(out)
  if (entries.length === 0) return []
  if (!entries.includes(EXPORT_MARKER)) {
    return `${out} is not empty, and no export was written there: name an empty directory, or one an earlier export wrote.`
  }
  try {
    const marker = JSON.parse(await readFile(resolve(out, EXPORT_MARKER), 'utf8')) as unknown
    const files = (marker as { files?: unknown }).files
    return Array.isArray(files) ? files.filter((file) => typeof file === 'string') : []
  } catch {
    return []
  }
}
