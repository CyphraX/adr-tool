import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import { manifestLibraries } from '../src/manifests'

const read = (repository: Record<string, string>) =>
  manifestLibraries(memoryFileSystem(repository), Object.keys(repository))

describe('the Libraries the manifests declare (docs/structure-format.md, section 3, "Manifests")', () => {
  it('reads PEP 621, PEP 735 and Poetry from pyproject.toml, with the group of each', async () => {
    expect(
      await read({
        'pyproject.toml': [
          '[project]',
          'dependencies = ["requests[socks] >= 2.31 ; python_version < \'3.13\'", "attrs", "pip @ https://example.com/pip.whl"]',
          '[project.optional-dependencies]',
          'docs = ["sphinx (>=7)"]',
          '[dependency-groups]',
          'test = ["pytest>=8", { include-group = "docs" }]',
          '[tool.poetry.dependencies]',
          'python = "^3.11"',
          'pydantic = "^2.0"',
          'local = { path = "../local" }',
          'rich = { version = "^13", optional = true }',
          '[tool.poetry.dev-dependencies]',
          'black = "*"',
          '[tool.poetry.group.lint.dependencies]',
          'ruff = "^0.6"'
        ].join('\n')
      })
    ).toEqual([
      { manifest: 'pyproject.toml', name: 'requests', version: '>= 2.31' },
      { manifest: 'pyproject.toml', name: 'attrs' },
      { manifest: 'pyproject.toml', name: 'pip' },
      { manifest: 'pyproject.toml', name: 'sphinx', version: '>=7', group: 'docs' },
      { manifest: 'pyproject.toml', name: 'pytest', version: '>=8', group: 'test' },
      { manifest: 'pyproject.toml', name: 'pydantic', version: '^2.0' },
      { manifest: 'pyproject.toml', name: 'local' },
      { manifest: 'pyproject.toml', name: 'rich', version: '^13' },
      { manifest: 'pyproject.toml', name: 'black', version: '*', group: 'dev' },
      { manifest: 'pyproject.toml', name: 'ruff', version: '^0.6', group: 'lint' }
    ])
  })

  it('reads requirements files a line at a time, without options, paths and URLs', async () => {
    expect(
      await read({
        'requirements.txt': [
          '# pinned',
          'Django==5.1.2  # the web',
          '-r requirements-dev.txt',
          '-e .',
          '--index-url https://example.com/simple',
          'numpy>=1.26,<3 \\',
          '    --hash=sha256:abc',
          './vendored/pkg',
          'git+https://example.com/repo.git#egg=thing',
          'six'
        ].join('\n'),
        'requirements-dev.txt': 'pytest\n',
        'requirements/prod.txt': 'gunicorn==23.0\n',
        'notes.txt': 'not==a manifest\n'
      })
    ).toEqual([
      { manifest: 'requirements-dev.txt', name: 'pytest' },
      { manifest: 'requirements.txt', name: 'Django', version: '==5.1.2' },
      { manifest: 'requirements.txt', name: 'numpy', version: '>=1.26,<3' },
      { manifest: 'requirements.txt', name: 'six' },
      { manifest: 'requirements/prod.txt', name: 'gunicorn', version: '==23.0' }
    ])
  })

  it('reads what go.mod requires, single and in blocks, marking the indirect ones', async () => {
    expect(
      await read({
        'go.mod': [
          'module example.com/shop',
          'require github.com/google/uuid v1.6.0',
          'require (',
          '\tgolang.org/x/text v0.21.0 // indirect',
          '\t"github.com/quoted/mod" v1.0.0',
          ')',
          '// require commented.out v1.0.0'
        ].join('\n')
      })
    ).toEqual([
      { manifest: 'go.mod', name: 'github.com/google/uuid', version: 'v1.6.0' },
      { manifest: 'go.mod', name: 'golang.org/x/text', version: 'v0.21.0', group: 'indirect' },
      { manifest: 'go.mod', name: 'github.com/quoted/mod', version: 'v1.0.0' }
    ])
  })

  it('names nothing from a manifest it cannot read, and nothing that is never looked at', async () => {
    expect(
      await read({
        'pyproject.toml': '[project\ndependencies = [',
        'node_modules/x/requirements.txt': 'six\n'
      })
    ).toEqual([])
  })
})
