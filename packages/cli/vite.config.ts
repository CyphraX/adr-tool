import { defineConfig } from 'vite'
import { oneFile } from './bundle'

// The command is one file that Node.js runs as it is (`bundle.ts`): `core`, `structure`,
// `conformance`, `diagrams`, TypeScript, tree-sitter and `yaml` are bundled into it.
export default defineConfig(oneFile('src/main.ts', 'adr.mjs'))
