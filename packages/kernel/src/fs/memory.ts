import type { DirectoryEntry, WritableFileSystem } from './port'

/** How many bytes a text has in UTF-8. */
function bytesOf(text: string): number {
  let bytes = 0
  for (const character of text) {
    const code = character.codePointAt(0)!
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return bytes
}

/** A file system held in memory: a map from path to text. Directories exist by having files in them. */
export function memoryFileSystem(initial: Readonly<Record<string, string>>): WritableFileSystem {
  const files = new Map(Object.entries(initial))
  return {
    async readText(path, options) {
      const text = files.get(path)
      const atMost = options?.atMost
      return atMost !== undefined && text !== undefined && bytesOf(text) > atMost
        ? undefined
        : text
    },
    async list(path) {
      const prefix = path === '' ? '' : `${path}/`
      const entries = new Map<string, DirectoryEntry>()
      for (const file of files.keys()) {
        if (!file.startsWith(prefix)) continue
        const [name, ...deeper] = file.slice(prefix.length).split('/')
        if (name) entries.set(name, { name, kind: deeper.length > 0 ? 'directory' : 'file' })
      }
      return entries.size > 0 ? [...entries.values()] : undefined
    },
    async writeText(path, text) {
      files.set(path, text)
    },
    async rename(from, to) {
      const text = files.get(from)
      if (text === undefined) throw new Error(`No such file: ${from}`)
      files.delete(from)
      files.set(to, text)
    },
    async link(from, to) {
      const text = files.get(from)
      if (text === undefined) throw new Error(`No such file: ${from}`)
      if (files.has(to)) throw new Error(`${to} already exists.`)
      files.set(to, text)
    },
    async remove(path) {
      files.delete(path)
    },
    async removeDirectory(path) {
      // A directory is there while files are in it, and gone with the last of them.
      if ([...files.keys()].some((file) => file.startsWith(`${path}/`))) {
        throw new Error(`${path} is not empty.`)
      }
    }
  }
}
