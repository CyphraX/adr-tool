import { describe, expect, it } from 'vitest'
import { firstLog, memoryFileSystem } from '../src'

describe('where the first ADR of a repository goes (docs/file-format.md, section 6)', () => {
  it('goes to docs/adr without any configuration', async () => {
    expect(await firstLog(memoryFileSystem({ 'README.md': '# Hello\n' }))).toEqual({
      log: expect.objectContaining({ path: 'docs/adr', naming: 'sequential', adrs: [] })
    })
  })

  it('goes where the configuration says, with its naming, before the directory exists', async () => {
    expect(
      await firstLog(
        memoryFileSystem({ '.adr/config.yml': 'logs:\n  - path: decisions\n    naming: date\n' })
      )
    ).toEqual({ log: expect.objectContaining({ path: 'decisions', naming: 'date' }) })
    expect(
      await firstLog(memoryFileSystem({ '.adr-dir': 'doc/architecture/decisions\n' }))
    ).toEqual({
      log: expect.objectContaining({ path: 'doc/architecture/decisions' })
    })
  })

  it('goes nowhere while the configuration cannot be used', async () => {
    expect(await firstLog(memoryFileSystem({ '.adr-dir': '../elsewhere\n' }))).toMatchObject({
      reason:
        '.adr-dir cannot be used: The directory must be a relative path inside the repository. Repair it first.'
    })
  })
})
