import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import type { DeclaredComponent } from '../src/declaration'
import { draftComponents, segmentOf } from '../src/draft'
import { sourceFilesAmong } from '../src/source-files'

/** The Draft of a repository given as path → text; an empty text will do for code. */
async function draft(repository: Record<string, string>): Promise<string[]> {
  const files = Object.keys(repository)
  const components = await draftComponents(
    memoryFileSystem(repository),
    files,
    sourceFilesAmong(files)
  )
  const flat = (list: readonly DeclaredComponent[]): string[] =>
    list.flatMap((component) => [
      `${component.id} ← ${component.paths.join(', ')}`,
      ...flat(component.children)
    ])
  return flat(components)
}

describe('the Draft (docs/structure-format.md, section 1)', () => {
  it('takes the packages of a pnpm workspace, and one level of directories beneath their source root', async () => {
    expect(
      await draft({
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n  - "!packages/legacy"\n',
        'package.json': '{ "name": "root" }',
        'packages/core/package.json': '{}',
        'packages/core/src/index.ts': '',
        'packages/core/src/metadata/read.ts': '',
        'packages/core/src/metadata/deep/scalar.ts': '',
        'packages/core/src/log/load.ts': '',
        'packages/core/test/load.test.ts': '',
        'packages/app/package.json': '{}',
        'packages/app/src/main/index.ts': '',
        'packages/app/src/renderer/src/App.svelte': '',
        'packages/docs/package.json': '{}',
        'packages/docs/README.md': '',
        'packages/legacy/package.json': '{}',
        'packages/legacy/index.js': '',
        'tools/not-a-package/run.mjs': ''
      })
    ).toEqual([
      'app ← packages/app/**',
      'app/main ← packages/app/src/main/**',
      'app/renderer ← packages/app/src/renderer/**',
      'core ← packages/core/**',
      // `test` is not under the source root: the package itself owns it.
      'core/log ← packages/core/src/log/**',
      'core/metadata ← packages/core/src/metadata/**'
      // `docs` holds no Source File, `legacy` is taken out, `tools` is no package.
    ])
  })

  it('takes the workspaces of npm and yarn, written as a list or under packages', async () => {
    const code = { 'apps/web/package.json': '{}', 'apps/web/index.ts': '' }
    expect(await draft({ 'package.json': '{ "workspaces": ["apps/*"] }', ...code })).toEqual([
      'web ← apps/web/**'
    ])
    expect(
      await draft({ 'package.json': '{ "workspaces": { "packages": ["apps/*"] } }', ...code })
    ).toEqual(['web ← apps/web/**'])
  })

  it('follows the modules of Maven, a module of a module becoming a child, and passes over the base package', async () => {
    const pom = (...modules: string[]): string =>
      `<project><!-- <modules><module>commented-out</module></modules> -->
         <modules>${modules.map((module) => `<module> ${module} </module>`).join('')}</modules>
       </project>`
    expect(
      await draft({
        'pom.xml': pom('shop', 'tools/pom.xml', '../outside'),
        'shop/pom.xml': pom('cart', 'pricing'),
        'shop/cart/pom.xml': '<project/>',
        'shop/cart/src/main/java/com/example/shop/cart/api/Cart.java': '',
        'shop/cart/src/main/java/com/example/shop/cart/impl/CartImpl.java': '',
        'shop/cart/src/test/java/com/example/shop/cart/CartTest.java': '',
        'shop/pricing/pom.xml': '<project/>',
        'shop/pricing/src/main/java/com/example/shop/pricing/Money.java': '',
        'tools/pom.xml': '<project/>',
        'tools/src/main/java/com/example/tools/Main.java': '',
        'commented-out/pom.xml': '<project/>',
        'commented-out/src/main/java/X.java': ''
      })
    ).toEqual([
      'shop ← shop/**',
      'shop/cart ← shop/cart/**',
      'shop/cart/api ← shop/cart/src/main/java/com/example/shop/cart/api/**',
      'shop/cart/impl ← shop/cart/src/main/java/com/example/shop/cart/impl/**',
      'shop/pricing ← shop/pricing/**',
      'tools ← tools/**'
    ])
  })

  it('reads the includes of Gradle as text, string literals only, in both dialects', async () => {
    expect(
      await draft({
        'settings.gradle': `
          rootProject.name = 'shop'
          // include 'commented'
          include ':app', ':libs:core'
          include(
            ":libs:io",
            'plain'
          )
          include computed()
          includeBuild 'build-logic'
        `,
        'app/src/main/java/App.java': '',
        'libs/core/src/main/java/Core.java': '',
        'libs/io/src/main/java/Io.java': '',
        'plain/src/main/java/Plain.java': '',
        'commented/src/main/java/C.java': '',
        'build-logic/src/main/java/B.java': ''
      })
    ).toEqual([
      'app ← app/**',
      'libs ← libs/**',
      'libs/core ← libs/core/**',
      'libs/io ← libs/io/**',
      'plain ← plain/**'
    ])
    expect(
      await draft({
        'settings.gradle.kts': 'include(":app")\n',
        'app/src/main/kotlin/App.kt': '',
        'app/src/main/java/App.java': ''
      })
    ).toEqual(['app ← app/**'])
  })

  it('takes the directories under the source root where nothing names units', async () => {
    expect(
      await draft({
        'package.json': '{ "name": "single" }',
        'src/main.ts': '',
        'src/cart/cart.ts': '',
        'src/pricing/money.ts': '',
        'src/pricing/deep/rate.ts': '',
        'scripts/release.mjs': '',
        'docs/guide.md': ''
      })
    ).toEqual(['cart ← src/cart/**', 'pricing ← src/pricing/**'])
  })

  it('makes one Component of a repository whose code lies in one directory', async () => {
    expect(await draft({ 'src/a.ts': '', 'src/b.ts': '' })).toEqual(['src ← src/**'])
    expect(await draft({ 'a.ts': '', 'b.ts': '' })).toEqual(['repository ← **'])
    expect(await draft({ 'README.md': '' })).toEqual([])
  })

  it('never drafts a directory twice: what is a unit, or holds one, is no child directory', async () => {
    expect(
      await draft({
        'package.json': '{ "workspaces": ["services/*", "services/billing/plugins/*"] }',
        'services/billing/package.json': '{}',
        'services/billing/index.ts': '',
        'services/billing/lib/a.ts': '',
        'services/billing/plugins/tax/package.json': '{}',
        'services/billing/plugins/tax/index.ts': ''
      })
    ).toEqual([
      'billing ← services/billing/**',
      'billing/lib ← services/billing/lib/**',
      'billing/tax ← services/billing/plugins/tax/**'
    ])
  })

  it('makes a segment from the name of a directory, and tells siblings apart that would share one', async () => {
    expect(segmentOf('My_App.Web')).toBe('my-app-web')
    expect(segmentOf('__tests__')).toBe('tests')
    expect(segmentOf('___')).toBe('unit')
    const components = await draftComponents(
      memoryFileSystem({}),
      [],
      sourceFilesAmong(['src/Cart/a.ts', 'src/cart/b.ts', 'src/cart_/c.ts'])
    )
    expect(components.map((component) => [component.id, component.name, component.paths])).toEqual([
      ['cart', 'Cart', ['src/Cart/**']],
      ['cart-2', 'cart', ['src/cart/**']],
      ['cart-3', 'cart_', ['src/cart_/**']]
    ])
  })

  it('leaves out what is never looked at, also when a workspace names it', async () => {
    expect(
      await draft({
        'package.json': '{ "workspaces": ["**"] }',
        'node_modules/dep/package.json': '{}',
        'node_modules/dep/index.js': '',
        'app/package.json': '{}',
        'app/index.ts': ''
      })
    ).toEqual(['app ← app/**'])
  })

  it('goes on without a build file it cannot read', async () => {
    expect(
      await draft({
        'package.json': '{ not json',
        'pnpm-workspace.yaml': 'packages: [unclosed',
        'src/a/x.ts': '',
        'src/b/y.ts': ''
      })
    ).toEqual(['a ← src/a/**', 'b ← src/b/**'])
  })
})
