import type { DirectoryEntry, WritableFileSystem } from './port'

/** A file system held in memory: a map from path to text. Directories exist by having files in them. */
export function memoryFileSystem(initial: Readonly<Record<string, string>>): WritableFileSystem {
  const files = new Map(Object.entries(initial))
  return {
    async readText(path) {
      return files.get(path)
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
    }
  }
}
