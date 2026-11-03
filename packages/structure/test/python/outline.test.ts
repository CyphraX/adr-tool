import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { preparePython } from '../../src/python/outline'

const require = createRequire(import.meta.url)
const read = await preparePython({
  runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
  grammar: await readFile(require.resolve('tree-sitter-python/tree-sitter-python.wasm'))
})
const outlineOf = (lines: string[]) => {
  const extraction = read(lines.join('\n') + '\n')
  if (!extraction.analysed || !('python' in extraction)) throw new Error('not analysed')
  return extraction.python
}

describe('a Python file, read with tree-sitter-python as WebAssembly', () => {
  it('reads every form of import, as written, with the line it begins on', () => {
    expect(
      outlineOf([
        'from __future__ import annotations',
        'import os, shop.cart as cart',
        'from . import line',
        'from ..catalog import Product, search as find',
        'from .pricing.rules import *',
        'from shop . catalog import (',
        '    Product,',
        ')'
      ]).imports
    ).toEqual([
      { module: 'os', level: 0, typeOnly: false, line: 2 },
      { module: 'shop.cart', level: 0, typeOnly: false, line: 2 },
      { module: '', level: 1, names: ['line'], typeOnly: false, line: 3 },
      { module: 'catalog', level: 2, names: ['Product', 'search'], typeOnly: false, line: 4 },
      { module: 'pricing.rules', level: 1, names: ['*'], typeOnly: false, line: 5 },
      { module: 'shop.catalog', level: 0, names: ['Product'], typeOnly: false, line: 6 }
    ])
  })

  it('takes what `if TYPE_CHECKING:` imports as type-only, and what its else imports as not', () => {
    const imports = outlineOf([
      'import typing',
      'from typing import TYPE_CHECKING',
      'if TYPE_CHECKING:',
      '    from .cart import Cart',
      '    if True:',
      '        import deep',
      'else:',
      '    import runtime',
      'if typing.TYPE_CHECKING:',
      '    import qualified',
      'if not TYPE_CHECKING:',
      '    import negated',
      'try:',
      '    import ujson as json',
      'except ImportError:',
      '    import json',
      'def later():',
      '    import lazy'
    ]).imports
    expect(imports.map((entry) => [entry.names?.[0] ?? entry.module, entry.typeOnly])).toEqual([
      ['typing', false],
      ['TYPE_CHECKING', false],
      ['Cart', true],
      ['deep', true],
      ['runtime', false],
      ['qualified', true],
      ['negated', false],
      ['ujson', false],
      ['json', false],
      ['lazy', false]
    ])
  })

  it('does not read an import in a string or a comment', () => {
    expect(
      outlineOf(['# import commented', 'TEXT = "import in_a_string"', '"""', 'import in_a_docstring', '"""'])
        .imports
    ).toEqual([])
  })

  it('does not analyse a file with syntax errors, and says on which line the first one is', () => {
    const broken = read('import os\n\ndef broken(:\n    pass\n')
    expect(broken.analysed).toBe(false)
    if (broken.analysed) return
    expect(broken.line).toBe(3)
    expect(broken.said?.code).toMatch(/^python-(missing|unreadable)$/)
  })
})
