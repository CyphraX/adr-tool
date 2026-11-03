import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import { prepareJava, type JavaReader } from '../../src/java/outline'
import type { FileMeasures } from '../../src/measures'
import { javaComplexityByWords } from '../measures-by-definition'

const require = createRequire(import.meta.url)
let read: JavaReader
beforeAll(async () => {
  read = await prepareJava({
    runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
    grammar: await readFile(require.resolve('tree-sitter-java/tree-sitter-java.wasm'))
  })
})

function measured(text: string): FileMeasures {
  const extraction = read(text)
  if (!extraction.analysed || !extraction.measures) throw new Error('not measured')
  return extraction.measures
}

/** A class whose every method decides in another way, one method to a few lines. */
const DECIDING = `package a;

import java.util.List;
import java.util.function.Predicate;

public final class Deciding {
  private final List<String> names;
  static final Predicate<String> SHORT = name -> name != null && name.length() < 3;

  public Deciding(List<String> names) {
    this.names = names == null ? List.of() : names;
  }

  int branches(int x) {
    if (x > 1) return 1;
    else if (x > 0) return 2;
    return x > -1 ? 3 : 4;
  }

  void loops(int[] values) {
    for (int i = 0; i < values.length; i++) {}
    for (int value : values) {}
    while (values.length > 9) {}
    do {} while (false);
  }

  int cases(Object x) {
    switch (x) {
      case Integer i when i > 9 -> { return 1; }
      case String s -> { return 2; }
      default -> { return 0; }
    }
  }

  int legacy(int x) {
    switch (x) {
      case 1:
      case 2:
        return 1;
      default:
        return 0;
    }
  }

  void guarded() {
    try { names.size(); } catch (IllegalStateException e) { } catch (RuntimeException e) { } finally { }
  }

  boolean circuits(boolean a, boolean b) {
    return a && b || !a;
  }

  long lambdas() {
    // "if" in a string or a comment decides nothing: if (a) && b
    return names.stream().filter(n -> n.isEmpty() || n.length() > 2).filter(SHORT).count();
  }

  Runnable anonymous() {
    return new Runnable() {
      public void run() {
        if (names.isEmpty()) System.out.println("empty");
      }
    };
  }
}
`

describe('the complexity of a Java method (docs/structure-format.md, section 5)', () => {
  it('is 1 and one more for each decision point, as Checkstyle counts it', () => {
    const { functions } = measured(DECIDING)
    expect(functions.map(({ name, complexity }) => [name, complexity])).toEqual([
      // A lambda in a field is a function of its own, named by the field.
      ['Deciding.SHORT', 2],
      ['Deciding.Deciding(List)', 2],
      ['Deciding.branches(int)', 4],
      ['Deciding.loops(int[])', 5],
      // Each case label and each guard; not the default.
      ['Deciding.cases(Object)', 4],
      ['Deciding.legacy(int)', 3],
      ['Deciding.guarded()', 3],
      ['Deciding.circuits(boolean,boolean)', 3],
      // The lambda counts towards the method it is written in.
      ['Deciding.lambdas()', 2],
      ['Deciding.anonymous()', 1],
      // A method of an anonymous class is a function of its own.
      ['Deciding.anonymous().<anonymous>.run()', 2]
    ])
  })

  it('is what the words and operators of each method count, by definition', () => {
    const { functions } = measured(DECIDING)
    const lines = DECIDING.split('\n')
    // The anonymous class's method lies inside anonymous(): each is counted by its own lines.
    const own = functions.filter((one) => !one.name.endsWith('anonymous()'))
    for (const { line, endLine, complexity, name } of own) {
      const text = lines.slice(line - 1, endLine).join('\n')
      expect([name, javaComplexityByWords(text)]).toEqual([name, complexity])
    }
  })

  it('names methods with the types of their parameters, so that overloads are told apart', () => {
    const { functions } = measured(`package a;
class Cart {
  Cart() {}
  @Deprecated
  void add(final @Annotated Product product) {}
  void add(java.util.Map<String, java.util.List<Line>> lines, String... rest) {}
  void add(int values[]) {}
  enum Kind { A { void go() {} }; void go() {} }
  record Line(String sku) { Line { if (sku == null) throw new IllegalArgumentException(); } }
  interface Priced { default long price() { return 0; } long abstractOne(); }
  static { Runnable r = () -> { if (true) {} }; }
}`)
    expect(functions.map(({ name, line }) => [name, line])).toEqual([
      ['Cart.Cart()', 3],
      // On the line of its name, past its annotation.
      ['Cart.add(Product)', 5],
      ['Cart.add(java.util.Map,String...)', 6],
      ['Cart.add(int[])', 7],
      ['Cart.Kind.A.go()', 8],
      ['Cart.Kind.go()', 8],
      ['Cart.Line.Line(String)', 9],
      ['Cart.Priced.price()', 10]
    ])
    // A static block is no function: what it decides counts for none.
    expect(functions.find((one) => one.name === 'Cart.Line.Line(String)')?.complexity).toBe(2)
  })
})

describe('the LCOM4 of a Java class (docs/structure-format.md, section 5)', () => {
  it('counts the groups of methods that share a field or call one another', () => {
    const { classes } = measured(`package a;
class Cart {
  private final java.util.List<Line> lines = new java.util.ArrayList<>();
  private String note;
  private int tax;
  Cart(int tax) { this.tax = tax; note = ""; }
  void add(Line line) { lines.add(line); }
  long total() { return lines.stream().mapToLong(Line::cents).sum(); }
  long net() { return total() - tax(); }
  int tax() { return this.tax; }
  void note(String note) { this.note = note; }
  void shadowed(int tax) { System.out.println(tax); }
  void alone() { }
  void reference() { java.util.List.of(1).forEach(this::alone); }
  abstract void none();
}
record Line(long cents, String sku) {
  long doubled() { return cents() * 2; }
  String label() { return sku; }
}
enum Kind {
  A, B;
  boolean first() { return this == A; }
  boolean second() { return equals(B); }
}`)
    expect(classes.map(({ name, methods, lcom4 }) => [name, methods, lcom4])).toEqual([
      // {add, total, net, tax}, {note}, {shadowed}, {alone, reference}.
      ['Cart', 8, 4],
      ['Line', 2, 2],
      ['Kind', 2, 2]
    ])
  })
})

describe('the declarations abstractness counts in Java (docs/structure-format.md, section 5)', () => {
  it('takes every type, top-level, nested and local; interfaces and abstract classes are abstract', () => {
    const { declarations } = measured(`package a;
public abstract class Shape {
  interface Area {}
  @interface Marker {}
  enum Kind { A }
  record Point(int x) {}
  static final class Square extends Shape {}
  void local() { class Helper {} Runnable r = new Runnable() { public void run() {} }; }
}
interface Priced {}`)
    expect(declarations.map(({ name, abstract }) => [name, abstract])).toEqual([
      ['Shape', true],
      ['Shape.Area', true],
      ['Shape.Marker', true],
      ['Shape.Kind', false],
      ['Shape.Point', false],
      ['Shape.Square', false],
      ['Shape.local().Helper', false],
      ['Priced', true]
    ])
  })
})

describe('a Java file whose expressions run deep (docs/structure-format.md, section 5)', () => {
  // The walks keep a stack of their own: the depth of a tree is no limit of the runtime's.
  it('measures a constant concatenated over 2,000 lines', () => {
    const text = [
      'package a;',
      'final class Text {',
      '  static final String ALL =',
      ...Array.from({ length: 2000 }, (_, i) => `    "${i}" +`),
      '    "";',
      '  boolean any(boolean a, boolean b) {',
      `    return ${Array.from({ length: 2000 }, (_, i) => (i % 2 ? 'a' : 'b')).join(' && ')};`,
      '  }',
      '}',
      ''
    ].join('\n')
    expect(measured(text).functions.map(({ name, complexity }) => [name, complexity])).toEqual([
      ['Text.any(boolean,boolean)', 2000]
    ])
  })
})
