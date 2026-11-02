import { constants } from 'node:fs'
import { open, realpath, type FileHandle } from 'node:fs/promises'
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
  readonly size: number
  /**
   * The bytes, read as they are asked for: a large image is never held in memory whole. The
   * file is closed when the stream ends or is cancelled, so it has to be read or cancelled.
   */
  readonly body: ReadableStream<Uint8Array>
}

const within = (base: string, full: string): boolean => full.startsWith(base + sep)

const typeOf = (path: string): string | undefined => IMAGE_TYPES[extname(path).toLowerCase()]

/**
 * The image at `path` below `root`, or `undefined` for anything that is not one: another kind
 * of file, a path outside the root, a file that is missing or too large.
 */
export async function readAsset(root: string, path: string): Promise<Asset | undefined> {
  if (path === '' || path.includes('\0') || isAbsolute(path)) return undefined
  if (typeOf(path) === undefined) return undefined
  const base = resolve(root)
  const full = resolve(base, path)
  if (!within(base, full)) return undefined
  let handle: FileHandle | undefined
  try {
    // The same question once more with the links resolved: a link inside the root may point
    // anywhere on the disk — and what it points to has to be an image by its own name too.
    const [realBase, realFull] = await Promise.all([realpath(base), realpath(full)])
    const type = typeOf(realFull)
    if (!within(realBase, realFull) || type === undefined) return undefined
    // What is checked from here on is the file that is open, not a name that could be swapped
    // in the meantime: a link put in place of the file itself is not followed.
    handle = await open(realFull, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    const info = await handle.stat()
    if (!info.isFile() || info.size > ASSET_LIMIT) {
      await handle.close()
      return undefined
    }
    return { type, size: info.size, body: streamOf(handle, info.size) }
  } catch {
    await handle?.close().catch(() => undefined)
    return undefined
  }
}

const CHUNK = 64 * 1024

/** The first `size` bytes of an open file — what it had when it was checked, never more. */
function streamOf(handle: FileHandle, size: number): ReadableStream<Uint8Array> {
  let position = 0
  const finish = async (controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> => {
    await handle.close().catch(() => undefined)
    controller.close()
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const wanted = Math.min(CHUNK, size - position)
        if (wanted <= 0) return await finish(controller)
        const chunk = new Uint8Array(wanted)
        const { bytesRead } = await handle.read(chunk, 0, wanted, position)
        if (bytesRead === 0) return await finish(controller)
        position += bytesRead
        controller.enqueue(chunk.subarray(0, bytesRead))
      } catch (error) {
        await handle.close().catch(() => undefined)
        controller.error(error)
      }
    },
    async cancel() {
      await handle.close().catch(() => undefined)
    }
  })
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
    // A decoded segment that holds a slash says something other than its URL. Steps up are
    // taken by the URL parser already, and readAsset refuses whatever leads out of the root.
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
    return new Response(asset.body, {
      headers: {
        'content-type': asset.type,
        'content-length': String(asset.size),
        'x-content-type-options': 'nosniff',
        // An SVG opened on its own runs nothing and loads nothing.
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'"
      }
    })
  }
}
