import { parentPort } from 'node:worker_threads'
import { analyse, readCache, writeCache, type ExtractionCache } from './analysis'

/**
 * The analysis of the Structure module, off the main thread (docs/plan-structure.md, open
 * decision 5): listing, reading, parsing and resolving a repository takes seconds on a large
 * one, and the window must not wait for it. TypeScript is loaded here and nowhere else.
 */
export interface AnalysisRequest {
  readonly id: number
  readonly root: string
  readonly cacheFile: string
}

/** The caches of the repositories analysed so far, so that the file is read once. */
const caches = new Map<string, ExtractionCache | undefined>()

parentPort?.on('message', async ({ id, root, cacheFile }: AnalysisRequest) => {
  try {
    const cache = caches.has(cacheFile) ? caches.get(cacheFile) : await readCache(cacheFile)
    const result = await analyse(root, cache)
    caches.set(cacheFile, result.cache)
    if (result.changed) await writeCache(cacheFile, result.cache).catch(() => undefined)
    parentPort?.postMessage({ id, ok: true, analysis: result.analysis })
  } catch (error) {
    parentPort?.postMessage({ id, ok: false, reason: String(error) })
  }
})
