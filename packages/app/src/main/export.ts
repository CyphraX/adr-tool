import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { exportTo, type ExportRefusal } from '@adr-tool/cli/export'
import { t } from './strings'

export type Exported =
  | { readonly ok: true; readonly index: string; readonly adrs: number; readonly print: string }
  | { readonly ok: false; readonly reason: string }

/** The app's words for why an export was not written. */
function describe(refusal: ExportRefusal): string {
  switch (refusal.kind) {
    case 'no-log':
    case 'unknown-log':
      return t.export.noLog
    case 'not-directory':
      return t.export.notDirectory(refusal.out)
    case 'not-empty':
      return t.export.notEmpty(refusal.out)
    case 'link':
      return t.export.link(refusal.out, refusal.path)
    case 'in-the-way':
      return t.export.inTheWay(refusal.out, refusal.path)
  }
}

/**
 * Write every Decision Log of the repository at `root` as HTML pages that open from disk into
 * `out` (docs/plan-roadmap.md, part 10): an empty directory, one an earlier export wrote, or
 * one that is not there yet. It is `adr export` (packages/cli/src/export.ts), by the same rules;
 * nothing of the repository is changed.
 */
export async function writeExport(root: string, out: string, date: string): Promise<Exported> {
  const result = await exportTo({ root, out, title: basename(root), date, warn: () => {} })
  if (!result.ok) return { ok: false, reason: describe(result.reason) }
  return { ok: true, index: result.index, print: result.print, adrs: result.adrs }
}

/**
 * Print a page to PDF: the page that holds every ADR, one per printed page. `print` loads it
 * in a window nobody sees, which runs no script and loads nothing from outside the export it
 * is given — and answers the PDF.
 */
export async function exportPdf(
  root: string,
  file: string,
  date: string,
  print: (page: string, site: string) => Promise<Buffer>
): Promise<Exported> {
  const scratch = await mkdtemp(join(tmpdir(), 'softarch-export-'))
  try {
    const site = join(scratch, 'site')
    const exported = await writeExport(root, site, date)
    if (!exported.ok) return exported
    await writeFile(file, await print(pathToFileURL(exported.print).href, site))
    return { ...exported, index: file }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}
