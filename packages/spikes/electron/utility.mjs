// Runs as an Electron utility process: a separate process, without Electron's main APIs.
// The parent sends the bytes of the two .wasm files; this parses and answers.
import { Language, Parser } from 'web-tree-sitter'

process.parentPort.once('message', async ({ data }) => {
  await Parser.init({ wasmBinary: data.runtime })
  const parser = new Parser()
  parser.setLanguage(await Language.load(data.grammar))
  const named = parser.parse('package a.b;\nclass C {}\n').rootNode.namedChildren
  process.parentPort.postMessage({
    package: named.find((node) => node.type === 'package_declaration').namedChildren[0].text,
    types: named
      .filter((node) => node.type === 'class_declaration')
      .map((node) => node.childForFieldName('name').text)
  })
})
