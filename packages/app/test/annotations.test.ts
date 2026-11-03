import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applyChangeSet } from '@adr-tool/core'
import { Annotations, lookAt, planReview, type Looked } from '../src/main/annotations'
import { nodeFileSystem } from '../src/main/node-file-system'
import { reviewRequest } from '../src/main/review-requests'

// docs/plan-vision.md, part 9: the Annotations of a repository in the main process — read, their
// Traces checked, their Anchors found again in the background — and the writes the window asks for.

const CART = [
  'package com.shop.cart;',
  '',
  'public final class Cart {',
  '  public long total() {',
  '    return lines.stream().mapToLong(Line::cents).sum();',
  '  }',
  '',
  '  public int count() {',
  '    return lines.size();',
  '  }',
  '}'
]
const text = (lines: readonly string[]): string => `${lines.join('\n')}\n`

let root: string
const git = (...args: string[]): string =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Aylin Demir',
      GIT_AUTHOR_EMAIL: 'aylin@example.com',
      GIT_COMMITTER_NAME: 'Aylin Demir',
      GIT_COMMITTER_EMAIL: 'aylin@example.com'
    }
  }).trim()
const write = (path: string, content: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}
const commit = (subject: string): void => {
  git('add', '-A')
  git('commit', '-q', '-m', subject)
}

/** Plan a request as the window sends it, and write it. */
async function written(request: unknown, now = new Date('2026-11-03T09:15:00Z')): Promise<void> {
  const asked = reviewRequest(request)
  expect(asked).toBeDefined()
  const plan = await planReview(root, asked!, now)
  if (!plan.ok) throw new Error(plan.reason)
  const applied = await applyChangeSet(nodeFileSystem(root), plan.changeSet)
  expect(applied.applied).toBe(true)
}

beforeAll(() => {
  vi.stubEnv('GIT_CONFIG_GLOBAL', devNull)
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
  root = realpathSync(mkdtempSync(join(tmpdir(), 'adr-tool-review-')))
  git('init', '-q', '-b', 'trunk')
  git('config', 'user.name', 'Aylin Demir')
  git('config', 'user.email', 'aylin@example.com')
  git('config', 'commit.gpgsign', 'false')
  write('src/Cart.java', text(CART))
  write('docs/adr/0001-carts-are-small.md', '---\nstatus: accepted\n---\n\n# Carts are small\n')
  commit('A cart')
})

afterAll(() => {
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

describe('the Annotations of a repository, in the main process', () => {
  it('writes an Annotation on selected lines, a Reply, Resolve and a Trace, as previewed changes', async () => {
    await written({
      kind: 'create',
      type: 'concern',
      text: 'Why is the total computed on every call?',
      author: 'Aylin Demir',
      cites: ['0001-carts-are-small'],
      path: 'src/Cart.java',
      start: 4,
      end: 6
    })
    const id = '20261103-why-is-the-total-computed-on-every-call'
    const file = readFileSync(join(root, `docs/architecture/annotations/${id}.md`), 'utf8')
    expect(file).toContain('type: concern\nstate: open\nauthor: Aylin Demir\ndate: 2026-11-03\n')
    expect(file).toContain('  path: src/Cart.java\n  lines: 4-6\n  commit: ')
    expect(file).toContain('cites: [0001-carts-are-small]\n')
    expect(file).toContain('```java\n  public long total() {\n')

    await written({ kind: 'reply', id, text: 'We cache it.', author: 'Lena Becker' })
    expect(
      readFileSync(
        join(root, `docs/architecture/annotations/${id}/20261103T091500Z-lena-becker.md`),
        'utf8'
      )
    ).toBe('---\nauthor: Lena Becker\ndate: 2026-11-03\n---\n\nWe cache it.\n')
    await written({ kind: 'state', id, state: 'resolved' })
    await written({ kind: 'uncite', id, adr: '0001-carts-are-small' })
    const after = readFileSync(join(root, `docs/architecture/annotations/${id}.md`), 'utf8')
    expect(after).toContain('state: resolved\n')
    expect(after).not.toContain('cites')

    const looked = await lookAt(root)
    const [annotation] = looked.overview.annotations
    expect(annotation).toMatchObject({ id, state: 'resolved', found: { kind: 'unchanged' } })
    expect(annotation!.replies).toHaveLength(1)
    expect(looked.overview.problems).toEqual([])
    expect(looked.overview.head).toMatch(/^[0-9a-f]{40}$/)
    // The Annotations, their Replies, the Source File's directory and git's HEAD are watched.
    expect(looked.watch).toEqual(
      expect.arrayContaining([
        join(root, '.arch'),
        join(root, 'docs/architecture/annotations'),
        join(root, `docs/architecture/annotations/${id}`),
        join(root, 'src'),
        join(root, '.git/HEAD'),
        join(root, '.git/logs/HEAD')
      ])
    )
  })

  it('finds a moved Anchor, plans Update the Anchor, and reports an orphaned one and a Trace to nowhere', async () => {
    await written({
      kind: 'create',
      type: 'question',
      text: 'Is count used?',
      author: 'Aylin Demir',
      cites: [],
      path: 'src/Cart.java',
      start: 8,
      end: 10
    })
    commit('Two Annotations')
    // Lines inserted above both; count() deleted.
    write(
      'src/Cart.java',
      text(['package com.shop.cart;', '', 'import java.util.List;', '', ...CART.slice(2, 7), '}'])
    )
    write(
      'docs/architecture/annotations/20261103-is-count-used.md',
      readFileSync(
        join(root, 'docs/architecture/annotations/20261103-is-count-used.md'),
        'utf8'
      ).replace('type: question', 'type: question\ncites: [0009-gone]')
    )
    commit('Count is gone')

    const looked = await lookAt(root)
    const byId = new Map(looked.overview.annotations.map((one) => [one.id, one]))
    expect(byId.get('20261103-why-is-the-total-computed-on-every-call')?.found).toMatchObject({
      kind: 'moved',
      anchor: { path: 'src/Cart.java', start: 6, end: 8 }
    })
    expect(byId.get('20261103-is-count-used')?.found).toEqual({ kind: 'orphaned', file: 'there' })
    expect(looked.overview.problems.map((problem) => problem.kind).sort()).toEqual([
      'orphaned',
      'unknown-adr'
    ])

    const plan = await planReview(root, {
      kind: 'update-anchor',
      id: '20261103-why-is-the-total-computed-on-every-call'
    })
    expect(plan.ok && plan.changeSet.files[0]!.after).toContain('  lines: 6-8\n')
    // Attach again: the lines a person selected, as they are on disk now.
    const attach = await planReview(root, {
      kind: 'attach',
      id: '20261103-is-count-used',
      path: 'src/Cart.java',
      start: 9,
      end: 9
    })
    expect(attach.ok && attach.changeSet.files[0]!.after).toContain('  lines: 9\n')
    const refused = await planReview(root, { kind: 'cite', id: 'nobody', adr: '0001-x' })
    expect(refused).toMatchObject({ ok: false, said: { code: 'no-annotation' } })
  })

  it('takes only what the contract says from the window', () => {
    expect(reviewRequest({ kind: 'state', id: 'a', state: 'closed' })).toBeUndefined()
    expect(reviewRequest({ kind: 'attach', id: 'a', path: 'x', start: 0, end: 2 })).toBeUndefined()
    expect(
      reviewRequest({ kind: 'create', type: 'remark', text: '', author: '', cites: [] })
    ).toBeUndefined()
    expect(reviewRequest({ kind: 'reply', id: 'a', text: 'x', author: 'y', path: '/etc' })).toEqual(
      { kind: 'reply', id: 'a', text: 'x', author: 'y' }
    )
    expect(reviewRequest({ kind: 'uncite', id: 7, adr: 'x' })).toBeUndefined()
  })
})

describe('the background look at the Annotations', () => {
  const looked = (head: string): Looked => ({
    overview: {
      directory: 'docs/architecture/annotations',
      configUnreadable: false,
      annotations: [],
      problems: [],
      head,
      foundAt: 0
    },
    watch: ['/repository/docs']
  })

  it('answers with the last result while it looks again, and says when it begins and ends', async () => {
    vi.useFakeTimers()
    try {
      let heads = 0
      let release: (() => void) | undefined
      const look = vi.fn(async () => {
        heads += 1
        if (heads > 1) await new Promise<void>((resolve) => (release = resolve))
        return looked(`head-${heads}`)
      })
      const changed = vi.fn()
      let onChange: (() => void) | undefined
      const watched = vi.fn((_paths: readonly string[], changes: () => void) => {
        onChange = changes
        return { close: async () => undefined }
      })
      const annotations = new Annotations(changed, look, watched)

      expect(await annotations.overview('r', '/repository')).toMatchObject({
        repositoryId: 'r',
        head: 'head-1',
        finding: false
      })
      expect(watched).toHaveBeenCalledWith(['/repository/docs'], expect.any(Function))

      // HEAD moved: the window gets the last result, with `finding`, until the new one is there.
      onChange!()
      await vi.advanceTimersByTimeAsync(400)
      expect(changed).toHaveBeenCalledTimes(1)
      expect(await annotations.overview('r', '/repository')).toMatchObject({
        head: 'head-1',
        finding: true
      })
      release!()
      await vi.advanceTimersByTimeAsync(0)
      expect(changed).toHaveBeenCalledTimes(2)
      expect(await annotations.overview('r', '/repository')).toMatchObject({
        head: 'head-2',
        finding: false
      })
      // The same paths are watched by the same watcher.
      expect(watched).toHaveBeenCalledTimes(1)
      await annotations.closeAll()
    } finally {
      vi.useRealTimers()
    }
  })
})
