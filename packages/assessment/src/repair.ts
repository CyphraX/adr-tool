/**
 * The Repairs of Assessment (docs/assessment-format.md, section 7): the item of a Trace to
 * something that is not there, taken out where it stands. A Repair never puts one in — where
 * something was renamed by hand, only a person knows the new name (ADR-0009) — and it writes
 * into a final Assessment too: a Trace that points nowhere is no record of anything.
 */
import { isSeq } from 'yaml'
import type { FileSystem, Plan, TextEdit } from '@adr-tool/kernel'
import { evidenceOf, outlineAssessment } from './document'
import { evidenceKey, type NewEvidence } from './evidence'
import type { AssessmentProblem } from './problems'
import { refuse } from './sentences'
import type { FileView } from './text'
import { planning } from './write'
import { pairOf, regionFor, removeBlockItem, removeFromList, type Region } from './yaml'

/** The evidence a Problem is about, as a Finding would be given it. */
function evidenceIn(problem: AssessmentProblem): NewEvidence | undefined {
  switch (problem.kind) {
    case 'violation-gone':
      return { kind: 'violation', violation: problem.violation }
    case 'metric-not-in-snapshot':
    case 'metric-not-measured':
      return { kind: 'metric', metric: problem.metric, subject: problem.subject }
    case 'finding-unknown-annotation':
      return { kind: 'annotation', id: problem.target }
    case 'finding-unknown-adr':
      return { kind: 'adr', id: problem.target }
    case 'finding-unknown-risk':
      return { kind: 'risk', id: problem.target }
    case 'finding-unknown-debt-item':
      return { kind: 'debt', id: problem.target }
    default:
      return undefined
  }
}

/** The block of a Finding, as the file has it now. */
function findingRegion(view: FileView, path: string, assessment: string, finding: string): Region {
  const place = outlineAssessment(assessment, path, view.text).entries.find(
    (one) => one.kind === 'finding' && one.id === finding
  )
  if (!place) return refuse({ code: 'problem-no-longer-there', values: {} })
  return place.region
}

/** The edits of a Repair in the file of its Problem; empty where the item is gone already. */
function repairEdits(view: FileView, problem: AssessmentProblem): TextEdit[] {
  const { path } = problem
  if (problem.kind === 'names-no-component') {
    if (view.unterminated) refuse({ code: 'file-needs-fixing', values: { path } })
    if (!view.frontmatter) return []
    const region = regionFor(view.text, view.frontmatter, view.eol, path)
    return removeFromList(region, problem.key, (item) => item === problem.component)
  }
  if (problem.kind === 'finding-unknown-scenario') {
    const region = findingRegion(view, path, problem.assessment, problem.finding)
    return removeFromList(region, 'scenarios', (item) => item === problem.scenario)
  }
  const evidence = evidenceIn(problem)
  if (!evidence || !('finding' in problem)) {
    return refuse({ code: 'has-no-repair', values: {} })
  }
  const region = findingRegion(view, path, problem.assessment, problem.finding)
  const list = pairOf(region.map, 'evidence')?.value
  if (!isSeq(list)) return []
  const wanted = evidenceKey(evidence)
  const index = list.items.findIndex((item) => {
    const read = evidenceOf(region, item)
    return !('detail' in read) && evidenceKey(read) === wanted
  })
  return index === -1 ? [] : removeBlockItem(region, 'evidence', index)
}

/**
 * Plan the Repair of a Problem (docs/assessment-format.md, section 7): the Component taken out
 * of `scope` or `components`, the Scenario out of a Finding's `scenarios`, the piece of evidence
 * out of its `evidence`, each where it stands. A Problem without a Repair is refused, and so is
 * one that is no longer there.
 */
export function planRepair(fs: FileSystem, problem: AssessmentProblem): Promise<Plan> {
  return planning(fs, async (pending) => {
    if (
      problem.kind !== 'names-no-component' &&
      problem.kind !== 'finding-unknown-scenario' &&
      evidenceIn(problem) === undefined
    ) {
      refuse({ code: 'has-no-repair', values: {} })
    }
    let changed = false
    await pending.write(problem.path, (view) => {
      const edits = repairEdits(view, problem)
      changed = edits.length > 0
      return edits
    })
    if (!changed) refuse({ code: 'problem-no-longer-there', values: {} })
    return {}
  })
}
