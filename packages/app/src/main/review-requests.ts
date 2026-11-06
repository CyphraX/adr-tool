import { ANNOTATION_TYPES, type AnnotationType } from '@adr-tool/review'
import type { ReviewRequest } from '../shared/ipc'

/** What a person can type into an Annotation or a Reply at most: a long page, not a file. */
export const MAX_TEXT = 100_000

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const isText = (value: unknown, max = MAX_TEXT): value is string =>
  typeof value === 'string' && value.length <= max
const isLine = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1

/**
 * A write to the Annotations, as the renderer asks for it: untrusted until it has been looked
 * at, as every request is (requests.ts). A request that is not exactly what the contract says
 * is dropped, and only what is named here goes on. Whether an ID, a path or an ADR exists is
 * `review`'s question, against the disk.
 */
export function reviewRequest(value: unknown): ReviewRequest | undefined {
  const given = record(value)
  const { kind, id } = given
  const lines = (): { path: string; start: number; end: number } | undefined => {
    const { path, start, end } = given
    return isText(path, 4096) && isLine(start) && isLine(end) ? { path, start, end } : undefined
  }
  if (kind === 'create') {
    const { type, text, author, cites } = given
    const where = lines()
    const valid =
      where !== undefined &&
      (ANNOTATION_TYPES as readonly unknown[]).includes(type) &&
      isText(text) &&
      isText(author, 1000) &&
      Array.isArray(cites) &&
      cites.length <= 100 &&
      cites.every((adr) => isText(adr, 1000))
    if (!valid) return undefined
    return {
      kind,
      type: type as AnnotationType,
      text: text as string,
      author: author as string,
      cites: [...(cites as string[])],
      ...where
    }
  }
  if (!isText(id, 1000)) return undefined
  switch (kind) {
    case 'reply': {
      const { text, author } = given
      return isText(text) && isText(author, 1000) ? { kind, id, text, author } : undefined
    }
    case 'state': {
      const { state } = given
      return state === 'open' || state === 'resolved' ? { kind, id, state } : undefined
    }
    case 'update-anchor':
      return { kind, id }
    case 'attach': {
      const where = lines()
      return where && { kind, id, ...where }
    }
    case 'cite':
    case 'uncite': {
      const { adr } = given
      return isText(adr, 1000) ? { kind, id, adr } : undefined
    }
    default:
      return undefined
  }
}
