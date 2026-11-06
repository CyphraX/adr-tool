import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

interface Manifest {
  readonly name?: string
  readonly version?: string
  readonly license?: string
}

const NODE_MODULES = '/node_modules/'

/**
 * The notices of the packages a build bundles, written beside what it builds as
 * `THIRD-PARTY-NOTICES.txt`: their licences ask that they travel with every copy, and the
 * installers carry them (ADR-0010, electron-builder.yml). A package is the directory below the
 * last `node_modules` in the path of a module of the build; the workspace's own packages are
 * under the suite's licence and are not listed.
 */
export function notices(): Plugin {
  return {
    name: 'third-party-notices',
    apply: 'build',
    generateBundle() {
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
      this.emitFile({
        type: 'asset',
        fileName: 'THIRD-PARTY-NOTICES.txt',
        source: [
          'Softarch Suite contains the following packages, each under the licence given with it.',
          ...sections
        ].join(`\n\n${'-'.repeat(78)}\n\n`)
      })
    }
  }
}
