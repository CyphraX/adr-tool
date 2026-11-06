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

/** The languages whose Dependencies are a lower bound, each for what its reader cannot see. */
const LOWER_BOUND = ['java', 'python', 'go'] as const
const UNSEEN: Record<(typeof LOWER_BOUND)[number], string> = {
  java: 'Java is read without a classpath',
  python: "Python's imports made by calling something are not seen",
  go: "Go's method calls through values and build constraints are not followed"
}

/**
 * What a Dependency that is not seen does to each metric: it counts towards fan-in, fan-out
 * and propagation cost, which are lower bounds; instability and distance divide by it, and can
 * be off either way. What is read from a file alone — complexity, LCOM4, abstractness — is not
 * touched.
 */
function lowerBoundNote(languages: readonly (typeof LOWER_BOUND)[number][]): string {
  return `${languages.map((language) => UNSEEN[language]).join('; ')}. Dependencies may be missing there: afferent and efferent coupling, fan-in, fan-out and propagation cost are lower bounds, and instability and distance can be off either way. Complexity, LCOM4 and abstractness are read from each file alone and are not affected.`
}

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
        'Structure\'s metrics of a Component, or of the whole repository when "component" is left out, as data: its size, coupling, instability, abstractness and distance from the main sequence; the propagation cost of the level below it and the A, I and D of each node there; its most complex functions by cyclomatic complexity, each with its file and line; and, as splitClasses, only its classes whose methods fall into more than one group by LCOM4. Analyses the code, which takes a moment on a large repository. The notes say which numbers are lower bounds, for Java, Python and Go.',
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
        const split = classes.filter((one) => one.lcom4 !== undefined && one.lcom4 > 1)
        const own = component === undefined ? undefined : metrics.get(component)
        const inside = (file: { readonly component?: string; readonly test: boolean }): boolean =>
          (tests || !file.test) &&
          (component === undefined ||
            file.component === component ||
            file.component?.startsWith(`${component}/`) === true)
        const languages = LOWER_BOUND.filter((language) =>
          structure.sourceFiles.some((file) => file.language === language && inside(file))
        )
        const unmeasured = dependencies.notMeasured.filter(({ file }) =>
          structure.sourceFiles.some((one) => one.path === file && inside(one))
        )
        return {
          origin: structure.origin,
          ...(component !== undefined && { component }),
          tests,
          ...(own !== undefined && { metrics: metricsData(own) }),
          level: {
            below: component ?? null,
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
          splitClasses: split.slice(0, CLASSES_LISTED),
          splitClassCount: split.length,
          classCount: classes.length,
          notes: [
            ...(languages.length > 0 ? [lowerBoundNote(languages)] : []),
            ...(unmeasured.length > 0
              ? [
                  `Not measured inside, and counted by no metric of functions, classes or declarations: ${unmeasured.map(({ file, message }) => `${file} (${message})`).join(', ')}.`
                ]
              : [])
          ]
        }
      }
    }
  ]
}
