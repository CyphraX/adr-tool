import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import { analyseDependencies } from '../../src/dependencies'
import { extractorOf } from '../../src/extraction'
import { prepareGo } from '../../src/go/outline'
import { sourceFilesAmong } from '../../src/source-files'

const require = createRequire(import.meta.url)
const reader = prepareGo({
  runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
  grammar: await readFile(require.resolve('tree-sitter-go/tree-sitter-go.wasm'))
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
    extractorOf({ go: await reader })
  )
  return {
    ...result,
    edges: result.dependencies.map(
      (dependency) => `${dependency.from} > ${dependency.to} ${dependency.lines.join(',')}`
    ),
    unresolved: result.notResolved.map((use) => `${use.file}:${use.line} ${use.specifier}`),
    used: result.libraries.map((use) => `${use.file} ${use.library}`)
  }
}

const MODULE = 'module example.com/shop\n\ngo 1.22\n'

describe('Dependencies in Go (docs/structure-format.md, section 3, "Go")', () => {
  it('lands a use of another package on the file that declares the name used, on the line of the use', async () => {
    const { edges, unresolved } = await analyse({
      'go.mod': MODULE,
      'catalog/product.go': ['package catalog', 'type Product struct{}'],
      'catalog/search.go': ['package catalog', 'func Find(name string) Product { return Product{} }'],
      'cart/cart.go': [
        'package cart',
        'import (',
        '  "fmt"',
        '  shop "example.com/shop/catalog"',
        ')',
        'func Add(p shop.Product) {',
        '  fmt.Println(shop.Find("pen"), shop.Gone)',
        '}'
      ]
    })
    expect(edges).toEqual([
      'cart/cart.go > catalog/product.go 6',
      'cart/cart.go > catalog/search.go 7',
      'catalog/search.go > catalog/product.go 2'
    ])
    expect(unresolved).toEqual(['cart/cart.go:7 example.com/shop/catalog.Gone'])
  })

  it('finds the uses within a package, and lets only a test file see the tests', async () => {
    const { edges, dependencies } = await analyse({
      'go.mod': MODULE,
      'cart/cart.go': ['package cart', 'type Cart struct{ Lines []Line }'],
      'cart/line.go': ['package cart', 'type Line struct{}', 'func (l Line) In(c *Cart) bool { return helper() }'],
      'cart/helpers_test.go': ['package cart', 'func helper() bool { return true }'],
      'cart/cart_test.go': ['package cart', 'var _ = helper()', 'var _ = Cart{}'],
      'cart/external_test.go': [
        'package cart_test',
        'import "example.com/shop/cart"',
        'var _ = cart.Cart{}'
      ]
    })
    expect(edges).toEqual([
      'cart/cart.go > cart/line.go 2',
      'cart/cart_test.go > cart/cart.go 3',
      'cart/cart_test.go > cart/helpers_test.go 2',
      'cart/external_test.go > cart/cart.go 3',
      'cart/line.go > cart/cart.go 3'
    ])
    // Go has no type-only Dependencies.
    expect(dependencies.every((dependency) => !dependency.typeOnly)).toBe(true)
  })

  it('takes a blank import, and one whose use the syntax does not show, as a use of every file of its package', async () => {
    const { edges } = await analyse({
      'go.mod': MODULE,
      'driver/register.go': ['package driver', 'func init() {}'],
      'driver/open.go': ['package driver', 'func Open() {}'],
      'dot/names.go': ['package dot', 'func Shout() {}'],
      'dot/other.go': ['package dot', 'func Whisper() {}'],
      'main.go': [
        'package main',
        'import (',
        '  _ "example.com/shop/driver"',
        '  . "example.com/shop/dot"',
        ')',
        'func main() { Shout() }'
      ],
      'quiet.go': ['package main', 'import "example.com/shop/dot"']
    })
    expect(edges).toEqual([
      'main.go > dot/names.go 6',
      'main.go > driver/open.go 3',
      'main.go > driver/register.go 3',
      'quiet.go > dot/names.go 2',
      'quiet.go > dot/other.go 2'
    ])
  })

  it('counts a name that files for different platforms both declare as a use of each', async () => {
    const { edges } = await analyse({
      'go.mod': MODULE,
      'fs/open_linux.go': ['//go:build linux', 'package fs', 'func open() {}'],
      'fs/open_windows.go': ['//go:build windows', 'package fs', 'func open() {}'],
      'fs/file.go': ['package fs', 'func Read() { open() }']
    })
    expect(edges).toEqual(['fs/file.go > fs/open_linux.go 2', 'fs/file.go > fs/open_windows.go 2'])
  })

  it('takes the package most files of a directory name, and not main where there is another', async () => {
    const { edges } = await analyse({
      'go.mod': MODULE,
      'text/text.go': ['package text', 'func Upper() {}'],
      'text/generate.go': ['//go:build ignore', 'package main', 'func Upper() {}'],
      'use.go': ['package main', 'import "example.com/shop/text"', 'func main() { text.Upper() }']
    })
    expect(edges).toEqual(['use.go > text/text.go 3'])
  })

  it('resolves through local replacements and nested modules, and nothing else', async () => {
    const { edges, unresolved, used } = await analyse({
      'go.mod': [
        'module example.com/shop',
        'require (',
        '  example.com/billing v0.0.0',
        '  github.com/google/uuid v1.6.0',
        '  golang.org/x/text v0.21.0 // indirect',
        ')',
        'replace example.com/billing => ./services/billing'
      ],
      'services/billing/go.mod': 'module example.com/billing\n',
      'services/billing/invoice/invoice.go': ['package invoice', 'func For() {}'],
      // A nested module that nothing replaces is still the repository's.
      'tools/go.mod': 'module example.com/tools\n',
      'tools/lint/lint.go': ['package lint', 'func Run() {}'],
      // Below the outer module path, but the nested module's directory.
      'other/go.mod': 'module example.com/other\n',
      'other/x/x.go': ['package x', 'func X() {}'],
      'main.go': [
        'package main',
        'import (',
        '  "net/http"',
        '  "C"',
        '  "example.com/billing/invoice"',
        '  "example.com/tools/lint"',
        '  "example.com/shop/other/x"',
        '  "github.com/google/uuid"',
        '  "golang.org/x/text/language"',
        '  "gopkg.in/yaml.v3"',
        '  "example.com/shop/missing"',
        ')',
        'func main() { invoice.For(); lint.Run(); x.X(); _ = http.Get; _ = uuid.New; _ = language.English; _ = yaml.Marshal }'
      ]
    })
    expect(edges).toEqual([
      'main.go > services/billing/invoice/invoice.go 13',
      'main.go > tools/lint/lint.go 13'
    ])
    expect(unresolved).toEqual([
      'main.go:7 example.com/shop/other/x',
      'main.go:11 example.com/shop/missing'
    ])
    // A Library is named by the module go.mod requires, else by the import path.
    expect(used).toEqual([
      'main.go github.com/google/uuid',
      'main.go golang.org/x/text',
      'main.go gopkg.in/yaml.v3'
    ])
  })

  it('applies the replacements of go.work before those of a module', async () => {
    const { edges } = await analyse({
      'go.work': 'go 1.22\n\nuse ./app\n\nreplace example.com/lib => ./lib\n',
      'app/go.mod': 'module example.com/app\n\nreplace example.com/lib => ../elsewhere\n',
      'app/main.go': ['package main', 'import "example.com/lib/util"', 'func main() { util.Do() }'],
      'lib/util/util.go': ['package util', 'func Do() {}'],
      'elsewhere/util/util.go': ['package util', 'func Do() {}']
    })
    expect(edges).toEqual(['app/main.go > lib/util/util.go 3'])
  })

  it('names Libraries, without a go.mod, by their import path', async () => {
    const { edges, used, unresolved } = await analyse({
      'main.go': ['package main', 'import "github.com/x/y/z"', 'func main() { z.Do() }']
    })
    expect([edges, unresolved, used]).toEqual([[], [], ['main.go github.com/x/y/z']])
  })
})
