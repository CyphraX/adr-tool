import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import { prepareGo, type GoReader } from '../../src/go/outline'
import type { FileMeasures } from '../../src/measures'
import { goComplexityByWords } from '../measures-by-definition'

const require = createRequire(import.meta.url)
let read: GoReader
beforeAll(async () => {
  read = await prepareGo({
    runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
    grammar: await readFile(require.resolve('tree-sitter-go/tree-sitter-go.wasm'))
  })
})

function measured(text: string): FileMeasures {
  const extraction = read(text)
  if (!extraction.analysed || !extraction.measures) throw new Error('not measured')
  return extraction.measures
}

/** A file whose functions decide in every way Go has. */
const DECIDING = `package shop

import "fmt"

// A Handler answers, with a closure of its own at the package level.
var Handler = func(code int) string {
	if code >= 500 || code == 0 {
		return "error"
	}
	return "ok"
}

var limit, Format = 3, func(cents int) string { return fmt.Sprint(cents) }

type Cart struct{ lines []int }

type Priced interface{ Price() int }

type Alias = Cart

func Straight() int { return 1 }

func (c *Cart) Total(n int) int {
	if n > 0 && c != nil || n < -1 {
		for i := 0; i < n; i++ {
		}
	} else if n == 0 {
	}
	for _, l := range c.lines {
		_ = l
	}
	switch n {
	case 1, 2:
	case 3:
	default:
	}
	switch v := any(n).(type) {
	case int:
		_ = v
	default:
	}
	select {
	case <-make(chan int):
	default:
	}
	// A function literal counts for the function it is written in: if, &&.
	f := func() bool { if n > 1 && n < 9 { return true }; return false }
	_ = f
	return 0
}

func (Cart) Empty() bool { return true }

func Generic[T any](x T) T { return x }

func init() {}

func init() { fmt.Println("// not a comment, && not an operator") }
`

describe('the complexity of a Go function (docs/structure-format.md, section 5)', () => {
  it('is 1 and one more for each decision point, as gocyclo counts it', () => {
    // gocyclo 0.6.0 (\`gocyclo -over 0\`) gives these numbers for DECIDING, on these lines. It
    // names a method (*Cart).Total, and the function literal of a var by the first name of its
    // declaration, limit; the suite names it Format, by the variable it is assigned to.
    expect(
      measured(DECIDING).functions.map(({ name, line, complexity }) => [name, line, complexity])
    ).toEqual([
      ['Handler', 6, 3],
      ['Format', 13, 1],
      ['Straight', 21, 1],
      // if, &&, ||, for, else if, range, two cases, a type case, a select case; in the
      // function literal an if and an &&. default counts nothing.
      ['Cart.Total', 23, 13],
      ['Cart.Empty', 52, 1],
      ['Generic', 54, 1],
      // Two init functions in one file: the second by its position.
      ['init', 56, 1],
      ['init#2', 58, 1]
    ])
  })

  it('is what the words and operators of each function count, by definition', () => {
    const lines = DECIDING.split('\n')
    for (const one of measured(DECIDING).functions) {
      const text = lines.slice(one.line - 1, one.endLine).join('\n')
      // A var's line holds other values beside the function literal; they decide nothing.
      expect([one.name, goComplexityByWords(text)]).toEqual([one.name, one.complexity])
    }
  })
})

describe('the declarations abstractness counts in Go (docs/structure-format.md, section 5)', () => {
  it('takes the types and functions of the package; an interface is abstract', () => {
    const { declarations, classes } = measured(DECIDING)
    expect(declarations.map(({ name, line, abstract }) => [name, line, abstract])).toEqual([
      ['Cart', 15, false],
      ['Priced', 17, true],
      // An alias declares no type of its own, a method belongs to its type, init to no one.
      ['Straight', 21, false],
      ['Generic', 54, false]
    ])
    // The methods of a type may lie in every file of its package: LCOM4 is not measured.
    expect(classes).toEqual([])
  })
})

describe('a Go file whose expressions run deep (docs/structure-format.md, section 5)', () => {
  // The walks keep a stack of their own: the depth of a tree is no limit of the runtime's.
  it('measures a chain of 4,000 `&&` and 1,000 nested `if`s', () => {
    const text = [
      'package deep',
      `func Every(a, b bool) bool { return ${Array.from({ length: 4000 }, (_, i) => (i % 2 ? 'a' : 'b')).join(' && ')} }`,
      'func Nested(x int) int {',
      ...Array.from({ length: 1000 }, (_, i) => `if x > ${i} {`),
      'return x',
      ...Array.from({ length: 1000 }, () => '}'),
      'return 0',
      '}',
      ''
    ].join('\n')
    expect(measured(text).functions.map(({ name, complexity }) => [name, complexity])).toEqual([
      ['Every', 4000],
      ['Nested', 1001]
    ])
  })
})
