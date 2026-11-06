import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { openRepository } from '../src'
import { nodeFileSystem } from './node-file-system'

const root = fileURLToPath(new URL('../../../', import.meta.url))

// The done-when of M1 (docs/plan.md). The counts are exact on purpose: a new ADR in
// docs/adr has to show up here, and a Problem in our own Decision Log fails the build.
it('reads the Decision Log of this repository without a Problem', async () => {
  const repository = await openRepository(nodeFileSystem(root))

  expect(repository.discoveredBy).toBe('default')
  expect(repository.problems).toEqual([])
  expect(repository.logs).toHaveLength(1)

  const log = repository.logs[0]!
  expect(log.path).toBe('docs/adr')
  expect(log.naming).toBe('sequential')
  expect(log.problems).toEqual([])
  expect(log.adrs.map((adr) => [adr.number, adr.id, adr.metadata.status])).toEqual([
    [1, '0001-electron-svelte-typescript-throughout', 'accepted'],
    [2, '0002-never-reserialize-markdown', 'accepted'],
    [3, '0003-on-disk-contract', 'accepted'],
    [4, '0004-operations-return-change-sets', 'accepted'],
    [5, '0005-foreign-formats-are-read-never-written', 'accepted'],
    // Written as proposed; accepting them in the app must not break the build.
    [
      6,
      '0006-one-core-package-per-module-on-a-shared-kernel',
      expect.stringMatching(/^(proposed|accepted)$/)
    ],
    [
      7,
      '0007-the-analysis-never-executes-anything-from-the-analysed',
      expect.stringMatching(/^(proposed|accepted)$/)
    ],
    [
      8,
      '0008-dependencies-come-from-parsers-alone-without-a-type-checker',
      expect.stringMatching(/^(proposed|accepted)$/)
    ],
    [
      9,
      '0009-traces-are-recorded-on-the-source-only-unlike-back',
      expect.stringMatching(/^(proposed|accepted)$/)
    ],
    [10, '0010-the-suite-is-open-source-under-the-mit-licence', 'accepted'],
    [11, '0011-the-product-is-called-softarch-suite', 'accepted'],
    [12, '0012-committing-an-adr-runs-git-commit-for-its-files-only', 'accepted'],
    [13, '0013-agents-write-adrs-through-the-mcp-server-as-previewed-change', 'accepted'],
    [14, '0014-the-export-is-static-html-from-core-printed-to-pdf-by', 'accepted'],
    [15, '0015-a-change-set-is-written-beside-its-files-and-renamed-into', 'accepted'],
    [16, '0016-mermaid-is-drawn-in-the-renderer-and-exported-as-an-image', 'accepted'],
    [17, '0017-rules-and-exceptions-share-one-file-keyed-by-fingerprint', 'accepted'],
    [18, '0018-a-diagram-is-a-yaml-file-and-its-svg-is-committed-beside-it', 'accepted'],
    [19, '0019-an-anchor-is-found-again-by-its-quoted-lines-and-its-history', 'accepted'],
    [20, '0020-git-is-a-port-of-the-kernel-implemented-once-for-node', 'accepted'],
    [21, '0021-an-assessment-is-markdown-with-yaml-blocks-each-risk-a-file', 'accepted'],
    [
      22,
      '0022-a-rule-about-libraries-names-them-as-the-code-imports-them',
      expect.stringMatching(/^(proposed|accepted)$/)
    ],
    [
      23,
      '0023-everything-a-release-runs-is-bundled-and-electron-builder',
      expect.stringMatching(/^(proposed|accepted)$/)
    ],
    [
      24,
      '0024-unmodified-modules-under-epl-2-0-or-the-unlicense-may-ship',
      expect.stringMatching(/^(proposed|accepted)$/)
    ]
  ])
  expect(log.adrs[1]!.title).toBe('The tool never re-serializes Markdown')
  expect(log.adrs[1]!.body.trimStart().startsWith('# The tool never re-serializes Markdown')).toBe(
    true
  )
  expect(JSON.parse(JSON.stringify(repository))).toEqual(repository)
  expect(log.adrs[0]!.metadata.decisionMakers).toHaveLength(1)
  expect(log.relations).toEqual([
    {
      type: 'relates-to',
      from: '0003-on-disk-contract',
      to: '0002-never-reserialize-markdown',
      state: 'in-effect'
    },
    {
      type: 'depends-on',
      from: '0004-operations-return-change-sets',
      to: '0002-never-reserialize-markdown',
      state: 'in-effect'
    },
    ...[
      '0002-never-reserialize-markdown',
      '0003-on-disk-contract',
      '0004-operations-return-change-sets'
    ].map((to) => ({
      type: 'depends-on',
      from: '0005-foreign-formats-are-read-never-written',
      to,
      state: 'in-effect'
    })),
    // What ADR-0006 depends on is pending until it is accepted.
    ...['0001-electron-svelte-typescript-throughout', '0004-operations-return-change-sets'].map(
      (to) => ({
        type: 'depends-on',
        from: '0006-one-core-package-per-module-on-a-shared-kernel',
        to,
        state: log.adrs[5]!.metadata.status === 'proposed' ? 'pending' : 'in-effect'
      })
    ),
    {
      type: 'relates-to',
      from: '0007-the-analysis-never-executes-anything-from-the-analysed',
      to: '0006-one-core-package-per-module-on-a-shared-kernel',
      state: log.adrs[6]!.metadata.status === 'proposed' ? 'pending' : 'in-effect'
    },
    {
      type: 'depends-on',
      from: '0008-dependencies-come-from-parsers-alone-without-a-type-checker',
      to: '0007-the-analysis-never-executes-anything-from-the-analysed',
      state: log.adrs[7]!.metadata.status === 'proposed' ? 'pending' : 'in-effect'
    },
    {
      type: 'depends-on',
      from: '0009-traces-are-recorded-on-the-source-only-unlike-back',
      to: '0006-one-core-package-per-module-on-a-shared-kernel',
      state: log.adrs[8]!.metadata.status === 'proposed' ? 'pending' : 'in-effect'
    },
    {
      type: 'depends-on',
      from: '0015-a-change-set-is-written-beside-its-files-and-renamed-into',
      to: '0004-operations-return-change-sets',
      state: 'in-effect'
    },
    {
      type: 'amends',
      from: '0016-mermaid-is-drawn-in-the-renderer-and-exported-as-an-image',
      to: '0014-the-export-is-static-html-from-core-printed-to-pdf-by',
      state: 'in-effect'
    },
    ...[
      '0002-never-reserialize-markdown',
      '0007-the-analysis-never-executes-anything-from-the-analysed',
      '0009-traces-are-recorded-on-the-source-only-unlike-back'
    ].map((to) => ({
      type: 'depends-on',
      from: '0017-rules-and-exceptions-share-one-file-keyed-by-fingerprint',
      to,
      state: 'in-effect'
    })),
    ...[
      '0002-never-reserialize-markdown',
      '0003-on-disk-contract',
      '0004-operations-return-change-sets',
      '0006-one-core-package-per-module-on-a-shared-kernel'
    ].map((to) => ({
      type: 'depends-on',
      from: '0018-a-diagram-is-a-yaml-file-and-its-svg-is-committed-beside-it',
      to,
      state: 'in-effect'
    })),
    ...[
      '0004-operations-return-change-sets',
      '0020-git-is-a-port-of-the-kernel-implemented-once-for-node'
    ].map((to) => ({
      type: 'depends-on',
      from: '0019-an-anchor-is-found-again-by-its-quoted-lines-and-its-history',
      to,
      state: 'in-effect'
    })),
    {
      type: 'relates-to',
      from: '0019-an-anchor-is-found-again-by-its-quoted-lines-and-its-history',
      to: '0002-never-reserialize-markdown',
      state: 'in-effect'
    },
    {
      type: 'depends-on',
      from: '0020-git-is-a-port-of-the-kernel-implemented-once-for-node',
      to: '0006-one-core-package-per-module-on-a-shared-kernel',
      state: 'in-effect'
    },
    ...[
      '0007-the-analysis-never-executes-anything-from-the-analysed',
      '0012-committing-an-adr-runs-git-commit-for-its-files-only'
    ].map((to) => ({
      type: 'relates-to',
      from: '0020-git-is-a-port-of-the-kernel-implemented-once-for-node',
      to,
      state: 'in-effect'
    })),
    ...[
      '0002-never-reserialize-markdown',
      '0003-on-disk-contract',
      '0009-traces-are-recorded-on-the-source-only-unlike-back'
    ].map((to) => ({
      type: 'depends-on',
      from: '0021-an-assessment-is-markdown-with-yaml-blocks-each-risk-a-file',
      to,
      state: 'in-effect'
    })),
    ...[
      '0017-rules-and-exceptions-share-one-file-keyed-by-fingerprint',
      '0018-a-diagram-is-a-yaml-file-and-its-svg-is-committed-beside-it'
    ].map((to) => ({
      type: 'relates-to',
      from: '0021-an-assessment-is-markdown-with-yaml-blocks-each-risk-a-file',
      to,
      state: 'in-effect'
    })),
    // What ADR-0022 depends on and relates to is pending until it is accepted.
    ...(
      [
        ['depends-on', '0017-rules-and-exceptions-share-one-file-keyed-by-fingerprint'],
        ['relates-to', '0007-the-analysis-never-executes-anything-from-the-analysed'],
        ['relates-to', '0008-dependencies-come-from-parsers-alone-without-a-type-checker']
      ] as const
    ).map(([type, to]) => ({
      type,
      from: '0022-a-rule-about-libraries-names-them-as-the-code-imports-them',
      to,
      state:
        log.adrs.find((adr) => adr.number === 22)!.metadata.status === 'proposed'
          ? 'pending'
          : 'in-effect'
    })),
    // So are those of ADR-0023, the packaging of the release, and ADR-0024, which amends ADR-0010.
    ...(
      [
        [
          23,
          '0023-everything-a-release-runs-is-bundled-and-electron-builder',
          'relates-to',
          '0008-dependencies-come-from-parsers-alone-without-a-type-checker'
        ],
        [
          23,
          '0023-everything-a-release-runs-is-bundled-and-electron-builder',
          'relates-to',
          '0010-the-suite-is-open-source-under-the-mit-licence'
        ],
        [
          23,
          '0023-everything-a-release-runs-is-bundled-and-electron-builder',
          'relates-to',
          '0011-the-product-is-called-softarch-suite'
        ],
        [
          24,
          '0024-unmodified-modules-under-epl-2-0-or-the-unlicense-may-ship',
          'amends',
          '0010-the-suite-is-open-source-under-the-mit-licence'
        ],
        [
          24,
          '0024-unmodified-modules-under-epl-2-0-or-the-unlicense-may-ship',
          'relates-to',
          '0016-mermaid-is-drawn-in-the-renderer-and-exported-as-an-image'
        ],
        [
          24,
          '0024-unmodified-modules-under-epl-2-0-or-the-unlicense-may-ship',
          'relates-to',
          '0023-everything-a-release-runs-is-bundled-and-electron-builder'
        ]
      ] as const
    ).map(([number, from, type, to]) => ({
      type,
      from,
      to,
      state:
        log.adrs.find((adr) => adr.number === number)!.metadata.status === 'proposed'
          ? 'pending'
          : 'in-effect'
    }))
  ])
})
