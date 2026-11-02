import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, resolve, sep } from 'node:path'

/**
 * The images an ADR shows from its own repository. The renderer has no file access, by design:
 * an ADR is untrusted input. So the main process serves them, through a protocol of its own,
 * and serves nothing else — an image, by its extension, from below the root of a repository
 * that is open. A path that leads out of the root is refused, whether with `..`, as an
 * absolute path or through a symbolic link.
 */
export const ASSET_SCHEME = 'adr-asset'

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
}

/** An image larger than this is not an illustration of a decision. */
export const ASSET_LIMIT = 20 * 1024 * 1024

export interface Asset {
  readonly type: string
  readonly bytes: Buffer
}

const within = (base: string, full: string): boolean => full.startsWith(base + sep)

/**
 * The image at `path` below `root`, or `undefined` for anything that is not one: another kind
 * of file, a path outside the root, a file that is missing or too large.
 */
export async function readAsset(root: string, path: string): Promise<Asset | undefined> {
  if (path === '' || path.includes('\0') || isAbsolute(path)) return undefined
  const type = IMAGE_TYPES[extname(path).toLowerCase()]
  if (type === undefined) return undefined
  const base = resolve(root)
  const full = resolve(base, path)
  if (!within(base, full)) return undefined
  try {
    // The same question once more with the links resolved: a link inside the root may point
    // anywhere on the disk.
    const [realBase, realFull] = await Promise.all([realpath(base), realpath(full)])
    if (!within(realBase, realFull)) return undefined
    const info = await stat(realFull)
    if (!info.isFile() || info.size > ASSET_LIMIT) return undefined
    return { type, bytes: await readFile(realFull) }
  } catch {
    return undefined
  }
}

/**
 * The repository and the path an asset URL names: `adr-asset://<repository id>/<path>`, each
 * segment of the path encoded. `undefined` for any other URL.
 */
export function parseAssetUrl(url: string): { repositoryId: string; path: string } | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (parsed.protocol !== `${ASSET_SCHEME}:` || parsed.hostname === '') return undefined
  try {
    const segments = parsed.pathname.split('/').filter((segment) => segment !== '')
    const path = segments.map((segment) => decodeURIComponent(segment)).join('/')
    // A decoded segment that holds a slash or is a step up says something other than its URL.
    if (segments.some((segment) => /%2f|%5c/i.test(segment))) return undefined
    return { repositoryId: parsed.hostname, path }
  } catch {
    return undefined
  }
}

/**
 * Answers a request of the renderer for an asset. Whatever is refused gets the same answer as
 * what does not exist, so that the answers say nothing about the disk.
 */
export function assetHandler(
  rootOf: (repositoryId: string) => string | undefined
): (request: Request) => Promise<Response> {
  return async (request) => {
    const target = parseAssetUrl(request.url)
    const root = target && rootOf(target.repositoryId)
    const asset = target && root !== undefined ? await readAsset(root, target.path) : undefined
    if (!asset) return new Response(null, { status: 404 })
    return new Response(new Uint8Array(asset.bytes), {
      headers: {
        'content-type': asset.type,
        'x-content-type-options': 'nosniff',
        // An SVG opened on its own runs nothing and loads nothing.
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'"
      }
    })
  }
}
