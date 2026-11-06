import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'

interface Manifest {
  readonly name?: string
  readonly version?: string
  readonly license?: string
}

const NODE_MODULES = '/node_modules/'
const RULE = `\n\n${'-'.repeat(78)}\n\n`

/**
 * Where the Source Code of a package under the Eclipse Public License is, which every copy of
 * it has to say, in whatever form (EPL-2.0, section 3.1(a); ADR-0024). A package under the EPL
 * that is not named here fails the build, as its notice would be incomplete.
 */
const SOURCE: Record<string, (version: string) => string> = {
  elkjs: (version) =>
    `The Source Code of elkjs ${version} is available under the Eclipse Public License 2.0 at https://github.com/kieler/elkjs, tag ${version}.`
}

/**
 * Where the notices of a build go. `file`: beside what it builds, as `THIRD-PARTY-NOTICES.txt`,
 * which the installers of the app carry (electron-builder.yml). `comment`: at the end of each
 * file it builds, as a comment, so that a command stays one file (`adr.mjs`, `adr-mcp.mjs`).
 */
export type NoticesInto = 'file' | 'comment'

/**
 * The notices of the packages a build bundles: their licences ask that they travel with every
 * copy (ADR-0010). A package is the directory below the last `node_modules` in the path of a
 * file the build read: a module, or a file a plugin read into one and announced with
 * `addWatchFile`, as the WebAssembly of tree-sitter (command.config.ts). The workspace's own
 * packages are under the suite's licence and are not listed.
 */
export function notices(into: NoticesInto = 'file'): Plugin {
  // A file a stylesheet points to, a font, is announced relative to the root of the build.
  let root = process.cwd()
  return {
    name: 'third-party-notices',
    apply: 'build',
    configResolved(config) {
      root = config.root
    },
    generateBundle(_, bundle) {
      const roots = new Set<string>()
      for (const id of new Set([...this.getModuleIds(), ...this.getWatchFiles()])) {
        const read = id.replace(/^\0/, '').split('?')[0]!
        const path = resolve(root, read).replaceAll('\\', '/')
        const at = path.lastIndexOf(NODE_MODULES)
        if (at < 0) continue
        const [first, second] = path.slice(at + NODE_MODULES.length).split('/')
        const name = first?.startsWith('@') ? `${first}/${second}` : first
        if (name) roots.add(`${path.slice(0, at + NODE_MODULES.length)}${name}`)
      }
      if (roots.size === 0) return
      const sections = [...roots].map((root) => {
        const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Manifest
        const file = readdirSync(root).find((name) => /^(licen[cs]e|copying)(\.|-|$)/i.test(name))
        const text = file
          ? readFileSync(join(root, file), 'utf8').trim()
          : `Licence: ${manifest.license ?? 'not stated'}, without a licence file in the package.`
        const name = manifest.name ?? root
        const source = SOURCE[name]?.(manifest.version ?? '')
        if (source === undefined && /\bEPL\b/.test(manifest.license ?? '')) {
          this.error(
            `${name} is under ${manifest.license}, and the notices do not say where its Source Code is: name it in SOURCE (ADR-0024).`
          )
        }
        return [`${name} ${manifest.version ?? ''}`.trim(), ...(source ? [source] : []), text].join(
          '\n\n'
        )
      })
      sections.sort()
      const text = [
        'Softarch Suite contains the following packages, each under the licence given with it.',
        ...sections
      ].join(RULE)
      if (into === 'file') {
        this.emitFile({ type: 'asset', fileName: 'THIRD-PARTY-NOTICES.txt', source: text })
        return
      }
      // A block comment ends at the first `*/`, and only there: none of the text may close it.
      const comment = `\n/*\n${text.replaceAll('*/', '*\\/')}\n*/\n`
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') output.code += comment
      }
    }
  }
}
