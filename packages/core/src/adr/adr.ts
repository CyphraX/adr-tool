import { readAdrTools } from '../foreign/adr-tools'
import { numberOf, type AdrFileName, type NamingScheme } from '../log/naming'
import { readMetadata, type Metadata } from '../metadata/read'
import type { Problem } from '../problems/problem'
import { viewSource, type Eol } from '../text/source'
import { titleOf } from '../text/title'

/** A format the tool reads and never writes (docs/file-format.md, section 8). */
export type ForeignFormat = 'adr-tools'

/** What each foreign format is called, in a sentence. */
export const FOREIGN_FORMAT_NAMES: Record<ForeignFormat, string> = { 'adr-tools': 'adr-tools' }

/** An ADR as read from its file. */
export interface Adr {
  /** The file name without `.md`; unique within the Decision Log. */
  readonly id: string
  /** The file's path relative to the repository root. */
  readonly path: string
  /** The number people say aloud ("ADR-3"). Only ADRs of a `sequential` log have one. */
  readonly number?: number
  /** The first level-one heading of the body. An ADR without one is shown under its ID. */
  readonly title?: string
  /** The Markdown after the frontmatter, exactly as it is in the file. */
  readonly body: string
  /** The file's line ending: that of its first line break. */
  readonly eol: Eol
  /**
   * The format the file is written in, when it is not the tool's own. Its Metadata is then
   * what Migration would write, and no operation but Migration writes to the file.
   */
  readonly foreign?: ForeignFormat
  readonly metadata: Metadata
  /** `false` when the tool must not write Metadata into this file until a person has fixed it. */
  readonly metadataWritable: boolean
}

export function readAdr(
  name: AdrFileName,
  path: string,
  text: string,
  scheme: NamingScheme
): { adr: Adr; problems: readonly Problem[] } {
  const view = viewSource(text)
  const own = readMetadata(view, name.id)
  const adrTools = readAdrTools(view, name.id, own.metadata)
  const { metadata, problems } = adrTools ?? own
  const number = numberOf(name, scheme)
  const body = text.slice(view.bodyStart)
  const title = titleOf(body, number)
  const adr: Adr = {
    id: name.id,
    path,
    ...(number !== undefined && { number }),
    ...(title !== undefined && { title }),
    body,
    eol: view.eol,
    ...(adrTools && { foreign: 'adr-tools' as const }),
    metadata,
    metadataWritable: own.writable
  }
  return { adr, problems }
}
