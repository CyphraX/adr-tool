// Runs inside a worker thread, in plain JavaScript so that Node loads it without a transform.
// It repeats the few calls of src/java-outline.ts: what is proven here is that the WebAssembly
// runtime initialises and parses off the main thread, from bytes handed over by the parent.
import { parentPort, workerData } from 'node:worker_threads'
import { Language, Parser } from 'web-tree-sitter'

await Parser.init({ wasmBinary: workerData.runtime })
const parser = new Parser()
parser.setLanguage(await Language.load(workerData.grammar))

const root = parser.parse('package a.b;\nclass C {}\n').rootNode
const named = root.namedChildren
parentPort.postMessage({
  package: named.find((node) => node.type === 'package_declaration').namedChildren[0].text,
  types: named
    .filter((node) => node.type === 'class_declaration')
    .map((node) => node.childForFieldName('name').text)
})
