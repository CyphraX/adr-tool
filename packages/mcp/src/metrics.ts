/**
 * Structure's metrics of the code inside a Component, as data for an agent (docs/mcp.md,
 * "component_metrics"; docs/structure-format.md, section 5): its abstractness and distance from
 * the main sequence, the propagation cost of the level below it, its most complex functions and
 * its least cohesive classes. One tool of its own, beside the tools of the Decision Logs: it
 * analyses the code, which they never do. It reads, and writes nothing.
 */
import { analyseRepository } from '@adr-tool/cli/analysis'
import {
  everyComponent,
  levelOf,
  measuredInside,
  metricsOf,
  propagationCostOf,
  type Metrics
} from '@adr-tool/structure/model'
import { repositoryFiles } from './files'
import { Refusal, type Tool } from './protocol'

/** How many functions and classes a call lists at most, the most complex first. */
const FUNCTIONS_LISTED = 20
const CLASSES_LISTED = 10

/** A metric that is undefined — nothing to divide by — is `null`, so that it is not left out. */
const defined = (value: number | undefined): number | null => value ?? null

/** The metrics of a Component or a node of a level, each one there, undefined ones as `null`. */
function metricsData(metrics: Metrics): Record<string, number | null> {
  return Object.fromEntries(
    Object.entries(metrics).map(([key, value]) => [key, defined(value as number | undefined)])
  )
}

export function metricTools(options: { readonly root: string }): Tool[] {
  const fs = repositoryFiles(options.root)
  return [
    {
      name: 'component_metrics',
      title: 'Measure a Component',
      description:
        'Structure\'s metrics of a Component, or of the whole repository when "component" is left out, as data: its size, coupling, instability, abstractness and distance from the main sequence; the propagation cost of the level below it and the A, I and D of each node there; its most complex functions by cyclomatic complexity, each with its file and line; and its classes whose methods fall into more than one group by LCOM4. Analyses the code, which takes a moment on a large repository. Java is read without a classpath: its numbers are a lower bound.',
      inputSchema: {
        type: 'object',
        properties: {
          component: {
            type: 'string',
            description:
              'The ID of a Component, from list_components. Left out: the whole repository and its top level.'
          },
          tests: {
            type: 'boolean',
            description: 'Whether test files count. They do not unless this is true.'
          }
        },
        additionalProperties: false
      },
      annotations: {
        title: 'Measure a Component',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      run: async (input) => {
        const component = typeof input.component === 'string' ? input.component : undefined
        const tests = input.tests === true
        const { structure, dependencies } = await analyseRepository(options.root, fs)
        const ids = everyComponent(structure.components).map((one) => one.id)
        if (component !== undefined && !ids.includes(component)) {
          throw new Refusal(
            ids.length === 0
              ? `There is no Component ${component}: the repository has none.`
              : `There is no Component ${component}. list_components names the Components there are.`
          )
        }
        const { measures, lineCounts } = dependencies
        const metrics = metricsOf(
          structure,
          dependencies.dependencies,
          lineCounts,
          { tests },
          measures
        )
        const level = levelOf(structure, dependencies.dependencies, component, { tests })
        const { functions, classes } = measuredInside(structure, measures, component, { tests })
        const cohesive = classes.filter((one) => one.lcom4 !== undefined && one.lcom4 > 1)
        const own = component === undefined ? undefined : metrics.get(component)
        const java = structure.sourceFiles.some(
          (file) =>
            file.language === 'java' &&
            (tests || !file.test) &&
            (component === undefined ||
              file.component === component ||
              file.component?.startsWith(`${component}/`) === true)
        )
        return {
          origin: structure.origin,
          ...(component !== undefined && { component }),
          tests,
          ...(own !== undefined && { metrics: metricsData(own) }),
          level: {
            below: component ?? '*',
            propagationCost: defined(level && propagationCostOf(level)),
            nodes: (level?.nodes ?? []).map((node) => {
              const known = metrics.get(node.id)
              return {
                kind: node.kind,
                id: node.id,
                files: node.files.length,
                ...(known !== undefined && {
                  abstractness: defined(known.abstractness),
                  instability: defined(known.instability),
                  distance: defined(known.distance)
                })
              }
            })
          },
          functions: functions.slice(0, FUNCTIONS_LISTED),
          functionCount: functions.length,
          classes: cohesive.slice(0, CLASSES_LISTED),
          classCount: classes.length,
          ...(java && {
            note: 'Java is read without a classpath: where there is Java, these numbers are a lower bound.'
          })
        }
      }
    }
  ]
}
