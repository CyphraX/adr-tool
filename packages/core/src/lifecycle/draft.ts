import type { ChangeSet, Plan } from '../change/change-set'
import type { FileSystem } from '../fs/port'
import { MetadataNotWritableError } from '../metadata/write'
import { applyEdits, type TextEdit } from '../text/edit'
import { viewSource, type SourceView } from '../text/source'

/** Why an operation cannot be done, in words for the person who asked for it. */
export class Refusal extends Error {}

/**
 * The files an operation is about to change. Every write is a set of splice edits against
 * the text as it stands, so several writes to one file build on each other, and what no
 * write touches stays byte for byte what was read (ADR-0002).
 */
export class Drafts {
  private readonly texts = new Map<string, { before: string; after: string }>()

  constructor(private readonly fs: FileSystem) {}

  async write(path: string, edit: (view: SourceView) => TextEdit[]): Promise<void> {
    let draft = this.texts.get(path)
    if (!draft) {
      const before = await this.fs.readText(path)
      if (before === undefined) throw new Refusal(`${path} no longer exists.`)
      draft = { before, after: before }
      this.texts.set(path, draft)
    }
    draft.after = applyEdits(draft.after, edit(viewSource(draft.after)))
  }

  changeSet(): ChangeSet {
    const files = [...this.texts]
      .filter(([, draft]) => draft.after !== draft.before)
      .map(([path, draft]) => ({ path, ...draft }))
    return { files }
  }
}

/** Run an operation's planning; a Refusal or Metadata that cannot be written becomes the reason. */
export async function plan(
  fs: FileSystem,
  build: (drafts: Drafts) => Promise<void>
): Promise<Plan> {
  const drafts = new Drafts(fs)
  try {
    await build(drafts)
  } catch (error) {
    if (error instanceof Refusal || error instanceof MetadataNotWritableError) {
      return { ok: false, reason: error.message }
    }
    throw error
  }
  return { ok: true, changeSet: drafts.changeSet() }
}
