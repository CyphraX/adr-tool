import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Script } from 'node:vm'
import type { Rollup } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import { notices, type NoticesInto } from '../notices'

const scratch = mkdtempSync(join(tmpdir(), 'adr-notices-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** A package in a `node_modules` of its own, whose licence tries to end a comment. */
function installed(name: string, licence: string): string {
  const root = join(scratch, 'node_modules', name)
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name, version: '1.2.3' }))
  writeFileSync(join(root, 'LICENSE'), licence)
  writeFileSync(join(root, 'index.js'), 'module.exports = 1\n')
  return join(root, 'index.js')
}

/** What the plugin does to a build of `modules` whose one chunk is `code`. */
function build(
  into: NoticesInto,
  modules: string[],
  code: string
): { code: string; emitted: string[] } {
  const chunk = { type: 'chunk', fileName: 'adr.mjs', code } as Rollup.OutputChunk
  const bundle: Rollup.OutputBundle = { 'adr.mjs': chunk }
  const emitted: string[] = []
  const context = {
    getModuleIds: () => modules.values(),
    emitFile: (file: { source: string }) => emitted.push(file.source)
  }
  const hook = notices(into).generateBundle as unknown as (
    this: typeof context,
    options: unknown,
    bundle: Rollup.OutputBundle
  ) => void
  hook.call(context, {}, bundle)
  return { code: chunk.code, emitted }
}

describe('the notices of what a build bundles', () => {
  const module = installed('tricky', 'The Tricky Licence. */ globalThis.broken = true /*')

  it('end a command as one comment, which nothing in a licence can close', () => {
    const { code, emitted } = build('comment', [module, '/src/own.ts'], 'const own = 1\n')
    expect(emitted).toEqual([])
    expect(code).toMatch(/^const own = 1\n\n\/\*\nSoftarch Suite contains the following packages/)
    expect(code).toContain('tricky 1.2.3\n\nThe Tricky Licence.')
    expect(code.trimEnd().endsWith('*/')).toBe(true)
    expect(code.match(/\*\//g)).toHaveLength(1)
    const context: { broken?: boolean } = {}
    new Script(code).runInNewContext(context)
    expect(context.broken).toBeUndefined()
  })

  it('are a file beside the build for the app, and the code stays as it is', () => {
    const { code, emitted } = build('file', [module], 'const own = 1\n')
    expect(code).toBe('const own = 1\n')
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toContain('tricky 1.2.3\n\nThe Tricky Licence. */ globalThis.broken')
  })

  it('leave a build alone that bundles nothing from node_modules', () => {
    expect(build('comment', ['/src/own.ts'], 'const own = 1\n')).toEqual({
      code: 'const own = 1\n',
      emitted: []
    })
  })
})
