import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

interface Manifest {
  readonly name?: string
  readonly version?: string
  readonly license?: string
}

const NODE_MODULES = '/node_modules/'
const RULE = `\n\n${'-'.repeat(78)}\n\n`

/**
 * Where the notices of a build go. `file`: beside what it builds, as `THIRD-PARTY-NOTICES.txt`,
 * which the installers of the app carry (electron-builder.yml). `comment`: at the end of each
 * file it builds, as a comment, so that a command stays one file (`adr.mjs`, `adr-mcp.mjs`).
 */
export type NoticesInto = 'file' | 'comment'

/**
 * The notices of the packages a build bundles: their licences ask that they travel with every
 * copy (ADR-0010). A package is the directory below the last `node_modules` in the path of a
 * module of the build; the workspace's own packages are under the suite's licence and are not
 * listed.
 */
export function notices(into: NoticesInto = 'file'): Plugin {
  return {
    name: 'third-party-notices',
    apply: 'build',
    generateBundle(_, bundle) {
      const roots = new Set<string>()
      for (const id of this.getModuleIds()) {
        const path = id.replace(/^\0/, '').split('?')[0]!.replaceAll('\\', '/')
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
        return `${manifest.name ?? root} ${manifest.version ?? ''}`.trim() + `\n\n${text}`
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
