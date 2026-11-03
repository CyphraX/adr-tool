import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import type { FileMeasures } from '../../src/measures'
import { preparePython, type PythonReader } from '../../src/python/outline'
import { pythonBodyOf, pythonComplexityByWords } from '../measures-by-definition'

const require = createRequire(import.meta.url)
let read: PythonReader
beforeAll(async () => {
  read = await preparePython({
    runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
    grammar: await readFile(require.resolve('tree-sitter-python/tree-sitter-python.wasm'))
  })
})

function measured(text: string): FileMeasures {
  const extraction = read(text)
  if (!extraction.analysed || !extraction.measures) throw new Error('not measured')
  return extraction.measures
}

/** A module whose every function decides in another way. */
const DECIDING = `import abc


def straight(x):
    return x


def branches(x):
    if x > 1:
        return 1
    elif x > 0:
        return 2
    else:
        return 3 if x > -1 else 4


def loops(items):
    for item in items:
        print(item)
    else:
        print("done")
    while items:
        items.pop()
    async_ = [i for i in items if i if i > 1 for j in i]
    return async_


def caught(x):
    try:
        return 1 / x
    except ZeroDivisionError:
        return 0
    except (TypeError, ValueError):
        return -1
    else:
        pass
    finally:
        print("always")


def grouped(x):
    try:
        return 1 / x
    except* ZeroDivisionError:
        return 0


def logic(a, b, c):
    assert a and b
    return a and b or c and not a


def matched(command):
    match command:
        case "go" | "run":
            return 1
        case [first, *rest] if first:
            return 2
        case {"x": x}:
            return 3
        case other if other and command:
            return 4


def outer(items, key=lambda x: x or 0):
    def inner(y):
        return y if y else 0
    picked = sorted(items, key=lambda x: x if x else 1)
    with open("f") as f:
        pass
    return [inner(i) for i in picked]


class Shape(abc.ABC):
    @abc.abstractmethod
    def area(self):
        ...

    @property
    def wide(self):
        return self.area() > 1 and self.area() < 9
`

describe('the complexity of a Python function (docs/structure-format.md, section 5)', () => {
  it('is 1 and one more for each decision point, as radon counts it', () => {
    // radon 6.0.1 (\`radon cc -s\`) gives these numbers for DECIDING, on these lines; it does
    // not list outer.inner, a closure, which it counts on its own as the suite does.
    expect(
      measured(DECIDING).functions.map(({ name, line, complexity }) => [name, line, complexity])
    ).toEqual([
      ['straight', 4, 1],
      ['branches', 8, 4],
      // for and its else, while, a comprehension's two fors and two ifs.
      ['loops', 17, 8],
      // two excepts and the else; finally counts nothing.
      ['caught', 28, 4],
      // radon counts a try with except* not at all.
      ['grouped', 41, 1],
      // assert, and nothing it tests; or, and, and.
      ['logic', 48, 5],
      // three cases, the irrefutable one taken for the else; the and of its guard.
      ['matched', 53, 5],
      // the conditional in a lambda; the for of a comprehension; not the default value's lambda.
      ['outer', 65, 3],
      ['outer.inner', 66, 2],
      ['Shape.area', 76, 1],
      // On the line of its def, past its decorator.
      ['Shape.wide', 80, 2]
    ])
  })

  it('is what the words of each function count, by definition', () => {
    for (const one of measured(DECIDING).functions) {
      expect([one.name, pythonComplexityByWords(pythonBodyOf(DECIDING, one))]).toEqual([
        one.name,
        one.complexity
      ])
    }
  })

  it('names functions by what contains them, and a name that comes again by its position', () => {
    const { functions } = measured(
      [
        'class Cart:',
        '    @property',
        '    def total(self):',
        '        return 1',
        '    @total.setter',
        '    def total(self, value):',
        '        pass',
        '    class Line:',
        '        def cents(self):',
        '            return 0',
        'def outer():',
        '    def inner():',
        '        return lambda: 1',
        '    return inner',
        ''
      ].join('\n')
    )
    expect(functions.map(({ name, line, endLine }) => [name, line, endLine])).toEqual([
      ['Cart.total', 3, 4],
      ['Cart.total#2', 6, 7],
      ['Cart.Line.cents', 9, 10],
      ['outer', 11, 14],
      // A lambda is no function of its own.
      ['outer.inner', 12, 13]
    ])
  })
})

describe('the LCOM4 of a Python class (docs/structure-format.md, section 5)', () => {
  it('takes what the class and its methods assign through self for fields, and leaves out __init__', () => {
    const { classes } = measured(`class Cart:
    currency = "EUR"

    def __init__(self):
        self.items = []
        self.notes = ""

    def add(self, item):
        self.items.append(item)

    def total(self):
        return sum(self.items)

    def count(self):
        return len(self.items)

    def note(self, text):
        self.notes = text

    @classmethod
    def euros(cls):
        return cls.currency

    @staticmethod
    def plain():
        return Cart.currency

    def alone(self):
        return 1

    def shadowed(self):
        def inner(self):
            return self.items
        return inner

    def deferred(self):
        return lambda: self.count()
`)
    // {add, total, count, deferred}, {note}, {euros, plain}; alone and shadowed use nothing
    // of Cart — the self of inner is its own parameter — and are left out.
    expect(classes.map(({ name, methods, lcom4 }) => [name, methods, lcom4])).toEqual([
      ['Cart', 7, 3]
    ])
  })
})

describe('the declarations abstractness counts in Python (docs/structure-format.md, section 5)', () => {
  it('takes the classes and functions of the module; a class of ABC, Protocol or an abstract method is abstract', () => {
    const { declarations } = measured(
      [
        'import abc',
        'from typing import Protocol',
        'class Shape(abc.ABC): pass',
        'class Priced(Protocol): pass',
        'class Meta(metaclass=abc.ABCMeta): pass',
        'class Partly:',
        '    @abc.abstractmethod',
        '    def area(self): ...',
        '@dataclass',
        'class Point:',
        '    class Inner: pass',
        'def helper(): pass',
        'async def fetch(): pass',
        'square = lambda x: x * x',
        ''
      ].join('\n')
    )
    expect(declarations.map(({ name, line, abstract }) => [name, line, abstract])).toEqual([
      ['Shape', 3, true],
      ['Priced', 4, true],
      ['Meta', 5, true],
      ['Partly', 6, true],
      ['Point', 10, false],
      ['helper', 12, false],
      ['fetch', 13, false]
    ])
  })
})

describe('a Python file whose expressions run deep (docs/structure-format.md, section 5)', () => {
  // The walks keep a stack of their own: the depth of a tree is no limit of the runtime's.
  it('measures a chain of 4,000 `and` and a sum over 2,000 lines', () => {
    const text = [
      'def every(a, b):',
      `    return ${Array.from({ length: 4000 }, (_, i) => (i % 2 ? 'a' : 'b')).join(' and ')}`,
      'TOTAL = (',
      ...Array.from({ length: 2000 }, (_, i) => `    ${i} +`),
      '    0',
      ')',
      ''
    ].join('\n')
    expect(measured(text).functions.map(({ name, complexity }) => [name, complexity])).toEqual([
      ['every', 4000]
    ])
  })
})
