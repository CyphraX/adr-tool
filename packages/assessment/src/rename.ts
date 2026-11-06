/**
 * Assessment's half of a Rename of a Component (docs/assessment-format.md, section 6): every
 * item of `scope` and `components`, every `component`, `from`, `to` and member of `cycle` of a
 * piece of evidence, and every key of a Snapshot's `components` that names the old ID or one
 * below it names the new one, rewritten where it stands, its quoting kept (ADR-0002). What is
 * handed out has been checked to read back as the same files under the new IDs. Text is not
 * searched: what the author writes about a Component is the author's.
 */
import { isAlias, isMap, isScalar, isSeq, type Scalar } from 'yaml'
import { applyEdits, type FileSystem, type Plan, type TextEdit } from '@adr-tool/kernel'
import { isSegment } from '@adr-tool/structure/model'
import { outlineAssessment, readAssessment } from './document'
import type { Assessment, Evidence, NamedViolation } from './model'
import { openAssessments } from './read'
import { readRegisterEntry } from './register'
import { refuse } from './sentences'
import { readSnapshot, snapshotPathOf } from './snapshot'
import { outlineOf, viewFile, type Fence } from './text'
import { planning } from './write'
import { pairOf, parseRegion, rewriteScalar, scalarText, type Region } from './yaml'

/** Whether a text is a Component ID: segments joined by `/` — a path to a Source File is none. */
const isComponentId = (text: string): boolean => text.split('/').every(isSegment)

/** The texts of the YAML a file has: its frontmatter, or all of it while it is never closed, and its YAML blocks. */
function yamlOf(text: string): string[] {
  const view = viewFile(text)
  if (view.unterminated) return [text]
  const front = view.frontmatter ? [text.slice(view.frontmatter.start, view.frontmatter.end)] : []
  const blocks = outlineOf(text, view.bodyStart)
    .filter((item): item is Fence => item.kind === 'fence')
    .map((fence) => text.slice(fence.content.start, fence.content.end))
  return [...front, ...blocks]
}

/** Plan the rewrite of the module's files for the Rename of the Component `from` to `to`. Never writes. */
export function planRenameInAssessments(fs: FileSystem, from: string, to: string): Promise<Plan> {
  const renamed = (id: string): string | undefined =>
    !isComponentId(id)
      ? undefined
      : id === from
        ? to
        : id.startsWith(`${from}/`)
          ? to + id.slice(from.length)
          : undefined
  const named = (id: string): string => renamed(id) ?? id
  // The old ID, or one below it, standing on its own in a text.
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mention = new RegExp(`(?<![\\p{L}\\p{N}._/-])${escaped}(?![\\p{L}\\p{N}._-])`, 'u')
  const cannot = (path: string): never =>
    refuse({ code: 'cannot-rename-in-assessments', values: { path, id: from } })

  /** The edit that renames a scalar where it stands; none where it names something else. */
  const renaming = (region: Region, node: unknown): TextEdit[] => {
    if (isAlias(node)) return cannot(region.path)
    if (!isScalar(node)) return []
    const value = scalarText(node)
    const to = value === undefined ? undefined : renamed(value)
    if (to === undefined) return []
    return [rewriteScalar(region, node as Scalar, to) ?? cannot(region.path)]
  }
  /** The edits for a key whose value is an ID, or a list of them. */
  const renamingList = (region: Region, node: unknown): TextEdit[] => {
    if (isAlias(node)) return cannot(region.path)
    if (isSeq(node)) return node.items.flatMap((item) => renaming(region, item))
    return renaming(region, node)
  }

  return planning(fs, async (pending) => {
    if (from === '' || from === to) return {}
    const reading = await openAssessments(fs)

    for (const assessment of reading.assessments) {
      const text = (await fs.readText(assessment.path)) ?? ''
      const edits = assessmentEdits(assessment, text)
      if (edits.length > 0) await pending.write(assessment.path, () => edits)
      await renameSnapshot(assessment)
    }
    for (const entry of [...reading.risks, ...reading.debtItems]) {
      const text = (await fs.readText(entry.path)) ?? ''
      if (!entry.writable) {
        if (yamlOf(text).some((yaml) => mention.test(yaml))) cannot(entry.path)
        continue
      }
      const view = viewFile(text)
      if (!view.frontmatter) continue
      const region = parseRegion(text, view.frontmatter, view.eol, entry.path)
      const edits = renamingList(region, pairOf(region.map, 'components')?.value)
      if (edits.length === 0) continue
      const after = readRegisterEntry(entry.register, entry.id, entry.path, applyEdits(text, edits))
      if (JSON.stringify(after.entry.components) !== JSON.stringify(entry.components.map(named))) {
        cannot(entry.path)
      }
      await pending.write(entry.path, () => edits)
    }
    return {}

    /** The edits in an Assessment's file: its scope, and the evidence of its Findings. */
    function assessmentEdits(assessment: Assessment, text: string): TextEdit[] {
      const { path } = assessment
      if (!assessment.writable) {
        if (yamlOf(text).some((yaml) => mention.test(yaml))) cannot(path)
        return []
      }
      const outline = outlineAssessment(assessment.id, path, text)
      // A block that cannot be read as an entry may name the Component all the same.
      const entryLines = new Set(outline.entries.map((place) => place.fence.open.number))
      const unread = outlineOf(text, outline.view.bodyStart).filter(
        (item): item is Fence =>
          item.kind === 'fence' &&
          !entryLines.has(item.open.number) &&
          outline.problems.some((problem) => 'line' in problem && problem.line === item.open.number)
      )
      for (const fence of unread) {
        if (mention.test(text.slice(fence.content.start, fence.content.end))) cannot(path)
      }
      // A comment that is never closed hides entries the suite cannot read.
      const hidden = outline.problems.some(
        (problem) =>
          problem.kind === 'unreadable-entry' &&
          typeof problem.detail !== 'string' &&
          problem.detail.code === 'in-comment-never-closed'
      )
      if (hidden && mention.test(text.slice(outline.view.bodyStart))) cannot(path)

      const edits: TextEdit[] = []
      const view = outline.view
      if (view.frontmatter) {
        const region = parseRegion(text, view.frontmatter, view.eol, path)
        edits.push(...renamingList(region, pairOf(region.map, 'scope')?.value))
      }
      for (const place of outline.entries) {
        if (place.kind !== 'finding') continue
        const list = pairOf(place.region.map, 'evidence')?.value
        if (isAlias(list)) cannot(path)
        if (!isSeq(list)) continue
        for (const item of list.items) {
          if (isAlias(item)) cannot(path)
          if (!isMap(item)) continue
          const violation = pairOf(item, 'violation') !== undefined
          if (!violation && pairOf(item, 'metric') === undefined) continue
          for (const key of violation ? ['component', 'from', 'to'] : ['component']) {
            edits.push(...renaming(place.region, pairOf(item, key)?.value))
          }
          if (violation) {
            edits.push(...renamingList(place.region, pairOf(item, 'cycle')?.value))
          }
        }
      }
      if (edits.length === 0) return edits
      const after = readAssessment(assessment.id, path, applyEdits(text, edits))
      if (shapeOf(after.assessment) !== shapeOf(renamedAssessment(assessment))) cannot(path)
      return edits
    }

    /** What an Assessment reads as under the new IDs. */
    function renamedAssessment(assessment: Assessment): Assessment {
      return {
        ...assessment,
        // The Snapshot is read beside the file, not from it.
        snapshot: undefined,
        ...(assessment.scope && { scope: assessment.scope.map(named) }),
        findings: assessment.findings.map((finding) => ({
          ...finding,
          evidence: finding.evidence.map(renamedEvidence)
        }))
      }
    }

    function renamedEvidence(evidence: Evidence): Evidence {
      if (evidence.kind === 'metric') {
        const subject = evidence.subject
        return 'component' in subject
          ? { ...evidence, subject: { component: named(subject.component) } }
          : evidence
      }
      if (evidence.kind !== 'violation') return evidence
      return { ...evidence, violation: renamedViolation(evidence.violation) }
    }

    function renamedViolation(violation: NamedViolation): NamedViolation {
      switch (violation.kind) {
        case 'dependency':
          return { ...violation, from: named(violation.from), to: named(violation.to) }
        case 'cycle':
          return { ...violation, cycle: violation.cycle.map(named) }
        case 'component':
        case 'library':
          return { ...violation, component: named(violation.component) }
        case 'inside':
          return violation
      }
    }

    /** The keys of a Snapshot's `components`, renamed where they stand. */
    async function renameSnapshot(assessment: Assessment): Promise<void> {
      const path = snapshotPathOf(assessment.path)
      const text = await fs.readText(path)
      if (text === undefined) return
      const read = readSnapshot(path, assessment.id, text)
      if (!read.snapshot) {
        if (mention.test(text)) cannot(path)
        return
      }
      const region = parseRegion(text, { start: 0, end: text.length }, viewFile(text).eol, path)
      const components = pairOf(region.map, 'components')?.value
      if (!isMap(components)) return
      const edits = components.items.flatMap((pair) => renaming(region, pair.key))
      if (edits.length === 0) return
      const after = readSnapshot(path, assessment.id, applyEdits(text, edits)).snapshot
      const expected = Object.fromEntries(
        Object.entries(read.snapshot.components).map(([id, values]) => [named(id), values])
      )
      if (!after || JSON.stringify(after.components) !== JSON.stringify(expected)) cannot(path)
      await pending.write(path, () => edits)
    }
  })
}

/** What an Assessment reads as, to compare: everything but the lines, which a rename may move. */
const shapeOf = (assessment: Assessment): string =>
  JSON.stringify(assessment, (key, value: unknown) => (key === 'line' ? undefined : value))
