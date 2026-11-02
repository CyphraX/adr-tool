import { readAdrTools } from '../foreign/adr-tools'
import { namesSuccessor, readMadr, type ByNumber, type ForeignSign } from '../foreign/madr'
import { readMadrList } from '../foreign/madr-list'
import { numberOf, type AdrFileName, type NamingScheme } from '../log/naming'
import { readMetadata, type Metadata } from '../metadata/read'
import type { Problem } from '../problems/problem'
import { englishOf, type CoreSaid } from '../sentences'
import { viewSource, type Eol } from '../text/source'
import { titleOf } from '../text/title'
import type { ForeignFormat } from './formats'

export { FOREIGN_FORMAT_NAMES, type ForeignFormat } from './formats'
export type { ForeignSign }

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
  /** What made the tool read the file in its foreign format; only with `foreign`. */
  readonly foreignSigns?: readonly ForeignSign[]
  /**
   * Why this foreign ADR has no Migration, as the rest of a sentence that begins with its ID.
   * It stays read-only until a person has changed the file by hand.
   */
  readonly noMigration?: string
  /** `noMigration` as a code, for a window in another language; always set together with it. */
  readonly noMigrationSaid?: CoreSaid
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

/**
 * An ADR of another Decision Log of the repository, as a log sees it: everything the tool
 * reads from its file but its body. Relations across logs name it by its reference.
 */
export interface GuestAdr extends Omit<Adr, 'body'> {
  /** How the log names it: `<log>/<ID>` (docs/file-format.md, section 3). */
  readonly reference: string
  /** The directory of its own Decision Log. */
  readonly log: string
  /**
   * The Problem its own log reports when its frontmatter or its Status cannot be read: what
   * it says about other ADRs is unknown or void then, and what follows from that is no
   * Problem of its own in the other logs either.
   */
  readonly root?: Problem
}

/** Why a foreign ADR has no Migration, by what its file says. */
const NO_MIGRATION = {
  successorInText: { code: 'successor-in-status-text', values: {} }
} satisfies Record<string, CoreSaid>

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
  const listed = adrTools || !own.writable ? undefined : readMadrList(view, name.id, own, byNumber)
  const madr =
    adrTools || listed || !own.writable ? undefined : readMadr(view, name.id, own, byNumber)
  const foreign: ForeignFormat | undefined = adrTools
    ? 'adr-tools'
    : listed
      ? 'madr-2'
      : madr
        ? 'madr'
        : undefined
  const signs: readonly ForeignSign[] | undefined = adrTools
    ? ['status-section']
    : (listed ?? madr)?.signs
  const { metadata, problems } = adrTools ?? listed?.reading ?? madr?.reading ?? own
  const successor = (listed ?? madr)?.successor
  const noMigrationSaid: CoreSaid | undefined =
    adrTools && metadata.rawStatus !== undefined && namesSuccessor(metadata.rawStatus)
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
    ...(foreign && { foreign, foreignSigns: signs ?? [] }),
    ...(noMigrationSaid !== undefined && {
      noMigration: englishOf(noMigrationSaid),
      noMigrationSaid
    }),
    metadata,
    metadataWritable: own.writable
  }
  return { adr, problems, ...(successor !== undefined && { successor }) }
}
