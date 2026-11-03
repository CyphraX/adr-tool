import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { repositoryFiles, walk } from '../src/main/repository-files'

let scratch: string | undefined

function folder(files: Record<string, string>): string {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'adr-tool-files-')))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true })
    writeFileSync(join(scratch, path), text)
  }
  return scratch
}

afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true })
  scratch = undefined
})

describe('the files a repository consists of (docs/structure-format.md, section 2)', () => {
  it('are, in git, what it tracks and still has, and what it neither tracks nor ignores', async () => {
    const top = folder({
      '.gitignore': 'dist/\n',
      'service/src/a.ts': '',
      'service/src/gone.ts': '',
      'service/dist/a.js': '',
      'elsewhere.ts': ''
    })
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: top,
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' }
      })
    git('init', '-q', '-b', 'trunk')
    git('add', '-A')
    git('-c', 'user.name=K', '-c', 'user.email=k@example.com', 'commit', '-q', '-m', 'Start')
    rmSync(join(top, 'service/src/gone.ts'))
    writeFileSync(join(top, 'service/src/new.ts'), '')

    // The directory that was opened lies below the top of the repository.
    expect(await repositoryFiles(join(top, 'service'))).toEqual(['src/a.ts', 'src/new.ts'])
  })

  it('are, without git, what a walk finds that honours .gitignore where it lies', async () => {
    const root = folder({
      '.gitignore': '*.log\n/generated/\n',
      'src/a.ts': '',
      'src/debug.log': '',
      'generated/x.ts': '',
      'packages/web/.gitignore': 'cache/\n!keep.log\n',
      'packages/web/package.json': '{}',
      'packages/web/src/b.ts': '',
      'packages/web/cache/c.ts': '',
      'packages/web/keep.log': '',
      'packages/web/dist/b.js': '',
      'services/api/pyproject.toml': '',
      'services/api/src/api/app.py': '',
      'services/api/build/lib/api/app.py': '',
      'node_modules/lib/index.js': '',
      'docs/build/kept.md': ''
    })
    expect(await walk(root)).toEqual([
      '.gitignore',
      // `build` is build output only next to a build file.
      'docs/build/kept.md',
      'packages/web/.gitignore',
      'packages/web/keep.log',
      'packages/web/package.json',
      'packages/web/src/b.ts',
      'services/api/pyproject.toml',
      'services/api/src/api/app.py',
      'src/a.ts'
    ])
  })
})
