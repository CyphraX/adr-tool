import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assetHandler, parseAssetUrl, readAsset } from '../src/main/assets'

/** A repository with an image next to its ADRs, and a secret beside the repository. */
let outside: string
let root: string

beforeAll(() => {
  outside = realpathSync(mkdtempSync(join(tmpdir(), 'adr-tool-assets-')))
  root = join(outside, 'repo')
  mkdirSync(join(root, 'docs/adr/img'), { recursive: true })
  writeFileSync(join(root, 'docs/adr/img/diagram.png'), 'png bytes')
  writeFileSync(join(root, 'docs/adr/img/LOUD.PNG'), 'loud bytes')
  writeFileSync(join(root, '.env'), 'TOKEN=secret')
  symlinkSync(join(root, '.env'), join(root, 'docs/adr/img/env.png'))
  symlinkSync(join(root, 'docs/adr/img/diagram.png'), join(root, 'docs/adr/img/alias.png'))
  writeFileSync(join(root, 'docs/adr/notes.md'), '# not an image')
  writeFileSync(join(outside, 'secret.png'), 'secret')
  symlinkSync(join(outside, 'secret.png'), join(root, 'docs/adr/img/link.png'))
  symlinkSync(outside, join(root, 'docs/adr/escape'))
})

afterAll(() => rmSync(outside, { recursive: true, force: true }))

/** What an asset's stream holds. */
const text = async (asset: { body: ReadableStream<Uint8Array> } | undefined): Promise<string> =>
  asset ? new Response(asset.body).text() : ''

describe('an image of a repository, as the main process serves it', () => {
  it('is read from below the root, with the type its extension names', async () => {
    const asset = await readAsset(root, 'docs/adr/img/diagram.png')
    expect(asset?.type).toBe('image/png')
    expect(asset?.size).toBe(9)
    expect(await text(asset)).toBe('png bytes')
    const loud = await readAsset(root, 'docs/adr/img/LOUD.PNG')
    expect([loud?.type, await text(loud)]).toEqual(['image/png', 'loud bytes'])
    // A link inside the root to an image inside the root is that image.
    expect(await text(await readAsset(root, 'docs/adr/img/alias.png'))).toBe('png bytes')
  })

  it('is nothing but an image, by its own name and by the name of what a link leads to', async () => {
    expect(await readAsset(root, 'docs/adr/notes.md')).toBeUndefined()
    expect(await readAsset(root, 'docs/adr/img/env.png')).toBeUndefined()
    expect(await readAsset(root, 'docs/adr/img')).toBeUndefined()
    expect(await readAsset(root, 'docs/adr/img/missing.png')).toBeUndefined()
  })

  it('is what the file held when it was checked, however it grows while it is read', async () => {
    writeFileSync(join(root, 'docs/adr/img/growing.png'), 'small')
    const asset = await readAsset(root, 'docs/adr/img/growing.png')
    appendFileSync(join(root, 'docs/adr/img/growing.png'), ' and much larger')
    expect(await text(asset)).toBe('small')
  })

  it('never leads out of the root: not with `..`, not absolute, not through a link', async () => {
    expect(await readAsset(root, '../secret.png')).toBeUndefined()
    expect(await readAsset(root, 'docs/../../secret.png')).toBeUndefined()
    expect(await readAsset(root, join(outside, 'secret.png'))).toBeUndefined()
    expect(await readAsset(root, 'docs/adr/img/link.png')).toBeUndefined()
    expect(await readAsset(root, 'docs/adr/escape/secret.png')).toBeUndefined()
    expect(await readAsset(root, 'docs/adr/img/diagram.png\0.png')).toBeUndefined()
  })
})

describe('the URL of an image', () => {
  it('names a repository and a path, each segment encoded', () => {
    expect(parseAssetUrl('adr-asset://repo-1/docs/adr/img/my%20diagram.png')).toEqual({
      repositoryId: 'repo-1',
      path: 'docs/adr/img/my diagram.png'
    })
  })

  it('is no other URL, and hides no slash in a segment', () => {
    expect(parseAssetUrl('https://example.com/a.png')).toBeUndefined()
    expect(parseAssetUrl('adr-asset:///a.png')).toBeUndefined()
    expect(parseAssetUrl('adr-asset://repo-1/docs%2F..%2F..%2Fsecret.png')).toBeUndefined()
    expect(parseAssetUrl('not a url')).toBeUndefined()
  })

  it('is answered with the image, or with the same 404 for whatever is refused', async () => {
    const handle = assetHandler((id) => (id === 'repo-1' ? root : undefined))
    const found = await handle(new Request('adr-asset://repo-1/docs/adr/img/diagram.png'))
    expect(found.status).toBe(200)
    expect(found.headers.get('content-type')).toBe('image/png')
    expect(found.headers.get('x-content-type-options')).toBe('nosniff')
    expect(found.headers.get('content-length')).toBe('9')
    expect(await found.text()).toBe('png bytes')
    for (const url of [
      'adr-asset://repo-2/docs/adr/img/diagram.png',
      'adr-asset://repo-1/docs/adr/notes.md',
      'adr-asset://repo-1/../secret.png',
      'adr-asset://repo-1/docs/adr/img/link.png',
      'adr-asset://repo-1/docs/adr/img/env.png',
      'adr-asset://repo-1/docs/adr/img%5c..%5c..%5cnotes.png'
    ]) {
      expect((await handle(new Request(url))).status).toBe(404)
    }
  })
})
