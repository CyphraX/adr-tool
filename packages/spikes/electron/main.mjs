// Spike (a), the part that is run by hand: tree-sitter as WebAssembly inside Electron —
// in the main process, in a worker thread of the main process, and in a utility process.
//
//   packages/app/node_modules/.bin/electron packages/spikes/electron/main.mjs
//
// It opens no window, prints one line per host and quits. SPIKE_OUT names a file to write
// the same lines to, for shells that do not show Electron's standard output.
import { app, utilityProcess } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { Language, Parser } from 'web-tree-sitter'

const require = createRequire(import.meta.url)
const SOURCE = 'package a.b;\nimport a.c.D;\nclass C {}\n'

const timeout = (name) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${name}: no answer in 20 s`)), 20000)
  )

async function inMainProcess(wasm) {
  await Parser.init({ wasmBinary: wasm.runtime })
  const parser = new Parser()
  parser.setLanguage(await Language.load(wasm.grammar))
  const started = performance.now()
  const root = parser.parse(SOURCE).rootNode
  return `${root.namedChildren.map((node) => node.type).join(', ')} (${(performance.now() - started).toFixed(1)} ms)`
}

function inWorkerThread(wasm) {
  const worker = new Worker(new URL('../test/java-worker.mjs', import.meta.url), {
    workerData: wasm
  })
  return new Promise((resolve, reject) => {
    worker.once('message', (message) => resolve(JSON.stringify(message)))
    worker.once('error', reject)
  })
}

function inUtilityProcess(wasm) {
  const child = utilityProcess.fork(fileURLToPath(new URL('./utility.mjs', import.meta.url)))
  return new Promise((resolve, reject) => {
    child.once('message', (message) => {
      child.kill()
      resolve(JSON.stringify(message))
    })
    child.once('exit', (code) => reject(new Error(`utility process exited with ${code}`)))
    child.once('spawn', () => child.postMessage(wasm))
  })
}

// Not `await app.whenReady()` at the top level: Electron emits `ready` only after an ESM
// entry point has finished loading, so the two would wait for each other.
app.whenReady().then(run)

async function run() {
  const wasm = {
    runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
    grammar: await readFile(require.resolve('tree-sitter-java/tree-sitter-java.wasm'))
  }
  const lines = [
    `electron ${process.versions.electron}, node ${process.versions.node}, ${process.platform}`
  ]
  for (const [name, run] of [
    ['main process', inMainProcess],
    ['worker thread', inWorkerThread],
    ['utility process', inUtilityProcess]
  ]) {
    try {
      lines.push(`${name}: ok — ${await Promise.race([run(wasm), timeout(name)])}`)
    } catch (error) {
      lines.push(`${name}: FAILED — ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  console.log(lines.join('\n'))
  if (process.env.SPIKE_OUT) await writeFile(process.env.SPIKE_OUT, lines.join('\n') + '\n')
  app.exit(lines.some((line) => line.includes('FAILED')) ? 1 : 0)
}
