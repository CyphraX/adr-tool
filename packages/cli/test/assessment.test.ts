import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import { openAssessments, traceProblems, wordingOf } from '@adr-tool/assessment'
import { checkConformance, readRules } from '@adr-tool/conformance'
import { everyComponent } from '@adr-tool/structure'
import { analyseRepository } from '../src/analysis'
import { repositoryFiles } from '../src/files'

// The Java shop of part 10 (packages/assessment/test/fixtures), whose Assessment cites the
// Violation of its Rule. Its own tests derive that Violation from the Dependencies; here the
// Traces are checked against what `adr check` finds, by the code the command runs.
const assessedShop = fileURLToPath(
  new URL('../../assessment/test/fixtures/maven-shop/', import.meta.url)
)
const PAGE = 'web/src/main/java/com/shop/web/Page.java'
const ASSESSMENT = 'docs/architecture/assessments/20261103-the-shop-before-the-checkout-rewrite.md'

const scratch: string[] = []
afterAll(() => {
  for (const root of scratch) rmSync(root, { recursive: true, force: true })
})

/** The Problems of the Traces of the shop's Assessments, against what Conformance finds now. */
async function traceProblemsIn(root: string) {
  const fs = repositoryFiles(root)
  const { structure, dependencies } = await analyseRepository(root, fs)
  const conformance = checkConformance(
    readRules(await fs.readText('.arch/rules.yml')),
    structure,
    dependencies
  )
  expect(conformance.evaluated).toBe(true)
  return traceProblems(await openAssessments(fs), {
    components: everyComponent(structure.components).map((component) => component.id),
    violations: conformance.violations.map((violation) => violation.fingerprint)
  })
}

it('checks the Violation a Finding cites against the fingerprints adr check finds', async () => {
  const root = mkdtempSync(join(tmpdir(), 'adr-assessment-'))
  scratch.push(root)
  cpSync(assessedShop, root, { recursive: true })
  expect(await traceProblemsIn(root)).toEqual([])

  // The page asks the cart, as ADR-0001 says: it no longer uses Search.
  const page = readFileSync(join(root, PAGE), 'utf8')
  writeFileSync(
    join(root, PAGE),
    page
      .replace('import com.shop.catalog.Search;\n', '')
      .replace('  private final Search search;\n', '')
      .replace('Page(Search search)', 'Page()')
      .replace('    this.search = search;\n', '')
  )
  const problems = await traceProblemsIn(root)
  expect(problems.map(wordingOf)).toEqual([
    `${ASSESSMENT}: F1 cites the Violation web-through-cart: web -> catalog, which the code no longer has. Look at the Finding again: it may be resolved.`
  ])
})
