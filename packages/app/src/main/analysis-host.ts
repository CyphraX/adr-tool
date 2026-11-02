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
  interface Running {
    readonly worker: Worker
    /** What was asked of this worker, and waits for its answer. */
    readonly waiting: Map<
      number,
      { resolve: (analysis: Analysis) => void; reject: (error: Error) => void }
    >
  }
  let current: Running | undefined
  let next = 0

  const start = (): Running => {
    const running: Running = { worker: createAnalysisWorker({}), waiting: new Map() }
    // A worker that stops fails what it was asked; its successor's requests are its own.
    const failAll = (reason: string): void => {
      for (const { reject } of running.waiting.values()) reject(new Error(reason))
      running.waiting.clear()
      if (current === running) current = undefined
    }
    running.worker.on('message', (answer: Answer) => {
      const asked = running.waiting.get(answer.id)
      running.waiting.delete(answer.id)
      if (answer.ok) asked?.resolve(answer.analysis)
      else asked?.reject(new Error(answer.reason))
    })
    running.worker.on('error', (error) => failAll(String(error)))
    running.worker.on('exit', (code) => failAll(`The analysis stopped (${code}).`))
    return running
  }

  return {
    analyse(root) {
      const running = (current ??= start())
      const id = next++
      const request: AnalysisRequest = { id, root, cacheFile: cacheFileOf(root) }
      return new Promise((resolve, reject) => {
        running.waiting.set(id, { resolve, reject })
        running.worker.postMessage(request)
      })
    },
    async stop() {
      const stopping = current
      current = undefined
      await stopping?.worker.terminate()
    }
  }
}
