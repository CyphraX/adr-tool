import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'
import { describe, expect, it } from 'vitest'
import { prepareJava } from '../../src/java/outline'

const require = createRequire(import.meta.url)
const wasm = async () => ({
  runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
  grammar: await readFile(require.resolve('tree-sitter-java/tree-sitter-java.wasm'))
})

/** A file that tries to mislead anything that reads Java with regular expressions. */
const HOSTILE = `/*
 * package not.the.package;
 * import not.an.Import;
 */
@Deprecated
package com.example.shop.cart; // package trailing.comment;

import java.util.List;
import java.util.*;
import static java.util.Objects.requireNonNull;
import static org.junit.Assert.*;
import com.example.shop.pricing.Money ;
// import commented.Out;

/** {@link com.example.Javadoc} is not a use. */
public final class Cart<T extends Item> extends Basket implements Priced, Iterable<T> {
  private final String decoy = "import in.a.String; class NotAType {}";
  private final String block = """
      package in.a.text.block;
      class AlsoNotAType {}
      """;
  private List<Line> lines;

  @Audited
  Money total(Discount discount) throws PricingException {
    var rate = (Rate) discount.rate();
    Object o = new Voucher();
    return Money.of(Totals.sum(lines), requireNonNull(rate));
  }

  static class Nested {}
  enum Inner { A }
}

interface Priced {}
record Line(Item item, int quantity) {}
enum Kind { A, B }
@interface Audited {}
`

describe('a Java file, read with tree-sitter-java as WebAssembly in plain Node', async () => {
  const read = await prepareJava(await wasm())
  const outlineOf = (text: string) => {
    const extraction = read(text)
    if (!extraction.analysed || !('java' in extraction)) throw new Error('not analysed')
    return extraction.java
  }
  const outline = outlineOf(HOSTILE)
  const names = (list: readonly { name: string }[]) => list.map(({ name }) => name)

  it('reads the package, not what comments and strings say', () => {
    expect(outline.package).toBe('com.example.shop.cart')
    expect(outlineOf('class InTheDefaultPackage {}').package).toBe('')
  })

  it('reads every kind of import, with its line', () => {
    expect(outline.imports).toEqual([
      { name: 'java.util.List', isStatic: false, onDemand: false, line: 8 },
      { name: 'java.util', isStatic: false, onDemand: true, line: 9 },
      { name: 'java.util.Objects.requireNonNull', isStatic: true, onDemand: false, line: 10 },
      { name: 'org.junit.Assert', isStatic: true, onDemand: true, line: 11 },
      { name: 'com.example.shop.pricing.Money', isStatic: false, onDemand: false, line: 12 }
    ])
  })

  it('reads the top-level types of every kind, and the nested ones and type parameters as local', () => {
    expect(outline.types).toEqual(['Cart', 'Priced', 'Line', 'Kind', 'Audited'])
    expect([...outline.local].sort()).toEqual(['Inner', 'Nested', 'T'])
  })

  it('reads the simple names that stand where a type stands', () => {
    // What the own-package rule of the specification needs.
    expect(names(outline.typeNames)).toEqual(
      expect.arrayContaining([
        'Item',
        'Basket',
        'Priced',
        'Iterable',
        'String',
        'List',
        'Line',
        'Money',
        'Discount',
        'PricingException',
        'Rate',
        'Voucher',
        // Annotations name their type with a plain identifier; they are collected as well.
        'Deprecated',
        'Audited'
      ])
    )
    expect(names(outline.typeNames)).not.toContain('NotAType')
    expect(names(outline.typeNames)).not.toContain('AlsoNotAType')
    expect(names(outline.typeNames)).not.toContain('Javadoc')
    // Each name once, with the line it is first used on.
    expect(outline.typeNames.find(({ name }) => name === 'Money')).toEqual({
      name: 'Money',
      line: 25
    })
  })

  it('offers the qualifiers of static access as candidates, which only the symbol table can confirm', () => {
    // `Totals.sum(…)` and `Money.of(…)` use classes; `discount.rate()` uses a variable.
    // The syntax is the same, so all three are candidates and nothing more.
    expect(names(outline.qualifiers)).toEqual(
      expect.arrayContaining(['Totals', 'Money', 'discount'])
    )
    expect(names(outline.typeNames)).not.toContain('Totals')
  })

  it('does not analyse a file with syntax errors, and says where the first one is', () => {
    const broken = read('package a.b;\nimport a.c.D;\nclass Broken { void x( { }\nclass Next {}\n')
    expect(broken).toMatchObject({ analysed: false, line: 3 })
  })

  it('parses a second file with the same parser', () => {
    expect(outlineOf('package x; class Y {}').types).toEqual(['Y'])
  })
})

describe('tree-sitter-java as WebAssembly, off the main thread', () => {
  it('initialises and parses inside a worker thread', async () => {
    const worker = new Worker(new URL('./java-worker.mjs', import.meta.url), {
      workerData: await wasm()
    })
    const result = await new Promise((resolve, reject) => {
      worker.once('message', resolve)
      worker.once('error', reject)
    })
    expect(result).toEqual({ package: 'a.b', types: ['C'] })
  })
})
