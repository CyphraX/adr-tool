import { main } from './command'

// `adr-mcp`, as the bundle runs it (vite.config.ts): the command is in command.ts, where the
// tests reach it without starting a server.
process.exitCode = await main(process.argv.slice(2))
