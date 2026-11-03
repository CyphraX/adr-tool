import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import { pythonProjects } from '../../src/python/projects'

/** The source roots of each Python project of a repository given as path → text. */
async function rootsOf(repository: Record<string, string>) {
  const files = Object.keys(repository)
  const python = files.filter((path) => path.endsWith('.py'))
  const projects = await pythonProjects(memoryFileSystem(repository), files, python)
  return Object.fromEntries(projects.map((project) => [project.directory, project.roots]))
}

describe('the source roots of Python projects (docs/structure-format.md, section 3, "Python")', () => {
  it('reads a setup.cfg with a line of a megabyte as fast as it is long', async () => {
    const started = performance.now()
    const roots = await rootsOf({
      'setup.cfg': [
        '[options]',
        `x${' '.repeat(1_000_000)}y`,
        `${'k'.repeat(1_000_000)}`,
        'package_dir =',
        '    =lib',
        ''
      ].join('\n'),
      'lib/shop/__init__.py': ''
    })
    expect(performance.now() - started).toBeLessThan(2000)
    expect(roots).toEqual({ '': ['lib', ''] })
  })

  it('takes the directory of a Hatch package, however many slashes end it, as fast', async () => {
    const started = performance.now()
    const roots = await rootsOf({
      'pyproject.toml': `[tool.hatch.build.targets.wheel]\npackages = ["src/shop${'/'.repeat(1_000_000)}"]\n`,
      'src/shop/__init__.py': ''
    })
    expect(performance.now() - started).toBeLessThan(2000)
    expect(roots).toEqual({ '': ['src', ''] })
  })
})
