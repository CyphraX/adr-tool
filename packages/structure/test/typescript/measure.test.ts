import { describe, expect, it } from 'vitest'
import type { FileMeasures } from '../../src/measures'
import { extractUses } from '../../src/typescript/extract'

/** What is measured in a file of the given path and text. */
function measured(path: string, text: string): FileMeasures {
  const extraction = extractUses(path, text)
  if (!extraction.analysed || !('measures' in extraction) || !extraction.measures) {
    throw new Error(`${path} was not measured`)
  }
  return extraction.measures
}

/** Each function's name and complexity. */
const complexities = (path: string, text: string): Record<string, number> =>
  Object.fromEntries(measured(path, text).functions.map((one) => [one.name, one.complexity]))

describe('the complexity of a function (docs/structure-format.md, section 5)', () => {
  it('is 1 and one more for each decision point, as ESLint counts it', () => {
    const counted = complexities(
      'a.ts',
      [
        'export function straight(): number { return 1 }',
        'export function branches(x: number): number {',
        '  if (x > 1) return 1', // if
        '  else if (x > 0) return 2', // if
        '  else return x > -1 ? 3 : 4', // ?:
        '}',
        'export function loops(list: number[]): void {',
        '  for (let i = 0; i < 1; i++) {}', // for
        '  for (const k in list) {}', // for … in
        '  for (const v of list) {}', // for … of
        '  while (list.length) list.pop()', // while
        '  do {} while (false)', // do … while, once
        '}',
        'export function cases(x: number): number {',
        '  switch (x) {',
        '    case 1:', // case
        '    case 2:', // case
        '      return 1',
        '    default:', // no
        '      return 0',
        '  }',
        '}',
        'export function guarded(): void {',
        '  try { straight() } catch { straight() } finally { straight() }', // catch
        '}',
        'export function circuits(a?: { b?: () => number }, c = 1): unknown {', // default
        '  let d = a && c || 0', // && ||
        '  d ??= c ?? 2', // ??= ??
        '  d &&= 1', // &&=
        '  d ||= 2', // ||=
        '  return a?.b?.()', // ?. ?.
        '}',
        'export const defaults = ({ x = 1 }: { x?: number }, [y = 2] = [], z = 3): number => {', // x, y, [y = 2] = [], z
        '  let w: number, v: number',
        '  ;[w = 4] = [];', // destructuring default
        '  ({ v = 5 } = {} as { v?: number })', // destructuring default
        '  return x + y + z + w + v',
        '}'
      ].join('\n')
    )
    expect(counted).toEqual({
      straight: 1,
      branches: 4,
      loops: 6,
      cases: 3,
      guarded: 2,
      circuits: 10,
      defaults: 7
    })
  })

  it('counts each function on its own, and nothing outside one', () => {
    const counted = complexities(
      'a.ts',
      [
        'const top = 1 || 2', // the top level: no function
        'export function outer(list: number[]): number[] {',
        '  if (list.length === 0) return []',
        '  return list.filter((x) => x > 0 && x < 9).map(function (x) { return x ? x : 1 })',
        '}',
        'class Totals {',
        '  limit = top > 1 ? 1 : 2', // a field's value: no function
        '  static { if (top) console.log(top) }', // a static block: no function
        '  check = (x: number) => x > this.limit || x < 0',
        '}',
        'export { Totals }'
      ].join('\n')
    )
    expect(counted).toEqual({
      outer: 2,
      'outer.<anonymous>': 2,
      'outer.<anonymous>#2': 2,
      'Totals.check': 2
    })
  })

  it('counts no type: a conditional type is no branch, an overload no function', () => {
    const counted = complexities(
      'a.ts',
      [
        'type Kind<T> = T extends string ? "text" : "other"',
        'interface Shape { area(): number }',
        'export function size(x: string): number',
        'export function size(x: number): number',
        'export function size(x: unknown): number { return typeof x === "string" ? 1 : 2 }',
        'export abstract class Base { abstract area(): number }',
        'declare function ambient(x: number): number',
        'export type { Kind, Shape }'
      ].join('\n')
    )
    expect(counted).toEqual({ size: 2 })
  })

  it('names a function by what contains it and what it is assigned to', () => {
    const { functions } = measured(
      'a.ts',
      [
        'export function formatDate(): void {', // 1
        '  function pad(): void {}', // 2
        '  const trim = () => {}', // 3
        '}',
        'export class Cart {', // 5
        '  constructor() {}', // 6
        '  get total(): number { return 0 }', // 7
        '  set total(value: number) {}', // 8
        '  @logged', // 9
        '  add(): void {}', // 10
        '  #secret(): void {}', // 11
        '  ["computed" + 1](): void {}', // 12
        '  static of(): Cart { return new Cart() }', // 13
        '}',
        'export const api = {', // 15
        '  load() {},', // 16
        '  save: function () {},', // 17
        '  nested: { deeper: () => 1 }', // 18
        '}',
        'namespace Space { export const inside = () => 1 }', // 20
        'const Named = class { run(): void {} }', // 21
        'let later: () => void', // 22
        'later = () => {}', // 23
        'register({ handler() {} })', // 24
        'export default () => {}', // 25
        'function logged(): void {}', // 26
        'declare function register(x: object): void'
      ].join('\n')
    )
    expect(functions.map(({ name, line }) => [name, line])).toEqual([
      ['formatDate', 1],
      ['formatDate.pad', 2],
      ['formatDate.trim', 3],
      ['Cart.constructor', 6],
      ['Cart.get total', 7],
      ['Cart.set total', 8],
      // Past its decorator, on the line of its name.
      ['Cart.add', 10],
      ['Cart.#secret', 11],
      ['Cart.["computed" + 1]', 12],
      ['Cart.of', 13],
      ['api.load', 16],
      ['api.save', 17],
      ['api.nested.deeper', 18],
      ['Space.inside', 20],
      ['Named.run', 21],
      ['later', 23],
      // An object that is passed, not named, contains nothing.
      ['handler', 24],
      ['default', 25],
      ['logged', 26]
    ])
    expect(functions.find((one) => one.name === 'formatDate')).toMatchObject({ endLine: 4 })
  })

  it('tells functions of one name apart by their order, and keeps the names when lines move', () => {
    const text = [
      'export function run(): void {',
      '  const a = [1].map(() => 1)',
      '  const b = [2].map(() => 2)',
      '}',
      'function run2(): void {}'
    ]
    const names = (lines: readonly string[]) =>
      measured('a.ts', lines.join('\n')).functions.map((one) => one.name)
    expect(names(text)).toEqual(['run', 'run.<anonymous>', 'run.<anonymous>#2', 'run2'])
    expect(names(['', '// moved', ...text])).toEqual(names(text))
  })

  it('reads the script blocks of a Svelte component, on the lines of the file', () => {
    const { functions, declarations } = measured(
      'src/Row.svelte',
      [
        '<script lang="ts">', // 1
        '  let { value }: { value?: number } = $props()', // 2
        '  function shown(): string {', // 3
        '    return value === undefined ? "–" : String(value)', // 4
        '  }', // 5
        '</script>', // 6
        '', // 7
        '<button onclick={() => value && value++}>{shown()}</button>'
      ].join('\n')
    )
    // The markup is not read: its handler is not a function of the script.
    expect(functions).toEqual([{ name: 'shown', line: 3, endLine: 5, complexity: 2 }])
    expect(declarations).toEqual([{ name: 'Row', line: 1, abstract: false }])
  })
})

describe('the LCOM4 of a class (docs/structure-format.md, section 5)', () => {
  const lcom4 = (text: string) =>
    measured('a.ts', text).classes.map(({ name, methods, lcom4 }) => [name, methods, lcom4])

  it('counts the groups of methods that share a field or use one another', () => {
    expect(
      lcom4(
        [
          'export class Cart {',
          '  private lines: number[] = []',
          '  private notes = ""',
          '  constructor(private readonly tax: number) { this.notes = String(this.lines) }',
          '  add(x: number): void { this.lines.push(x) }', // lines
          '  get count(): number { return this.lines.length }', // lines
          '  recount(): number { return this.count + 1 }', // uses count
          '  note(text: string): void { this.notes = text }', // notes
          '  priced = (x: number): number => x * this.tax', // tax
          '  static empty(): Cart { return Cart.make() }', // uses make
          '  static make(): Cart { return new Cart(0) }',
          '  alone(): number { return 1 }',
          '}'
        ].join('\n')
      )
    ).toEqual([['Cart', 8, 5]])
  })

  it('reads `const { x } = this`, and no `this` of a nested class or `function`', () => {
    expect(
      lcom4(
        [
          'export class A {',
          '  x = 1',
          '  y = 2',
          '  one(): number { const { x } = this; return x }',
          '  two(): number { return [1].map(() => this.x)[0]! }', // an arrow keeps `this`
          '  three(): number { return [1].map(function (this: { y: number }) { return this.y })[0]! }',
          '  four(): object { return class { y = 3; get() { return this.y } } }',
          '}',
          'export class Empty { field = 1 }'
        ].join('\n')
      )
    ).toEqual([
      ['A', 4, 3],
      // Nested and anonymous: a class of its own, measured on its own.
      ['A.four.<anonymous>', 1, 1],
      // No methods: no LCOM4.
      ['Empty', 0, undefined]
    ])
  })
})

describe('the declarations abstractness counts (docs/structure-format.md, section 5)', () => {
  const declared = (path: string, text: string) =>
    measured(path, text).declarations.map(({ name, abstract }) => [name, abstract])

  it('takes what a module declares at its top level and in its namespaces', () => {
    expect(
      declared(
        'a.ts',
        [
          'export interface Shape { area(): number }',
          'export type Id = string',
          'export abstract class Base {}',
          'export class Square extends Base {}',
          'export enum Kind { A }',
          'export function area(): number { return 1 }',
          'export function size(x: string): number',
          'export function size(x: unknown): number { return 1 }',
          'export const scale = (x: number): number => x',
          'export const Named = class {}',
          'export const data = [1, 2]',
          'export const api = { load() {} }',
          'declare function ambient(x: number): void',
          'declare function ambient(x: string): void',
          'declare class Outside {}',
          'namespace Space { export interface Inner {} export function f(): void {} }',
          'export default () => 1',
          'function local(): void { class Hidden {} }'
        ].join('\n')
      )
    ).toEqual([
      ['Shape', true],
      ['Id', true],
      ['Base', true],
      ['Square', false],
      ['Kind', false],
      ['area', false],
      // The overloads and their implementation are one declaration.
      ['size', false],
      ['scale', false],
      ['Named', false],
      // Data and an object of functions are no declarations.
      ['ambient', true],
      ['Outside', true],
      ['Space.Inner', true],
      ['Space.f', false],
      ['default', false],
      // What a function declares inside it is not the module's.
      ['local', false]
    ])
  })

  it('takes everything of a declaration file as abstract', () => {
    expect(
      declared(
        'a.d.ts',
        'export declare class A {}\nexport function f(): void\nexport enum E { X }\ndeclare module "x" { export function g(): void }'
      )
    ).toEqual([
      ['A', true],
      ['f', true],
      ['E', true],
      ['g', true]
    ])
  })
})

describe('a file whose expressions run deep (docs/structure-format.md, section 5)', () => {
  // The walks keep a stack of their own: the depth of a tree is no limit of the runtime's.
  it('measures a long chain of `+`, of `&&`, and `if`s nested far', () => {
    const plus = `export const total = ${Array.from({ length: 4000 }, (_, i) => `a${i}`).join(' + ')}\n`
    expect(measured('plus.ts', plus).functions).toEqual([])

    const and = `export function all(): boolean { return ${Array.from({ length: 2000 }, (_, i) => `a${i}`).join(' && ')} }\n`
    expect(complexities('and.ts', and)).toEqual({ all: 2000 })

    const nested = [
      'export function deep(x: number): number {',
      ...Array.from({ length: 1000 }, (_, i) => `${' '.repeat(i % 40)}if (x > ${i}) {`),
      '  return x',
      ...Array.from({ length: 1000 }, () => '}'),
      '  return 0',
      '}',
      ''
    ].join('\n')
    expect(complexities('nested.ts', nested)).toEqual({ deep: 1001 })
  })
})
