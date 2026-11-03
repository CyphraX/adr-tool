import { defineConfig } from 'vite'
import { oneFile } from '../cli/bundle'

// The server is one file that Node.js runs as it is, built as the command line is
// (`packages/cli/bundle.ts`): it reads the code of a Diagram's Drift the way the command does,
// so TypeScript and tree-sitter are bundled into it with `core`, `structure`, `diagrams`,
// the command line's git, `yaml` and `diff`.
export default defineConfig(oneFile('src/main.ts', 'adr-mcp.mjs'))
