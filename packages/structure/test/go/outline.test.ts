import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { prepareGo } from '../../src/go/outline'

const require = createRequire(import.meta.url)
const read = await prepareGo({
  runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
  grammar: await readFile(require.resolve('tree-sitter-go/tree-sitter-go.wasm'))
})
const outlineOf = (lines: string[]) => {
  const extraction = read(lines.join('\n') + '\n')
  if (!extraction.analysed || !('go' in extraction)) throw new Error('not analysed')
  return extraction.go
}

describe('a Go file, read with tree-sitter-go as WebAssembly', () => {
  it('reads its package and its imports, with their names, unquoted', () => {
    const outline = outlineOf([
      'package cart',
      'import "fmt"',
      'import (',
      '  c "example.com/shop/catalog"',
      '  . "example.com/shop/dot"',
      '  _ "example.com/shop/driver"',
      '  `example.com/shop/raw`',
      ')',
      '// import "commented.out"'
    ])
    expect(outline.package).toBe('cart')
    expect(outline.imports).toEqual([
      { path: 'fmt', line: 2 },
      { path: 'example.com/shop/catalog', name: 'c', line: 4 },
      { path: 'example.com/shop/dot', name: '.', line: 5 },
      { path: 'example.com/shop/driver', name: '_', line: 6 },
      { path: 'example.com/shop/raw', line: 7 }
    ])
  })

  it('knows what it declares at the top level, methods aside, and what it selects from where', () => {
    const outline = outlineOf([
      'package cart',
      'import "example.com/shop/catalog"',
      'type Cart struct{ Lines []Line }',
      'type (',
      '  ID = string',
      ')',
      'var (',
      '  count = 0',
      '  _ = 1',
      ')',
      'const Max = 3',
      'func New() *Cart { return &Cart{} }',
      'func (c *Cart) Add(p catalog.Product) { c.Lines = append(c.Lines, NewLine(p)) }',
      'func init() {}',
      'var found = catalog.Find("x")'
    ])
    expect([...outline.declares].sort()).toEqual(['Cart', 'ID', 'Max', 'New', 'count', 'found'])
    expect(outline.selections).toEqual([
      // `c.Lines` too: the syntax cannot tell a variable from an import.
      { qualifier: 'c', name: 'Lines', line: 13 },
      { qualifier: 'catalog', name: 'Find', line: 15 },
      { qualifier: 'catalog', name: 'Product', line: 13 }
    ])
    expect(outline.names.map((name) => name.name)).toContain('NewLine')
    expect(outline.names.map((name) => name.name)).toContain('Line')
  })

  it('leaves out of its names what a function declares, and the keys of a composite literal', () => {
    const outline = outlineOf([
      'package cart',
      'func f[T any](total int, rest ...int) (sum int) {',
      '  count := 1',
      '  var price int',
      '  for index, line := range lines { _, _ = index, line }',
      '  switch kind := shape.(type) { default: _ = kind }',
      '  select { case got := <-channel: _ = got }',
      '  type local struct{ Name string }',
      '  _ = local{Name: Label}',
      '  return total + count + price + Helper()',
      '}'
    ])
    expect(outline.names.map((name) => name.name).sort()).toEqual([
      'Helper',
      'Label',
      'any',
      'channel',
      'int',
      'lines',
      'shape',
      'string'
    ])
  })

  it('declares at the top level only what the declaration names, not what a function literal in it does', () => {
    const outline = outlineOf([
      'package p',
      'var handler = func() {',
      '  var cfg int',
      '  type local struct{}',
      '  const limit = 3',
      '  _ = cfg',
      '}',
      'func use() int { return cfg + limit }'
    ])
    expect([...outline.declares].sort()).toEqual(['handler', 'use'])
    // Declared inside, they hide the package's names of the file: never a use of the package.
    expect(outline.names.map((name) => name.name)).toEqual(['int'])
  })

  it('does not analyse a file with syntax errors, and says on which line the first one is', () => {
    const broken = read('package cart\n\nfunc broken( {\n}\n')
    expect(broken.analysed).toBe(false)
    if (broken.analysed) return
    expect(broken.line).toBe(3)
    expect(broken.said?.code).toMatch(/^go-(missing|unreadable)$/)
  })
})
