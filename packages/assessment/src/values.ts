/**
 * The values of a YAML mapping — a frontmatter, an entry's block, an item of evidence — read
 * tolerantly: what is of the wrong form is said through `wrong`, and read as if it were absent.
 */
import { isScalar, isSeq, type Scalar, type YAMLMap } from 'yaml'
import { isDay } from '@adr-tool/kernel'
import type { AssessmentSaid } from './sentences'
import { pairOf, parseRegion, scalarText, type Region } from './yaml'
import type { FileView } from './text'

/** What is wrong with the value of a key, at the line of the key. */
export type Wrong = (key: string, line: number, detail: AssessmentSaid) => void

export interface Values {
  /** Whether the key is there with a value. */
  has(key: string): boolean
  /** The line of the key, from 1; the line of the mapping where it is not there. */
  line(key: string): number
  /** A text, or nothing. */
  text(key: string, detail?: AssessmentSaid): string | undefined
  /** A day, `YYYY-MM-DD`, or nothing. */
  day(key: string): string | undefined
  /** One of `allowed`, `absent` where the key is not there, or nothing. */
  oneOf<T extends string>(
    key: string,
    allowed: readonly T[],
    detail: AssessmentSaid,
    absent?: T
  ): T | undefined
  /** A list of texts, a single one read as a list of one; `undefined` where it is not there. */
  texts(key: string, detail: AssessmentSaid): string[] | undefined
}

const NEEDS_TEXT: AssessmentSaid = { code: 'must-be-text', values: {} }

export function valuesOf(region: Region, map: YAMLMap | undefined, wrong: Wrong): Values {
  const pair = (key: string) => pairOf(map, key)
  const node = (key: string): unknown => pair(key)?.value ?? undefined
  const has = (key: string): boolean => {
    const value = node(key)
    return value !== undefined && value !== null && !(isScalar(value) && value.value === null)
  }
  const line = (key: string): number => {
    const found = pair(key)?.key as Scalar | undefined
    const at = found?.range?.[0] ?? (map as { range?: number[] } | undefined)?.range?.[0] ?? 0
    return region.lineOf(at)
  }
  const text = (key: string, detail: AssessmentSaid = NEEDS_TEXT): string | undefined => {
    if (!has(key)) return undefined
    const value = node(key)
    if (!isScalar(value)) {
      wrong(key, line(key), detail)
      return undefined
    }
    return scalarText(value)
  }
  return {
    has,
    line,
    text,
    day: (key) => {
      const value = text(key, { code: 'must-be-day', values: {} })
      if (value === undefined || isDay(value)) return value
      wrong(key, line(key), { code: 'must-be-day', values: {} })
      return undefined
    },
    oneOf: (key, allowed, detail, absent) => {
      if (!has(key)) return absent
      const value = text(key, detail)
      if (value === undefined) return undefined
      if ((allowed as readonly string[]).includes(value)) return value as (typeof allowed)[number]
      wrong(key, line(key), detail)
      return undefined
    },
    texts: (key, detail) => {
      if (!has(key)) return undefined
      const value = node(key)
      if (isScalar(value)) return [scalarText(value)!]
      if (!isSeq(value)) {
        wrong(key, line(key), detail)
        return undefined
      }
      const items: string[] = []
      for (const item of value.items) {
        const one = isScalar(item) ? scalarText(item) : undefined
        if (one === undefined) {
          wrong(key, line(key), detail)
          return undefined
        }
        if (!items.includes(one)) items.push(one)
      }
      return items
    }
  }
}

/** The frontmatter of a file, once it can be read; or why it cannot. */
export type ReadFrontmatter =
  | { readonly region: Region | undefined; readonly unreadable?: undefined }
  | { readonly unreadable: AssessmentSaid; readonly region?: undefined }

/**
 * The frontmatter of a file, as an ADR's is found (docs/file-format.md, section 2). A file
 * without one has none to read, which is not wrong; one that is never closed, is not YAML — a
 * key written twice among it — or is not a mapping, cannot be read.
 */
export function frontmatterOf(view: FileView, path: string): ReadFrontmatter {
  if (view.unterminated) return { unreadable: { code: 'frontmatter-left-open', values: {} } }
  if (!view.frontmatter) return { region: undefined }
  const region = parseRegion(view.text, view.frontmatter, view.eol, path)
  if (region.doc.errors.length > 0) {
    return {
      unreadable: { code: 'frontmatter-not-valid-yaml', values: { message: region.errors[0]! } }
    }
  }
  if (region.errors.length > 0) return { unreadable: { code: 'frontmatter-no-mapping', values: {} } }
  return { region }
}
