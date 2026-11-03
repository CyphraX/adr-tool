/**
 * What the languages read with tree-sitter share (ADR-0008): the runtime, initialised once per
 * thread from the bytes the caller hands in, and how a file with syntax errors is told apart.
 * Nothing here touches the disk.
 */
import { Language, Parser, type Node } from 'web-tree-sitter'

/** The bytes of the two `.wasm` files a language is read with, as the caller found them. */
export interface Grammar {
  /** `web-tree-sitter.wasm` */
  readonly runtime: Uint8Array
  /** `tree-sitter-java.wasm`, `tree-sitter-python.wasm`, `tree-sitter-go.wasm` */
  readonly grammar: Uint8Array
}

let runtime: Promise<void> | undefined

/** A parser for one grammar. The runtime can be initialised once per thread. */
export async function parserOf(wasm: Grammar): Promise<Parser> {
  runtime ??= Parser.init({ wasmBinary: wasm.runtime })
  await runtime
  const parser = new Parser()
  parser.setLanguage(await Language.load(wasm.grammar))
  return parser
}

/** The first node the parser could not read, or put in where something was missing. */
export function firstError(root: Node): Node | undefined {
  let node: Node | null = root
  while (node) {
    if (node.isError || node.isMissing) return node
    node =
      node.children.find((child) => child !== null && (child.hasError || child.isMissing)) ?? null
  }
  return undefined
}
