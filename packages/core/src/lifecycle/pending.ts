import type { ChangeSet, FileSystem } from '@adr-tool/kernel'
import type { Plan } from '../plan'
import { MetadataNotWritableError } from '../metadata/write'
import { applyEdits, type TextEdit } from '../text/edit'
import { viewSource, type SourceView } from '../text/source'

interface PendingFile {
  before: string
  after: string
  creates?: true
  renameTo?: string
}

/** Why an operation cannot be done, in words for the person who asked for it. */
export class Refusal extends Error {}

/**
 * The files an operation is about to change. Every write is a set of splice edits against
 * the text as it stands, so several writes to one file build on each other, and what no
 * write touches stays byte for byte what was read (ADR-0002).
 */
export class PendingFiles {
  private readonly texts = new Map<string, PendingFile>()

  constructor(private readonly fs: FileSystem) {}

  /** A file that does not exist yet. Refused when it does. */
  async create(path: string, text: string): Promise<void> {
    if (this.texts.has(path) || (await this.fs.readText(path)) !== undefined) {
      throw new Refusal(`${path} already exists.`)
    }
    this.texts.set(path, { before: '', after: text, creates: true })
  }

  /** Move a file. Refused when something is in the way. Later writes still name the file by its old path. */
  async rename(path: string, to: string): Promise<void> {
    const taken = [...this.texts.values()].some((file) => file.renameTo === to)
    if (taken || this.texts.has(to) || (await this.fs.readText(to)) !== undefined) {
      throw new Refusal(`${to} already exists.`)
    }
    const file = await this.file(path)
    file.renameTo = to
  }

  /** The text of a file as the operation has it so far. */
  async read(path: string): Promise<string> {
    return (await this.file(path)).after
  }

  async write(path: string, edit: (view: SourceView) => TextEdit[]): Promise<void> {
    const file = await this.file(path)
    file.after = applyEdits(file.after, edit(viewSource(file.after)))
  }

  private async file(path: string): Promise<PendingFile> {
    let file = this.texts.get(path)
    if (!file) {
      const before = await this.fs.readText(path)
      if (before === undefined) throw new Refusal(`${path} no longer exists.`)
      file = { before, after: before }
      this.texts.set(path, file)
    }
    return file
  }

  changeSet(): ChangeSet {
    const files = [...this.texts]
      .filter(([, file]) => file.after !== file.before || file.renameTo !== undefined)
      .map(([path, file]) => ({ path, ...file }))
    return { files }
  }
}

/** Run an operation's planning; a Refusal or Metadata that cannot be written becomes the reason. */
export async function plan(
  fs: FileSystem,
  build: (pending: PendingFiles) => Promise<void>
): Promise<Plan> {
  const pending = new PendingFiles(fs)
  try {
    await build(pending)
  } catch (error) {
    if (error instanceof Refusal || error instanceof MetadataNotWritableError) {
      return { ok: false, reason: error.message }
    }
    throw error
  }
  return { ok: true, changeSet: pending.changeSet() }
}
