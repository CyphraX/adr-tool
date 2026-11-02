/**
 * The metrics of section 5 the slow way, straight from their definitions, one Component and
 * one Dependency at a time: what `metricsOf` is checked against. Never used by the app.
 */
import type { DeclaredComponent } from '../src/declaration'
import type { Dependency } from '../src/dependencies'
import type { Metrics } from '../src/metrics'
import type { Structure } from '../src/structure'

export function metricsByDefinition(
  structure: Pick<Structure, 'components' | 'sourceFiles'>,
  dependencies: readonly Dependency[],
  lineCounts: ReadonlyMap<string, number>,
  tests: boolean
): Map<string, Metrics> {
  const counted = structure.sourceFiles.filter((file) => tests || !file.test)
  const among = new Set(counted.map((file) => file.path))
  const shown = dependencies.filter(({ from, to }) => among.has(from) && among.has(to))

  const insideOf = (component: DeclaredComponent): Set<string> =>
    new Set([
      ...counted.filter((file) => file.component === component.id).map((file) => file.path),
      ...component.children.flatMap((child) => [...insideOf(child)])
    ])

  const metrics = new Map<string, Metrics>()
  const visit = (component: DeclaredComponent, siblings: readonly DeclaredComponent[]): void => {
    const inside = insideOf(component)
    if (inside.size > 0) {
      const files = [...inside]
      const efferent = files.filter((file) =>
        shown.some(({ from, to }) => from === file && !inside.has(to))
      ).length
      const afferent = [...among].filter(
        (file) => !inside.has(file) && shown.some(({ from, to }) => from === file && inside.has(to))
      ).length
      const others = siblings.filter((sibling) => sibling !== component)
      const fanOut = others.filter((other) => {
        const there = insideOf(other)
        return shown.some(({ from, to }) => inside.has(from) && there.has(to))
      }).length
      const fanIn = others.filter((other) => {
        const there = insideOf(other)
        return shown.some(({ from, to }) => there.has(from) && inside.has(to))
      }).length
      const internal = shown.filter(({ from, to }) => inside.has(from) && inside.has(to)).length
      const touching = shown.filter(({ from, to }) => inside.has(from) || inside.has(to)).length
      metrics.set(component.id, {
        files: inside.size,
        lines: files.reduce((sum, file) => sum + (lineCounts.get(file) ?? 0), 0),
        efferent,
        afferent,
        instability: efferent + afferent === 0 ? undefined : efferent / (efferent + afferent),
        fanOut,
        fanIn,
        cohesion: (internal + 1) / inside.size,
        internalShare: touching === 0 ? undefined : internal / touching
      })
    }
    for (const child of component.children) visit(child, component.children)
  }
  for (const component of structure.components) visit(component, structure.components)
  return metrics
}
