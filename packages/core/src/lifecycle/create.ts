import { namesNumber } from '../foreign/madr'
import type { Plan } from '../plan'
import { joinPath, type FileSystem } from '@adr-tool/kernel'
import type { DecisionLog } from '../log/load'
import { nextPrefix, slugify } from '../log/new-id'
import { fillTemplate, loadTemplate } from '../templates/templates'
import type { Eol } from '../text/source'
import type { Today } from './decide'
import { Refusal, plan } from './pending'
import { requireTarget } from './rules'

export interface NewAdr extends Today {
  readonly title: string
  /** The name of a Template of the repository, or of a built-in one. */
  readonly template: string
  /** The new ADR is written to supersede or amend this one. Nothing is written there until it is accepted. */
  readonly relation?: { readonly type: 'supersedes' | 'amends'; readonly target: string }
}

/**
 * Create a `proposed` ADR from a Template (docs/file-format.md, section 7). The tool decides
 * the ID and writes the Metadata; the Template gives the body. `log` may be a log that has
 * no ADRs and no directory yet.
 */
export function planCreate(fs: FileSystem, log: DecisionLog, adr: NewAdr): Promise<Plan> {
  let created: { id: string; path: string } | undefined
  const warnings: string[] = []
  const planned = plan(fs, async (pending) => {
    const title = adr.title.trim().replace(/\s+/g, ' ')
    const slug = slugify(title)
    if (slug === '') throw new Refusal('The title needs at least one letter or digit.')

    const relation = adr.relation
    if (relation) {
      const target = log.adrs.find((candidate) => candidate.id === relation.target)
      if (!target) throw new Refusal(`There is no ADR ${relation.target} in this Decision Log.`)
      requireTarget(relation.type, target)
    }

    const template = await loadTemplate(fs, adr.template)
    if ('problem' in template) throw new Refusal(template.problem)

    const prefix = nextPrefix(log, adr.today)
    const id = `${prefix}-${slug}`
    if (log.adrs.some((existing) => existing.id === id)) {
      throw new Refusal(`${id} already exists in this Decision Log.`)
    }

    // MADR 4 names a successor by its number; one that names this number has been waiting for it.
    if (log.naming === 'sequential') {
      for (const other of log.adrs) {
        if (!namesNumber(other, Number(prefix))) continue
        warnings.push(
          `${other.id} says it is superseded by the ADR with the number ${Number(prefix)}, which there was none of so far. The new ADR will be read as that successor.`
        )
      }
    }

    const eol = prevailingEol(log)
    const metadata = [
      '---',
      'status: proposed',
      `created: ${adr.today}`,
      ...(relation ? [`${relation.type}: [${relation.target}]`] : []),
      '---',
      ''
    ]
    const body = fillTemplate(template.text, { title, date: adr.today, number: prefix })
    const lines = [...metadata, ...body.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n'), '']

    created = { id, path: joinPath(log.path, `${id}.md`) }
    await pending.create(created.path, lines.join(eol))
  })
  return planned.then((result) =>
    result.ok && created ? { ...result, created, ...(warnings.length > 0 && { warnings }) } : result
  )
}

/** The line ending most ADRs of the log use; LF when there are none, or on a tie. */
function prevailingEol(log: DecisionLog): Eol {
  const crlf = log.adrs.filter((adr) => adr.eol === '\r\n').length
  return crlf > log.adrs.length - crlf ? '\r\n' : '\n'
}
