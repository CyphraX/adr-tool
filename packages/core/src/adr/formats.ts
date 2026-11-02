/** A format the tool reads and never writes (docs/file-format.md, section 8). */
export type ForeignFormat = 'adr-tools' | 'madr' | 'madr-2'

/** What each foreign format is called, in a sentence. */
export const FOREIGN_FORMAT_NAMES: Record<ForeignFormat, string> = {
  'adr-tools': 'adr-tools',
  madr: 'MADR',
  'madr-2': 'MADR 2 or log4brains'
}
