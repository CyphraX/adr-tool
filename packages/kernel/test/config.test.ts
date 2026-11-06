import { describe, expect, it } from 'vitest'
import {
  CONFIG_PATH,
  KERNEL_SENTENCES,
  memoryFileSystem,
  openConfig,
  readConfig,
  sentenceOf,
  type Config
} from '../src'

/** The settings of a file that can be read, as key: value (line). */
function settings(config: Config): string[] {
  if (!config.readable) throw new Error(sentenceOf(KERNEL_SENTENCES, config.problem.said))
  return [...config.settings].map(
    ([key, setting]) => `${key}: ${JSON.stringify(setting.value)} (${setting.line})`
  )
}

/** Why a file cannot be read, as its Problem's line and sentence. */
function unreadable(text: string): string {
  const config = readConfig(text)
  if (config.readable) throw new Error('read')
  expect(config.problem).toMatchObject({ kind: 'unreadable-config', path: CONFIG_PATH })
  return `${config.problem.line}: ${sentenceOf(KERNEL_SENTENCES, config.problem.said)}`
}

// docs/configuration.md: one file of settings, each module under a key of its own.
describe('.arch/config.yml', () => {
  it('gives each key at the top with its value and its line, and knows no module', () => {
    expect(
      settings(
        readConfig(
          [
            '# The settings of the suite',
            'diagrams: design/diagrams',
            '',
            'annotations:',
            '  directory: notes',
            'empty:',
            ''
          ].join('\n')
        )
      )
    ).toEqual([
      'diagrams: "design/diagrams" (2)',
      'annotations: {"directory":"notes"} (4)',
      'empty: null (6)'
    ])
  })

  it('has no settings without the file, and none in an empty one', async () => {
    for (const text of [undefined, '', '# nothing yet\n', '~\n']) {
      expect(settings(readConfig(text))).toEqual([])
    }
    expect(settings(await openConfig(memoryFileSystem({})))).toEqual([])
    expect(
      settings(await openConfig(memoryFileSystem({ [CONFIG_PATH]: 'diagrams: d\n' })))
    ).toEqual(['diagrams: "d" (1)'])
  })

  it('is one Problem when it is not YAML or its top level is not a map, at its line', () => {
    expect(unreadable('diagrams: [oops\n')).toMatch(
      /^\d+: \.arch\/config\.yml cannot be read: it is not valid YAML: .+\. What its settings decide is not done until it is fixed\.$/
    )
    // A key written twice at the top: which one is meant, nobody can tell.
    expect(unreadable('diagrams: a\nother: 1\ndiagrams: b\n')).toMatch(
      /^3: \.arch\/config\.yml cannot be read: it is not valid YAML: /
    )
    expect(unreadable('- diagrams\n')).toBe(
      '1: .arch/config.yml cannot be read: its top level must be a map. What its settings decide is not done until it is fixed.'
    )
    // Aliases that would grow to a billion values when read out: refused, not read.
    const bomb = [
      'a: &a [x, x, x, x, x, x, x, x, x, x]',
      ...'bcdefghi'
        .split('')
        .map(
          (name, index) =>
            `${name}: &${name} [${Array(10).fill(`*${'abcdefghi'[index]}`).join(', ')}]`
        ),
      'diagrams: *i',
      ''
    ].join('\n')
    expect(unreadable(bomb)).toMatch(
      /^1: \.arch\/config\.yml cannot be read: it is not valid YAML: .*alias.*\. What its settings decide is not done until it is fixed\.$/i
    )
    const config = readConfig('just text\n')
    expect(config.readable).toBe(false)
    if (!config.readable) {
      expect(config.problem.said).toEqual({
        code: 'unreadable-config',
        values: { path: CONFIG_PATH, detail: { code: 'config-not-map', values: {} } }
      })
    }
  })
})
