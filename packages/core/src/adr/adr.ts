import { readAdrTools } from '../foreign/adr-tools'
import { namesSuccessor, readMadr, type ByNumber } from '../foreign/madr'
import { numberOf, type AdrFileName, type NamingScheme } from '../log/naming'
import { readMetadata, type Metadata } from '../metadata/read'
import type { Problem } from '../problems/problem'
import { viewSource, type Eol } from '../text/source'
import { titleOf } from '../text/title'

/** A format the tool reads and never writes (docs/file-format.md, section 8). */
export type ForeignFormat = 'adr-tools' | 'madr'

/** What each foreign format is called, in a sentence. */
export const FOREIGN_FORMAT_NAMES: Record<ForeignFormat, string> = {
  'adr-tools': 'adr-tools',
  madr: 'MADR'
}

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
  /**
   * Why this foreign ADR has no Migration, as the rest of a sentence that begins with its ID.
   * It stays read-only until a person has changed the file by hand.
   */
  readonly noMigration?: string
  /**
   * The ADRs this one supersedes because their files say so and its own does not: MADR
   * records a supersession on the superseded ADR only. Not part of the Metadata, which is
   * what the file says; Migration of those ADRs writes it there.
   */
  readonly impliedSupersedes?: readonly string[]
  readonly metadata: Metadata
  /** `false` when the tool must not write Metadata into this file until a person has fixed it. */
  readonly metadataWritable: boolean
}

const NO_MIGRATION = {
  listed:
    "keeps its Status in the list under its title, as MADR 2 does, and there is no Migration for that yet. Give it a `status` key in a frontmatter by hand, and it is one of the tool's own.",
  successorInText:
    'names its successor in its Status text, where adr-tools writes a link. As a `status` that would be read the way MADR means it, and say something else than it says now. Make it a link line by hand — Superseded by [2. Title](0002-title.md) — and it can be migrated.'
}

export function readAdr(
  name: AdrFileName,
  path: string,
  text: string,
  scheme: NamingScheme,
  byNumber: ByNumber = () => undefined
): { adr: Adr; problems: readonly Problem[]; successor?: string } {
  const view = viewSource(text)
  const own = readMetadata(view, name.id)
  const adrTools = readAdrTools(view, name.id, own.metadata)
  // A file whose frontmatter cannot be read is nobody's format yet.
  const madr = adrTools || !own.writable ? undefined : readMadr(view, name.id, own, byNumber)
  const foreign: ForeignFormat | undefined = adrTools ? 'adr-tools' : madr ? 'madr' : undefined
  const { metadata, problems } = adrTools ?? madr?.reading ?? own
  const noMigration = madr?.listed
    ? NO_MIGRATION.listed
    : adrTools && metadata.rawStatus !== undefined && namesSuccessor(metadata.rawStatus)
      ? NO_MIGRATION.successorInText
      : undefined
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
    ...(foreign && { foreign }),
    ...(noMigration !== undefined && { noMigration }),
    metadata,
    metadataWritable: own.writable
  }
  return { adr, problems, ...(madr?.successor !== undefined && { successor: madr.successor }) }
}
