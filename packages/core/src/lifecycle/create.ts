import { namesNumber } from '../foreign/madr'
import type { Plan } from '../plan'
import { joinPath, type FileSystem } from '@adr-tool/kernel'
import type { DecisionLog } from '../log/load'
import { nextPrefix, slugify } from '../log/new-id'
import { formatScalar } from '../metadata/write'
import { fillTemplate, loadTemplate } from '../templates/templates'
import type { Eol } from '../text/source'
import type { Today } from './decide'
import { plan } from './pending'
import { refuse, Warnings } from '../sentences'
import { isQualified, normalReference } from '../relations/reference'
import { named, requireTarget } from './rules'

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
  const warnings = new Warnings()
  const planned = plan(fs, async (pending) => {
    const title = adr.title.trim().replace(/\s+/g, ' ')
    const slug = slugify(title)
    if (slug === '') refuse({ code: 'title-needs-letter', values: {} })

    const relation = adr.relation
    if (relation) {
      const target = named(log, relation.target)
      if (!target) {
        refuse({
          code: isQualified(relation.target) ? 'no-adr-in-repository' : 'no-adr',
          values: { id: relation.target }
        })
      }
      requireTarget(relation.type, target)
    }

    const template = await loadTemplate(fs, adr.template)
    if ('problem' in template) refuse(template.said)

    const prefix = nextPrefix(log, adr.today)
    const id = `${prefix}-${slug}`
    if (log.adrs.some((existing) => existing.id === id)) {
      refuse({ code: 'id-taken', values: { id } })
    }

    // MADR 4 names a successor by its number; one that names this number has been waiting for it.
    if (log.naming === 'sequential') {
      for (const other of log.adrs) {
        if (!namesNumber(other, Number(prefix))) continue
        warnings.push({
          code: 'successor-by-number',
          values: { adr: other.id, number: Number(prefix) }
        })
      }
    }

    const eol = prevailingEol(log)
    const metadata = [
      '---',
      'status: proposed',
      `created: ${adr.today}`,
      ...(relation
        ? [`${relation.type}: [${formatScalar(normalReference(log.path, relation.target))}]`]
        : []),
      '---',
      ''
    ]
    const body = fillTemplate(template.text, { title, date: adr.today, number: prefix })
    const lines = [...metadata, ...body.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n'), '']

    created = { id, path: joinPath(log.path, `${id}.md`) }
    await pending.create(created.path, lines.join(eol))
  })
  return planned.then((result) =>
    result.ok && created ? { ...result, created, ...warnings.outcome() } : result
  )
}

/** The line ending most ADRs of the log use; LF when there are none, or on a tie. */
function prevailingEol(log: DecisionLog): Eol {
  const crlf = log.adrs.filter((adr) => adr.eol === '\r\n').length
  return crlf > log.adrs.length - crlf ? '\r\n' : '\n'
}
