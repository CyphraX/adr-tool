import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import { DECLARATION_PATH, planRename } from '../src'
import { readDeclaration } from '../src/declaration'

const lines = (...text: string[]): string => text.join('\n') + '\n'
const CRLF = String.fromCharCode(13, 10)

const DECLARED = lines(
  '# The Components of the suite',
  'components:',
  '  core:                 # the Decisions module',
  '    name: Domain core',
  '    paths: [packages/core/src/**]',
  '    components:',
  '      metadata:',
  '        paths: [packages/core/src/metadata/**]',
  '      "lifecycle":',
  '        paths: [packages/core/src/lifecycle/**]',
  '  app:',
  '    paths: [packages/app/src/**]',
  'owner: architecture-team'
)

async function rename(text: string | undefined, id: string, segment: string) {
  const fs = memoryFileSystem(text === undefined ? {} : { [DECLARATION_PATH]: text })
  return planRename(fs, id, segment)
}

/** The lines of the declaration a Rename takes out and puts in. */
async function changed(text: string, id: string, segment: string) {
  const plan = await rename(text, id, segment)
  if (!plan.ok) throw new Error(plan.reason)
  expect(plan.changeSet.files.map((file) => file.path)).toEqual([DECLARATION_PATH])
  const after = plan.changeSet.files[0]!.after
  const [old, now] = [text.split('\n'), after.split('\n')]
  return {
    renamed: plan.renamed,
    after,
    removed: old.filter((line) => !now.includes(line)),
    added: now.filter((line) => !old.includes(line))
  }
}

const ids = (text: string): string[] => {
  const declaration = readDeclaration(text)
  if (declaration.kind !== 'declared') throw new Error(declaration.kind)
  const all: string[] = []
  const walk = (list: typeof declaration.components): void =>
    list.forEach((component) => {
      all.push(component.id)
      walk(component.children)
    })
  walk(declaration.components)
  return all
}

describe('Rename', () => {
  it('rewrites the key where it stands, and the Components below follow', async () => {
    const result = await changed(DECLARED, 'core', 'domain')
    expect(result.renamed).toEqual({ from: 'core', to: 'domain' })
    expect(result.removed).toEqual(['  core:                 # the Decisions module'])
    expect(result.added).toEqual(['  domain:                 # the Decisions module'])
    expect(ids(result.after)).toEqual(['domain', 'domain/metadata', 'domain/lifecycle', 'app'])
  })

  it('renames a Component below another, and keeps the quoting of its key', async () => {
    expect(await changed(DECLARED, 'core/lifecycle', 'workflow')).toMatchObject({
      renamed: { from: 'core/lifecycle', to: 'core/workflow' },
      removed: ['      "lifecycle":'],
      added: ['      "workflow":']
    })
    expect(await changed(DECLARED, 'core/metadata', 'meta')).toMatchObject({
      removed: ['      metadata:'],
      added: ['      meta:']
    })
  })

  it('quotes a segment that YAML would read as something else', async () => {
    expect(await changed(DECLARED, 'app', '2024')).toMatchObject({
      removed: ['  app:'],
      added: ['  "2024":']
    })
  })

  it('works on a map in braces, and keeps CRLF', async () => {
    const braces = lines('components: {core: {paths: [a/**]}, app: {paths: [b/**]}}')
    expect(await changed(braces, 'app', 'ui')).toMatchObject({
      added: ['components: {core: {paths: [a/**]}, ui: {paths: [b/**]}}']
    })
    const crlf = DECLARED.replaceAll('\n', CRLF)
    const { after } = await changed(crlf, 'app', 'ui')
    expect(after).toBe(crlf.replace(`  app:${CRLF}`, `  ui:${CRLF}`))
  })

  it('keeps a name, and shows a Component without one under its new segment', async () => {
    const { after } = await changed(DECLARED, 'core', 'domain')
    const declaration = readDeclaration(after)
    if (declaration.kind !== 'declared') throw new Error(declaration.kind)
    expect(declaration.components.map((component) => component.name)).toEqual([
      'Domain core',
      'app'
    ])
    const again = readDeclaration((await changed(DECLARED, 'app', 'ui')).after)
    if (again.kind !== 'declared') throw new Error(again.kind)
    expect(again.components.map((component) => component.name)).toEqual(['Domain core', 'ui'])
  })
})

describe('Rename is refused', () => {
  it('for a segment that is not one, or does not change anything', async () => {
    for (const segment of ['Domain', 'core/x', '', '-x', 'x-', 'a b']) {
      expect(await rename(DECLARED, 'core', segment)).toEqual({
        ok: false,
        reason: `"${segment}" is not a valid segment of a Component ID. A segment consists of lowercase letters, digits and dashes, and starts and ends with a letter or a digit.`
      })
    }
    expect(await rename(DECLARED, 'core', 'core')).toEqual({
      ok: false,
      reason: 'core has that segment already.'
    })
  })

  it('for a segment a sibling has', async () => {
    expect(await rename(DECLARED, 'app', 'core')).toEqual({
      ok: false,
      reason: 'There is a Component core already.'
    })
    expect(await rename(DECLARED, 'core/metadata', 'lifecycle')).toEqual({
      ok: false,
      reason: 'There is a Component core/lifecycle already.'
    })
  })

  it('for a Component that is not declared, and on the Draft', async () => {
    expect(await rename(DECLARED, 'kernel', 'base')).toEqual({
      ok: false,
      reason: `${DECLARATION_PATH} declares no Component kernel. Look at the file again.`
    })
    const draft = 'Only a declared Component can be renamed. Adopt the Draft first.'
    expect(await rename(undefined, 'core', 'domain')).toEqual({ ok: false, reason: draft })
    expect(await rename('# nothing yet\n', 'core', 'domain')).toEqual({ ok: false, reason: draft })
  })

  it('while the file cannot be read', async () => {
    expect(await rename('components: [oops\n', 'core', 'domain')).toMatchObject({
      ok: false,
      reason: expect.stringMatching(new RegExp(`^${DECLARATION_PATH} cannot be read: `))
    })
  })

  it('where the result would not read back as the same Components under the new IDs', async () => {
    // The second `core` is read by nobody now; with the first renamed, it would be.
    const twice = lines(
      'components:',
      '  core:',
      '    paths: [a/**]',
      '  core:',
      '    paths: [b/**]'
    )
    expect(await rename(twice, 'core', 'domain')).toEqual({
      ok: false,
      reason: `${DECLARATION_PATH} is written in a way the suite cannot rename core in. Change the segment in an editor.`
    })
  })
})
