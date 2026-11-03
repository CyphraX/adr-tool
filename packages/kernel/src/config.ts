/**
 * The suite's settings for a repository, `.arch/config.yml` (docs/configuration.md): one file
 * for every module, each with a key of its own at the top. The kernel reads the file and knows
 * none of the keys; each module reads and checks its own, and leaves the others alone.
 */
import { isMap, isScalar, LineCounter, parseDocument } from 'yaml'
import type { KernelSaid } from './change/said'
import type { FileSystem } from './fs/port'

/** Where the settings are, beside the declaration of Components. */
export const CONFIG_PATH = '.arch/config.yml'

/** One key at the top of the file. */
export interface Setting {
  /** Its value, as YAML reads it: a text, a number, a list, a map, or `null` for none. */
  readonly value: unknown
  /** The line of the key, from 1. */
  readonly line: number
}

/**
 * The one Problem of the file itself: it is not YAML, or its top level is not a map. It is
 * the file's, and is reported once, whichever modules keep settings there.
 */
export interface UnreadableConfig {
  readonly kind: 'unreadable-config'
  readonly path: string
  /** The line of the file, from 1. */
  readonly line: number
  /** What it says, as a code: `unreadable-config`, with why as its detail. */
  readonly said: KernelSaid
}

export type Config =
  | {
      readonly readable: true
      /** Every key at the top, in the order of the file. */
      readonly settings: ReadonlyMap<string, Setting>
    }
  | { readonly readable: false; readonly problem: UnreadableConfig }

/** `.arch/config.yml`, as `text`; `undefined` when there is no such file. Never fails. */
export function readConfig(text: string | undefined): Config {
  const none: Config = { readable: true, settings: new Map() }
  if (text === undefined) return none
  const lines = new LineCounter()
  const doc = parseDocument(text, { lineCounter: lines })
  const unreadable = (
    detail: KernelSaid & { code: 'config-not-yaml' | 'config-not-map' },
    line: number
  ): Config => ({
    readable: false,
    problem: {
      kind: 'unreadable-config',
      path: CONFIG_PATH,
      line,
      said: { code: 'unreadable-config', values: { path: CONFIG_PATH, detail } }
    }
  })
  if (doc.errors.length > 0) {
    const error = doc.errors[0]!
    const message = error.message.split('\n')[0]!.replace(/[:.]$/, '')
    return unreadable(
      { code: 'config-not-yaml', values: { message } },
      error.linePos?.[0].line ?? 1
    )
  }
  const top = doc.contents
  if (top === null || (isScalar(top) && top.value === null)) return none
  if (!isMap(top)) return unreadable({ code: 'config-not-map', values: {} }, 1)

  const values = doc.toJS() as Record<string, unknown>
  const settings = new Map<string, Setting>()
  for (const pair of top.items) {
    const key = isScalar(pair.key) ? String(pair.key.value) : String(pair.key)
    const range = (pair.key as { range?: readonly number[] } | null)?.range
    settings.set(key, {
      value: values[key] ?? null,
      line: range ? lines.linePos(range[0]!).line : 1
    })
  }
  return { readable: true, settings }
}

/** The settings of the repository. Never writes. */
export async function openConfig(fs: FileSystem): Promise<Config> {
  return readConfig(await fs.readText(CONFIG_PATH))
}
