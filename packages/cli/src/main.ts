import { run } from './run'

// `adr`, as Node.js runs it: arguments in, text out, the exit code last (docs/cli.md).
process.exitCode = await run(process.argv.slice(2), {
  out: (text) => void process.stdout.write(text),
  err: (text) => void process.stderr.write(text),
  cwd: process.cwd()
})
