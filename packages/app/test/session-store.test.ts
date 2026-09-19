import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readSession, writeSession } from '../src/main/session-store'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'adr-tool-session-'))
})
afterEach(() => rm(directory, { recursive: true, force: true }))

describe('the stored session', () => {
  it('comes back as it was written, and creates its directory', async () => {
    const file = join(directory, 'nested', 'session.json')
    const session = { roots: ['/work/webshop', '/work/adr-tool'], activeRoot: '/work/adr-tool' }
    await writeSession(file, session)
    expect(await readSession(file)).toEqual(session)
  })

  it('is empty on the first start', async () => {
    expect(await readSession(join(directory, 'session.json'))).toEqual({ roots: [] })
  })

  it('is empty rather than fatal when the file is damaged or has another shape', async () => {
    const file = join(directory, 'session.json')
    for (const content of ['{ not json', '[]', '{"roots": "one"}', 'null']) {
      await writeFile(file, content)
      expect(await readSession(file), content).toEqual({ roots: [] })
    }
    await writeFile(file, '{"roots": ["/a", 7], "activeRoot": 3}')
    expect(await readSession(file)).toEqual({ roots: ['/a'] })
  })
})
