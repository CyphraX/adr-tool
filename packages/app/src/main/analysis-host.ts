import type { Worker } from 'node:worker_threads'
import type { Analysis } from './analysis'
import type { AnalysisRequest } from './analysis-worker'
import createAnalysisWorker from './analysis-worker?nodeWorker'

type Answer =
  | { readonly id: number; readonly ok: true; readonly analysis: Analysis }
  | { readonly id: number; readonly ok: false; readonly reason: string }

/**
 * The main process's end of the analysis worker: one worker for all repositories, started
 * when the first analysis is asked for and started again should it ever stop.
 */
export function analysisHost(cacheFileOf: (root: string) => string): {
  analyse: (root: string) => Promise<Analysis>
  stop: () => Promise<void>
} {
  let worker: Worker | undefined
  let next = 0
  const waiting = new Map<
    number,
    { resolve: (analysis: Analysis) => void; reject: (error: Error) => void }
  >()

  const failAll = (reason: string): void => {
    for (const { reject } of waiting.values()) reject(new Error(reason))
    waiting.clear()
    worker = undefined
  }

  const start = (): Worker => {
    const started = createAnalysisWorker({})
    started.on('message', (answer: Answer) => {
      const asked = waiting.get(answer.id)
      waiting.delete(answer.id)
      if (answer.ok) asked?.resolve(answer.analysis)
      else asked?.reject(new Error(answer.reason))
    })
    started.on('error', (error) => failAll(String(error)))
    started.on('exit', (code) => failAll(`The analysis stopped (${code}).`))
    return started
  }

  return {
    analyse(root) {
      worker ??= start()
      const id = next++
      const request: AnalysisRequest = { id, root, cacheFile: cacheFileOf(root) }
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject })
        worker!.postMessage(request)
      })
    },
    async stop() {
      const stopping = worker
      worker = undefined
      await stopping?.terminate()
    }
  }
}
