import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('./fixtures/', import.meta.url))

/** A fixture's text exactly as it is on disk. Fixtures are exempt from git's line-ending normalization. */
export function fixture(path: string): string {
  return readFileSync(root + path, 'utf8')
}

export function fixtureNames(directory: string): string[] {
  return readdirSync(root + directory).filter((name) => name.endsWith('.md'))
}

/** Split into lines that keep their line break, so a comparison sees `\r\n` versus `\n`. */
export function lines(text: string): string[] {
  return text.split(/(?<=\n)/)
}

/** This repository's own ADRs: the tool's first real-world fixture (docs/plan.md, M1). */
export function ownAdrs(): { name: string; text: string }[] {
  const directory = fileURLToPath(new URL('../../../docs/adr/', import.meta.url))
  return readdirSync(directory)
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ name, text: readFileSync(directory + name, 'utf8') }))
}
