import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** What the app remembers between starts. It lives in the user's app-data directory, never in a repository. */
export interface StoredSession {
  readonly roots: readonly string[]
  readonly activeRoot?: string
}

const EMPTY: StoredSession = { roots: [] }

export async function readSession(file: string): Promise<StoredSession> {
  try {
    const stored: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (typeof stored !== 'object' || stored === null) return EMPTY
    const { roots, activeRoot } = stored as Record<string, unknown>
    if (!Array.isArray(roots)) return EMPTY
    return {
      roots: roots.filter((root): root is string => typeof root === 'string'),
      ...(typeof activeRoot === 'string' && { activeRoot })
    }
  } catch {
    // No session yet, or one that cannot be read: start empty rather than fail to start.
    return EMPTY
  }
}

export async function writeSession(file: string, session: StoredSession): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(session, null, 2) + '\n', 'utf8')
}
