import { defineConfig } from 'vite'
import { commandConfig } from '../cli/command.config'

// `adr-mcp` is built as `adr` is: one file, with what reads the code of the repository —
// TypeScript, tree-sitter —, `core`, `structure`, `conformance`, `diagrams`, `yaml` and `diff`
// in it.
export default defineConfig(commandConfig('adr-mcp.mjs'))
