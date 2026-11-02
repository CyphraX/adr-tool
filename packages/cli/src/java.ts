import { prepareJava, type JavaReader } from '@adr-tool/structure'
import { grammar, runtime } from 'virtual:tree-sitter-wasm'

let java: Promise<JavaReader> | undefined

/**
 * The reader for Java, prepared once and only for a repository that has Java. The two `.wasm`
 * files of tree-sitter are in the command itself, as base64 (ADR-0017): it is one file with
 * nothing beside it, wherever it is copied to.
 */
export function javaReader(): Promise<JavaReader> {
  java ??= prepareJava({
    runtime: Buffer.from(runtime, 'base64'),
    grammar: Buffer.from(grammar, 'base64')
  })
  return java
}
