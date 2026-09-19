import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '../src'
import { discoverLogs } from '../src/log/discover'

const ADR = '# An ADR\n'

describe('discoverLogs', () => {
  it('prefers the configuration over everything else', async () => {
    const fs = memoryFileSystem({
      '.adr/config.yml':
        'logs:\n  - path: architecture/decisions\n    naming: date\n  - path: ./docs/adr/\n',
      '.adr-dir': 'doc/adr\n',
      'docs/adr/0001-a.md': ADR
    })
    expect(await discoverLogs(fs)).toEqual({
      by: 'config',
      locations: [{ path: 'architecture/decisions', naming: 'date' }, { path: 'docs/adr' }],
      problems: []
    })
  })

  it("falls back to adr-tools' .adr-dir, also when written on Windows", async () => {
    const fs = memoryFileSystem({ '.adr-dir': 'doc\\architecture\r\n', 'docs/adr/0001-a.md': ADR })
    expect(await discoverLogs(fs)).toEqual({
      by: 'adr-dir',
      locations: [{ path: 'doc/architecture' }],
      problems: []
    })
  })

  it('takes every well-known directory that exists', async () => {
    const fs = memoryFileSystem({ 'docs/decisions/0001-a.md': ADR, 'docs/adr/0001-b.md': ADR })
    const found = await discoverLogs(fs)
    expect(found.by).toBe('default')
    expect(found.locations).toEqual([{ path: 'docs/adr' }, { path: 'docs/decisions' }])
  })

  it('finds nothing in a repository without ADRs, so the app can ask', async () => {
    const fs = memoryFileSystem({ 'README.md': '# Hello\n' })
    expect(await discoverLogs(fs)).toEqual({ by: 'none', locations: [], problems: [] })
  })

  it('moves on when the configuration lists no logs', async () => {
    const fs = memoryFileSystem({ '.adr/config.yml': '# nothing yet\n', 'doc/adr/0001-a.md': ADR })
    expect((await discoverLogs(fs)).by).toBe('default')
  })

  it('stops at configuration it cannot use instead of hiding the mistake', async () => {
    const broken = [
      'logs: [unclosed',
      'logs: docs/adr',
      'logs:\n  - path: ../elsewhere',
      'logs:\n  - path: /etc/adr',
      'logs:\n  - path: C:/adr',
      'logs:\n  - path: docs/adr\n    naming: random'
    ]
    for (const config of broken) {
      const fs = memoryFileSystem({ '.adr/config.yml': config, 'docs/adr/0001-a.md': ADR })
      const found = await discoverLogs(fs)
      expect(found.by, config).toBe('config')
      expect(found.locations, config).toEqual([])
      expect(found.problems, config).toMatchObject([
        { kind: 'invalid-configuration', path: '.adr/config.yml' }
      ])
    }
  })
})
