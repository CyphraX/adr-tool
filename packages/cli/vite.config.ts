import { defineConfig } from 'vite'
import { commandConfig } from './command.config'

// `adr`: `core`, `structure`, `conformance`, `diagrams`, TypeScript, tree-sitter and `yaml` in
// one file.
export default defineConfig(commandConfig('adr.mjs'))
