import { Console } from 'node:console'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { libraryTools } from './libraries'
import { serve } from './protocol'
import { metricTools } from './metrics'
import { toolsFor } from './tools'

const USAGE = `Usage: adr-mcp [path]

Serves the Decision Logs, the Structure and the Rules of the repository at path (the current
directory by default) to an agent over the Model Context Protocol, on standard input and
output. See docs/mcp.md.
`

async function main(args: readonly string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(USAGE)
    return 0
  }
  if (args.length > 1 || args.some((arg) => arg.startsWith('-'))) {
    process.stderr.write(`adr-mcp: ${args.join(' ')} is not understood.\n\n${USAGE}`)
    return 2
  }
  const root = resolve(args[0] ?? '.')
  if (!(await stat(root).catch(() => undefined))?.isDirectory()) {
    process.stderr.write(`adr-mcp: ${root} is not a directory.\n`)
    return 2
  }
  // Standard output is the protocol's alone: what a library prints goes to standard error.
  const aside = new Console(process.stderr)
  for (const method of ['log', 'info', 'debug', 'dir', 'dirxml', 'table', 'trace'] as const) {
    console[method] = aside[method].bind(aside)
  }
  await serve(
    process.stdin,
    process.stdout,
    {
      name: 'softarch-suite',
      title: 'Softarch Suite',
      version: '0.0.0',
      instructions: instructionsFor(root)
    },
    [...toolsFor({ root }), ...metricTools({ root }), ...libraryTools({ root })],
    (text) => process.stderr.write(`adr-mcp: ${text}\n`)
  )
  return 0
}

/** What an agent is told when it connects: how the tools are meant to be used. */
export function instructionsFor(root: string): string {
  return [
    `The Architecture Decision Records of the repository at ${root}, as Softarch Suite reads and writes them.`,
    'Read with list_decision_logs, list_adrs, read_adr, search_adrs and list_problems.',
    'The code has an architecture: read_structure shows the Components, their Dependencies, Cycles and metrics; list_rules the Rules the code must keep to. Before you write an import from one Component into another, ask list_violations with "from" and "to" whether it would break a Rule, and if it would, write it another way or ask the person.',
    'Every write takes two steps. A plan_* tool returns the change — each file as a diff, and warnings — and writes nothing. Show it to the person; apply_change writes it, discard_change drops it.',
    'To edit the text of an ADR, read it with read_adr first and pass the revision it returns to plan_edit_body: an edit of a body that changed since is refused.',
    'The tool decides IDs, numbers and Metadata, and keeps Relations and Back-references consistent. Do not write ADR files or .arch/rules.yml directly: plan_rule and plan_exception write the Rules and Exceptions.',
    'The Diagrams of the architecture are read with list_diagrams and read_diagram, which compares one with the code (its Drift); plan_new_diagram, plan_diagram_change, plan_diagram_export and plan_diagram_repair plan their changes the same way. Do not write Diagram files or their SVG pictures directly.',
    'component_metrics measures the code of a Component: abstractness, distance, the propagation cost of the level below it, its most complex functions and least cohesive classes.',
    'list_libraries lists the Libraries the manifests declare and the code uses, per Component, with their versions and licences.'
  ].join('\n')
}

process.exitCode = await main(process.argv.slice(2))
