import { structuredPatch } from 'diff'
import type { FileChange } from '@adr-tool/core'

export interface DiffLine {
  readonly kind: 'added' | 'removed' | 'context' | 'gap'
  readonly text: string
}

/**
 * The lines of a file change as a person reviews them: what goes, what comes, and two
 * lines of surroundings. Carriage returns are left out of the display only.
 */
export function diffLines(change: FileChange): DiffLine[] {
  const patch = structuredPatch(change.path, change.path, change.before, change.after, '', '', {
    context: 2
  })
  const result: DiffLine[] = []
  patch.hunks.forEach((hunk, position) => {
    if (position > 0) result.push({ kind: 'gap', text: '' })
    for (const line of hunk.lines) {
      // "\ No newline at end of file" is about bytes, not about the change being reviewed.
      if (line.startsWith('\\')) continue
      const kind = line[0] === '+' ? 'added' : line[0] === '-' ? 'removed' : 'context'
      result.push({ kind, text: line.slice(1).replace(/\r$/, '') })
    }
  })
  return result
}
