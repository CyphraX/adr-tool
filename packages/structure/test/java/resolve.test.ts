import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import { analyseDependencies } from '../../src/dependencies'
import { extractorOf } from '../../src/extraction'
import { prepareJava } from '../../src/java/outline'
import { sourceFilesAmong } from '../../src/source-files'

const require = createRequire(import.meta.url)
const reader = prepareJava({
  runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
  grammar: await readFile(require.resolve('tree-sitter-java/tree-sitter-java.wasm'))
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
    extractorOf({ java: await reader })
  )
  const short = (path: string) => path.slice(path.lastIndexOf('/') + 1, -'.java'.length)
  return {
    ...result,
    edges: result.dependencies.map(
      (dependency) =>
        `${short(dependency.from)} > ${short(dependency.to)} ${dependency.lines.join(',')}`
    )
  }
}

const M = 'src/main/java'

describe('Dependencies in Java (docs/structure-format.md, section 3, "Java")', () => {
  it('finds a use of a type of the own package without an import, across Maven modules', async () => {
    const { edges } = await analyse({
      [`cart/${M}/com/shop/cart/Cart.java`]: ['package com.shop.cart;', 'public class Cart {}'],
      [`web/${M}/com/shop/cart/CartView.java`]: [
        'package com.shop.cart;',
        'class CartView {',
        '  private Cart cart;',
        '}'
      ]
    })
    expect(edges).toEqual(['CartView > Cart 3'])
  })

  it('counts every position of a type, and the qualifier of a static access, as a use', async () => {
    const own = (name: string, text = `public class ${name} {}`) => ({
      [`${M}/com/shop/${name}.java`]: ['package com.shop;', text]
    })
    const { edges } = await analyse({
      ...own('Base'),
      ...own('Priced', 'public interface Priced {}'),
      ...own('Item'),
      ...own('Rate'),
      ...own('Voucher'),
      ...own('Audited', 'public @interface Audited {}'),
      ...own('Totals'),
      ...own('Failure', 'public class Failure extends Exception {}'),
      [`${M}/com/shop/Cart.java`]: [
        'package com.shop;',
        'import java.util.List;',
        'public class Cart<T extends Item> extends Base implements Priced {',
        '  @Audited',
        '  Object total(List<Rate> rates) throws Failure {',
        '    Object voucher = new Voucher();',
        '    return Totals.sum(rates);',
        '  }',
        '}'
      ]
    })
    expect(edges).toEqual([
      'Cart > Audited 4',
      'Cart > Base 3',
      'Cart > Failure 5',
      'Cart > Item 3',
      'Cart > Priced 3',
      'Cart > Rate 5',
      'Cart > Totals 7',
      'Cart > Voucher 6'
    ])
  })

  it('takes a single-type import, an on-demand import for the names it supplies, and a static import', async () => {
    const { edges } = await analyse({
      [`${M}/com/shop/pricing/Money.java`]: ['package com.shop.pricing;', 'public class Money {}'],
      [`${M}/com/shop/pricing/Rate.java`]: ['package com.shop.pricing;', 'public class Rate {}'],
      [`${M}/com/shop/pricing/Unused.java`]: [
        'package com.shop.pricing;',
        'public class Unused {}'
      ],
      [`${M}/com/shop/pricing/Prices.java`]: [
        'package com.shop.pricing;',
        'public class Prices { public static int of() { return 1; } }'
      ],
      [`${M}/com/shop/tax/Tax.java`]: ['package com.shop.tax;', 'public class Tax {}'],
      [`${M}/com/shop/cart/Cart.java`]: [
        'package com.shop.cart;',
        'import com.shop.tax.Tax;',
        'import com.shop.pricing.*;',
        'import static com.shop.pricing.Prices.of;',
        'class Cart {',
        '  Money total;',
        '  Rate rate;',
        '}'
      ]
    })
    expect(edges).toEqual(['Cart > Money 6', 'Cart > Prices 4', 'Cart > Rate 7', 'Cart > Tax 2'])
  })

  it('resolves a simple name as the language does: single-type import, own package, on-demand', async () => {
    const { edges } = await analyse({
      [`${M}/com/shop/Money.java`]: ['package com.shop;', 'public class Money {}'],
      [`${M}/com/shop/Rate.java`]: ['package com.shop;', 'public class Rate {}'],
      [`${M}/com/other/Money.java`]: ['package com.other;', 'public class Money {}'],
      [`${M}/com/other/Rate.java`]: ['package com.other;', 'public class Rate {}'],
      [`${M}/com/shop/Cart.java`]: [
        'package com.shop;',
        'import com.other.Money;',
        'import com.other.*;',
        'class Cart { Money money; Rate rate; }'
      ]
    })
    // Money is the imported one; Rate the own package's, which goes before the on-demand import.
    expect(edges).toEqual(['Cart > Money 2', 'Cart > Rate 4'])
    const dependency = (
      await analyse({
        [`${M}/a/A.java`]: ['package a;', 'public class A {}'],
        [`${M}/b/B.java`]: ['package b;', 'import a.A;', 'class B { A a; }']
      })
    ).dependencies[0]
    // The line of the import, and Java has no type-only Dependencies.
    expect(dependency).toMatchObject({ lines: [2], typeOnly: false })
  })

  it('does not resolve a name that two files of the repository declare in the same package', async () => {
    const result = await analyse({
      [`cart/${M}/com/shop/Cart.java`]: ['package com.shop;', 'public class Cart {}'],
      [`legacy/${M}/com/shop/Cart.java`]: ['package com.shop;', 'public class Cart {}'],
      [`web/${M}/com/shop/View.java`]: ['package com.shop;', 'class View { Cart cart; }'],
      [`web/${M}/com/web/Page.java`]: ['package com.web;', 'import com.shop.Cart;', 'class Page {}']
    })
    expect(result.dependencies).toEqual([])
    expect(
      result.notResolved.map(({ file, specifier, line }) => [file.split('/')[0], specifier, line])
    ).toEqual([
      ['web', 'Cart', 2],
      ['web', 'com.shop.Cart', 2]
    ])
  })

  it('does not resolve an import of a type that a package of the repository does not declare', async () => {
    const result = await analyse({
      [`${M}/com/shop/Cart.java`]: ['package com.shop;', 'public class Cart {}'],
      [`${M}/com/web/Page.java`]: ['package com.web;', 'import com.shop.Missing;', 'class Page {}']
    })
    expect(result.notResolved).toEqual([
      { file: `${M}/com/web/Page.java`, specifier: 'com.shop.Missing', line: 2 }
    ])
    expect(result.libraries).toEqual([])
  })

  it('records the package of what no file of the repository declares as a Library, but not the platform', async () => {
    const { libraries, dependencies } = await analyse({
      [`${M}/com/shop/Cart.java`]: [
        'package com.shop;',
        'import java.util.List;',
        'import javax.inject.Inject;',
        'import jdk.jfr.Event;',
        'import org.slf4j.Logger;',
        'import org.slf4j.LoggerFactory;',
        'import org.junit.jupiter.api.*;',
        'import static org.junit.Assert.assertEquals;',
        'import com.fasterxml.jackson.databind.ObjectMapper.DefaultTyping;',
        'class Cart {}'
      ]
    })
    expect(dependencies).toEqual([])
    expect(libraries.map(({ library }) => library)).toEqual([
      'org.slf4j',
      'org.junit.jupiter.api',
      'org.junit',
      'com.fasterxml.jackson.databind'
    ])
  })

  it('takes the import of a nested type for a use of the file that declares its outer type', async () => {
    const { edges } = await analyse({
      [`${M}/com/shop/Cart.java`]: [
        'package com.shop;',
        'public class Cart { public static class Line {} }'
      ],
      [`${M}/com/web/Page.java`]: [
        'package com.web;',
        'import com.shop.Cart.Line;',
        'class Page { Line line; }'
      ]
    })
    expect(edges).toEqual(['Page > Cart 2'])
  })

  it('lets a nested type or a type parameter of the file hide a type of its package', async () => {
    const { edges } = await analyse({
      [`${M}/com/shop/Line.java`]: ['package com.shop;', 'public class Line {}'],
      [`${M}/com/shop/T.java`]: ['package com.shop;', 'public class T {}'],
      [`${M}/com/shop/Cart.java`]: [
        'package com.shop;',
        'class Cart<T> {',
        '  static class Line {}',
        '  Line line;',
        '  T value;',
        '}'
      ]
    })
    expect(edges).toEqual([])
  })

  it('finds Dependencies among the files of the default package', async () => {
    const { edges } = await analyse({
      'src/Main.java': ['class Main { Helper helper; }'],
      'src/Helper.java': ['class Helper {}']
    })
    expect(edges).toEqual(['Main > Helper 1'])
  })
})

describe('what Java resolution does not see, by design (docs/structure-format.md, section 3)', () => {
  const invoice = {
    [`${M}/com/shop/billing/Invoice.java`]: [
      'package com.shop.billing;',
      'public class Invoice { public static class Entry {} public Money total() { return null; } }'
    ],
    [`${M}/com/shop/billing/Money.java`]: ['package com.shop.billing;', 'public class Money {}']
  }

  it('does not see reflection', async () => {
    const result = await analyse({
      ...invoice,
      [`${M}/com/shop/web/Page.java`]: [
        'package com.shop.web;',
        'class Page { Object o = Class.forName("com.shop.billing.Invoice"); }'
      ]
    })
    expect(result.edges.filter((edge) => edge.startsWith('Page'))).toEqual([])
  })

  it('does not see a fully qualified name written inside code', async () => {
    const result = await analyse({
      ...invoice,
      [`${M}/com/shop/web/Page.java`]: [
        'package com.shop.web;',
        'class Page { Object o = new com.shop.billing.Invoice(); }'
      ]
    })
    expect(result.edges.filter((edge) => edge.startsWith('Page'))).toEqual([])
    expect(result.notResolved).toEqual([])
  })

  it('does not see the types of members inherited from a type the file does not name', async () => {
    const result = await analyse({
      ...invoice,
      [`${M}/com/shop/web/Page.java`]: [
        'package com.shop.web;',
        'import com.shop.billing.Invoice;',
        'class Page extends Invoice { Object cents() { return total(); } }'
      ]
    })
    // `total()` returns a Money; Page never names it.
    expect(result.edges.filter((edge) => edge.startsWith('Page'))).toEqual(['Page > Invoice 2'])
  })

  it('does not see a nested type used without the import of its outer type', async () => {
    const result = await analyse({
      ...invoice,
      [`${M}/com/shop/web/Page.java`]: [
        'package com.shop.web;',
        'import com.shop.billing.Invoice;',
        'class Page extends Invoice { Entry entry; }'
      ]
    })
    expect(result.edges.filter((edge) => edge.startsWith('Page'))).toEqual(['Page > Invoice 2'])
    expect(result.notResolved).toEqual([])
  })

  it('counts a variable that carries the name of a type of its own package, wrongly and knowingly', async () => {
    const result = await analyse({
      [`${M}/com/shop/Lines.java`]: ['package com.shop;', 'public class Lines {}'],
      [`${M}/com/shop/Cart.java`]: [
        'package com.shop;',
        'class Cart { int count(java.util.List<String> Lines) { return Lines.size(); } }'
      ]
    })
    expect(result.edges).toEqual(['Cart > Lines 2'])
  })

  it('does not count a qualifier that resolves to no type: a variable', async () => {
    const result = await analyse({
      [`${M}/com/shop/Cart.java`]: [
        'package com.shop;',
        'class Cart { int count(java.util.List<String> lines) { return lines.size(); } }'
      ]
    })
    expect(result.dependencies).toEqual([])
    expect(result.notResolved).toEqual([])
  })
})
