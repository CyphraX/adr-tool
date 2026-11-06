import { readFileSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { main } from '../src/command'

const VERSION = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string
  }
).version

/** Runs the command as a shell would, and keeps what it prints; its input is closed at once. */
async function adrMcp(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  let out = ''
  let err = ''
  stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
  stderr.on('data', (chunk: Buffer) => (err += chunk.toString()))
  stdin.end()
  const code = await main(args, { stdin, stdout, stderr })
  return { code, out, err }
}

describe('adr-mcp on the command line (docs/mcp.md)', () => {
  it('prints the version of its package with --version, and ends with 0', async () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    for (const args of [['--version'], ['-v'], ['.', '--version']]) {
      expect(await adrMcp(...args)).toEqual({ code: 0, out: `${VERSION}\n`, err: '' })
    }
  })

  it('is the version of the whole suite, which the release is tagged by', () => {
    const root = JSON.parse(
      readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
    ) as { version: string }
    expect(VERSION).toBe(root.version)
  })

  it('prints its usage with --help, and refuses what it does not understand', async () => {
    const help = await adrMcp('--help')
    expect(help.code).toBe(0)
    expect(help.out).toMatch(/^Usage: adr-mcp \[path\]\n {7}adr-mcp --version\n/)
    const wrong = await adrMcp('--port', '3000')
    expect(wrong.code).toBe(2)
    expect(wrong.err).toMatch(/^adr-mcp: --port 3000 is not understood\.\n\nUsage:/)
  })
})
