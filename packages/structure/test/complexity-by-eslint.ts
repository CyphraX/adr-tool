/**
 * The complexity of every function of a TypeScript or JavaScript file the way ESLint counts
 * it: its own rule `complexity`, on the tree of its own parser for TypeScript — a second,
 * independent count that the measures of `structure` are checked against. Never used by the
 * app.
 *
 * The rule reports a function above its maximum; at a maximum of 0 it reports every one. What
 * it counts as functions of their own and the suite does not — a class field's value, a static
 * block (docs/structure-format.md, section 5) — is left out: by the name it reports them with,
 * since the value of a field may be an arrow function, which it reports twice, as a function
 * and as the value.
 */
import tsParser from '@typescript-eslint/parser'
import { Linter, type Rule } from 'eslint'
import { builtinRules } from 'eslint/use-at-your-own-risk'

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])
/** What the rule counts as a unit of its own and names so, and the suite does not count. */
const UNITS = new Set(['class field initializer', 'class static block'])

/** Each function where it ends, and its complexity, sorted. */
export type Counted = [endLine: number, complexity: number][]

export function complexityByEslint(path: string, text: string): Counted {
  const complexity = builtinRules.get('complexity')!
  const counted: Counted = []
  // The rule as it is, with its reports taken down instead of shown.
  const probe: Rule.RuleModule = {
    meta: { ...complexity.meta, schema: false },
    create: (context) =>
      complexity.create(
        Object.create(context, {
          options: { value: [0] },
          report: {
            value: (descriptor: {
              node: { type: string; loc: { end: { line: number } } }
              data: { complexity: number; name: string }
            }) => {
              if (
                FUNCTIONS.has(descriptor.node.type) &&
                !UNITS.has(descriptor.data.name.toLowerCase())
              ) {
                counted.push([descriptor.node.loc.end.line, Number(descriptor.data.complexity)])
              }
            }
          }
        }) as Rule.RuleContext
      )
  }
  const messages = new Linter({ configType: 'flat' }).verify(
    text,
    [
      {
        // A pattern that ends in `*` matches no file on its own.
        files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
        languageOptions: {
          parser: tsParser,
          parserOptions: { ecmaFeatures: { jsx: /\.[jt]sx$/.test(path) } }
        },
        plugins: { probe: { rules: { complexity: probe } } },
        rules: { 'probe/complexity': 'error' }
      }
    ],
    { filename: path }
  )
  const fatal = messages.find((message) => message.fatal)
  if (fatal) throw new Error(`${path}:${fatal.line}: ${fatal.message}`)
  return counted.sort((a, b) => a[0] - b[0] || a[1] - b[1])
}
