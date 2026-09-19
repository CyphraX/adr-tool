import type { DirectoryEntry, FileSystem } from './port'

/** A file system held in memory: a map from path to text. Directories exist by having files in them. */
export function memoryFileSystem(files: Readonly<Record<string, string>>): FileSystem {
  const paths = Object.keys(files)
  return {
    async readText(path) {
      return files[path]
    },
    async list(path) {
      const prefix = path === '' ? '' : `${path}/`
      const entries = new Map<string, DirectoryEntry>()
      for (const file of paths) {
        if (!file.startsWith(prefix)) continue
        const [name, ...deeper] = file.slice(prefix.length).split('/')
        if (name) entries.set(name, { name, kind: deeper.length > 0 ? 'directory' : 'file' })
      }
      return entries.size > 0 ? [...entries.values()] : undefined
    }
  }
}
