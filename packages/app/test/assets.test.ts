import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
  writeFileSync(join(root, 'docs/adr/notes.md'), '# not an image')
  writeFileSync(join(outside, 'secret.png'), 'secret')
  symlinkSync(join(outside, 'secret.png'), join(root, 'docs/adr/img/link.png'))
  symlinkSync(outside, join(root, 'docs/adr/escape'))
})

afterAll(() => rmSync(outside, { recursive: true, force: true }))

describe('an image of a repository, as the main process serves it', () => {
  it('is read from below the root, with the type its extension names', async () => {
    const asset = await readAsset(root, 'docs/adr/img/diagram.png')
    expect(asset?.type).toBe('image/png')
    expect(asset?.bytes.toString()).toBe('png bytes')
    expect((await readAsset(root, 'docs/adr/img/DIAGRAM.PNG'.toLowerCase()))?.type).toBe(
      'image/png'
    )
  })

  it('is nothing but an image', async () => {
    expect(await readAsset(root, 'docs/adr/notes.md')).toBeUndefined()
    expect(await readAsset(root, 'docs/adr/img')).toBeUndefined()
    expect(await readAsset(root, 'docs/adr/img/missing.png')).toBeUndefined()
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
    expect(await found.text()).toBe('png bytes')
    for (const url of [
      'adr-asset://repo-2/docs/adr/img/diagram.png',
      'adr-asset://repo-1/docs/adr/notes.md',
      'adr-asset://repo-1/../secret.png',
      'adr-asset://repo-1/docs/adr/img/link.png'
    ]) {
      expect((await handle(new Request(url))).status).toBe(404)
    }
  })
})
