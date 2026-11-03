import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import { analyseDependencies } from '../../src/dependencies'
import { extractorOf } from '../../src/extraction'
import { preparePython } from '../../src/python/outline'
import { sourceFilesAmong } from '../../src/source-files'

const require = createRequire(import.meta.url)
const reader = preparePython({
  runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
  grammar: await readFile(require.resolve('tree-sitter-python/tree-sitter-python.wasm'))
})

/** A repository in memory; a file is written as its lines. */
async function analyse(repository: Record<string, string | string[]>) {
  const texts = Object.fromEntries(
    Object.entries(repository).map(([path, text]) => [
      path,
      Array.isArray(text) ? text.join('\n') + '\n' : text
    ])
  )
  const files = Object.keys(texts)
  const result = await analyseDependencies(
    memoryFileSystem(texts),
    files,
    sourceFilesAmong(files),
    extractorOf({ python: await reader })
  )
  return {
    ...result,
    edges: result.dependencies.map(
      (dependency) =>
        `${dependency.from} > ${dependency.to} ${dependency.lines.join(',')}${dependency.typeOnly ? ' type-only' : ''}`
    ),
    unresolved: result.notResolved.map((use) => `${use.file}:${use.line} ${use.specifier}`),
    used: result.libraries.map((use) => `${use.file} ${use.library}`)
  }
}

describe('Dependencies in Python (docs/structure-format.md, section 3, "Python")', () => {
  it('resolves absolute imports below the source roots: the root, src, and what pyproject.toml names', async () => {
    const { edges, unresolved } = await analyse({
      'pyproject.toml': '[tool.setuptools]\npackage-dir = { "" = "lib" }\n',
      'lib/shop/__init__.py': '',
      'lib/shop/cart.py': 'import shop.catalog\nfrom shop import pricing\n',
      'lib/shop/catalog.py': '',
      'lib/shop/pricing/__init__.py': '',
      'src/tools/__init__.py': '',
      'src/tools/run.py': 'import tools\nimport scripts.helpers\n',
      'scripts/helpers.py': ''
    })
    expect(unresolved).toEqual([])
    expect(edges).toEqual([
      'lib/shop/cart.py > lib/shop/catalog.py 1',
      'lib/shop/cart.py > lib/shop/pricing/__init__.py 2',
      'src/tools/run.py > scripts/helpers.py 2',
      'src/tools/run.py > src/tools/__init__.py 1'
    ])
  })

  it('reads the roots of setup.cfg, setup.py, Poetry, Hatch and pytest, each project for itself', async () => {
    const { edges, unresolved } = await analyse({
      'a/setup.cfg': '[options]\npackage_dir =\n    =code\n',
      'a/code/alpha.py': 'import beta\nimport gamma\nimport delta\nimport epsilon\n',
      'b/setup.py': "from setuptools import setup\nsetup(package_dir={'': 'source'})\n",
      'b/source/beta.py': '',
      'c/pyproject.toml': '[tool.poetry]\npackages = [{ include = "gamma", from = "pkgs" }]\n',
      'c/pkgs/gamma/__init__.py': '',
      'd/pyproject.toml': '[tool.hatch.build.targets.wheel]\npackages = ["sources/delta"]\n',
      'd/sources/delta/__init__.py': '',
      'e/pyproject.toml': '[tool.pytest.ini_options]\npythonpath = ["helpers"]\n',
      'e/helpers/epsilon.py': ''
    })
    expect(unresolved).toEqual([])
    expect(edges).toEqual([
      'a/code/alpha.py > b/source/beta.py 1',
      'a/code/alpha.py > c/pkgs/gamma/__init__.py 2',
      'a/code/alpha.py > d/sources/delta/__init__.py 3',
      'a/code/alpha.py > e/helpers/epsilon.py 4'
    ])
  })

  it('looks first where the top-level package of the file lies, as a script and pytest do: Django in backend/', async () => {
    const { edges, unresolved, used } = await analyse({
      'requirements.txt': 'django==5.0\n',
      'frontend/src/main.ts': 'export const x = 1\n',
      'backend/manage.py': 'import os\nfrom shop import settings\n',
      'backend/shop/__init__.py': '',
      'backend/shop/settings.py': '',
      'backend/orders/__init__.py': '',
      'backend/orders/models.py': 'from django.db import models\nfrom shop.settings import DEBUG\n',
      'backend/orders/views.py': 'from orders.models import Order\nfrom .models import Order\n'
    })
    expect(unresolved).toEqual([])
    expect(used).toEqual(['backend/orders/models.py django'])
    expect(edges).toEqual([
      'backend/manage.py > backend/shop/settings.py 2',
      'backend/orders/models.py > backend/shop/settings.py 2',
      'backend/orders/views.py > backend/orders/models.py 1,2'
    ])
  })

  it('resolves a relative import from the directory of the file, one level up for every further dot', async () => {
    const { edges, unresolved } = await analyse({
      'shop/__init__.py': 'from . import cart\n',
      'shop/cart/__init__.py': '',
      'shop/cart/cart.py':
        'from .line import Line\nfrom ..catalog import product\nfrom .. import catalog\n',
      'shop/cart/line.py': 'from . import cart\n',
      'shop/catalog/__init__.py': '',
      'shop/catalog/product.py': 'from ...outside import x\nfrom .gone import y\n'
    })
    expect(edges).toEqual([
      'shop/__init__.py > shop/cart/__init__.py 1',
      'shop/cart/cart.py > shop/cart/line.py 1',
      'shop/cart/cart.py > shop/catalog/__init__.py 3',
      'shop/cart/cart.py > shop/catalog/product.py 2',
      'shop/cart/line.py > shop/cart/cart.py 1'
    ])
    // Above the repository, and a module that is not there.
    expect(unresolved).toEqual([
      'shop/catalog/product.py:1 ...outside',
      'shop/catalog/product.py:2 .gone'
    ])
  })

  it('takes `from a import b` as a use of the module a.b where there is one, else of a', async () => {
    const { edges } = await analyse({
      'shop/__init__.py': 'VERSION = 1\n',
      'shop/cart.py': '',
      'main.py': 'from shop import cart, VERSION\nfrom shop.cart import *\n'
    })
    expect(edges).toEqual(['main.py > shop/__init__.py 1', 'main.py > shop/cart.py 1,2'])
  })

  it('makes a Dependency type-only where every import of it lies under `if TYPE_CHECKING:`', async () => {
    const { edges } = await analyse({
      'shop/__init__.py': '',
      'shop/cart.py': 'from .line import Line\n',
      'shop/line.py': [
        'from typing import TYPE_CHECKING',
        'from . import price',
        'if TYPE_CHECKING:',
        '    from .cart import Cart',
        '    from .price import Price'
      ],
      'shop/price.py': ''
    })
    expect(edges).toEqual([
      'shop/cart.py > shop/line.py 1',
      'shop/line.py > shop/cart.py 4 type-only',
      'shop/line.py > shop/price.py 2,5'
    ])
  })

  it('finds a namespace package, which has no file and so is no Dependency', async () => {
    const { edges, unresolved, used } = await analyse({
      'src/shop/cart/cart.py':
        'import shop.cart\nfrom shop import cart\nfrom shop.cart import cart as c\nfrom shop import gone\n'
    })
    expect(edges).toEqual([])
    expect(used).toEqual([])
    expect(unresolved).toEqual(['src/shop/cart/cart.py:4 shop.gone'])
  })

  it('leaves the standard library out, names a Library by its top-level package, and never guesses', async () => {
    const { edges, unresolved, used } = await analyse({
      'src/shop/__init__.py': '',
      'src/shop/app.py': [
        'import os.path',
        'import json, logging',
        'from xml.etree import ElementTree',
        'import requests.adapters',
        'from requests import Session',
        'import google.protobuf',
        // The repository's own package, without the module.
        'import shop.missing',
        // Beneath no source root the suite knows, but the repository has it: not a Library.
        'import backend_app.models'
      ],
      // A module the repository has, beside the standard library's of the same name.
      'src/shop/logging.py': '',
      'services/backend_app/__init__.py': '',
      'services/backend_app/models.py': ''
    })
    expect(edges).toEqual([])
    expect(used).toEqual(['src/shop/app.py requests', 'src/shop/app.py google'])
    expect(unresolved).toEqual([
      'src/shop/app.py:7 shop.missing',
      'src/shop/app.py:8 backend_app.models'
    ])
  })

  it('does not resolve a module that two other projects both have', async () => {
    const { edges, unresolved } = await analyse({
      'one/pyproject.toml': '',
      'one/common/__init__.py': '',
      'two/pyproject.toml': '',
      'two/common/__init__.py': '',
      'three/pyproject.toml': '',
      'three/app.py': 'import common\n',
      // Its own project's comes first.
      'one/use.py': 'import common\n'
    })
    expect(edges).toEqual(['one/use.py > one/common/__init__.py 1'])
    expect(unresolved).toEqual(['three/app.py:1 common'])
  })
})
