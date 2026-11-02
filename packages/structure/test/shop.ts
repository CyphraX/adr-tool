import { memoryFileSystem } from '@adr-tool/kernel'
import { analyseDependencies } from '../src/dependencies'
import { openStructure } from '../src/structure'

/** A shop with a Cycle at every level: between Components, between children, between files. */
export const shop: Record<string, string> = {
  '.arch/components.yml': [
    'components:',
    '  shop:',
    '    paths: [src/shop/**]',
    '    components:',
    '      cart: { paths: [src/shop/cart/**] }',
    '      pricing: { paths: [src/shop/pricing/**] }',
    '  billing:',
    '    paths: [src/billing/**]',
    '  shared:',
    '    paths: [src/shared/**]',
    ''
  ].join('\n'),
  'src/shop/index.ts': "export * from './cart/cart'\n",
  'src/shop/cart/cart.ts': [
    "import { price } from '../pricing/price'",
    "import { invoice } from '../../billing/invoice'",
    ''
  ].join('\n'),
  'src/shop/cart/line.ts': "import type { Money } from '../../shared/money'\n",
  'src/shop/pricing/price.ts': [
    "import { Cart } from '../cart/cart'",
    "import { invoice } from '../../billing/invoice'",
    ''
  ].join('\n'),
  'src/shop/pricing/discount.ts': "import { line } from '../cart/line'\n",
  'src/billing/invoice.ts': [
    "import type { Cart } from '../shop/cart/cart'",
    "import { money } from '../shared/money'",
    ''
  ].join('\n'),
  'src/billing/a.ts': "import { b } from './b'\n",
  'src/billing/b.ts': "import { a } from './a'\n",
  'src/shared/money.ts': '',
  'src/shared/money.test.ts': [
    "import { money } from './money'",
    "import { cart } from '../shop/cart/cart'",
    ''
  ].join('\n'),
  'scripts/seed.ts': "import '../src/shop/index'\n"
}

/** A repository in memory, its Components and its Dependencies. */
export async function analysed(repository: Record<string, string>) {
  const fs = memoryFileSystem(repository)
  const files = Object.keys(repository)
  const structure = await openStructure(fs, files)
  return { structure, ...(await analyseDependencies(fs, files, structure.sourceFiles)) }
}
