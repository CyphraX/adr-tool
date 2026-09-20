import type { FileSystem } from '@adr-tool/kernel'
import { readDeclaration, type DeclaredComponent } from './declaration'
import { draftComponents } from './draft'
import { assign, type OwnedSourceFile } from './ownership'
import { DECLARATION_PATH, type StructureProblem } from './problems'
import { sourceFilesAmong } from './source-files'

/**
 * The files a repository consists of: what git tracks, plus what it neither tracks nor ignores;
 * without git, what a walk finds that honours `.gitignore` (docs/structure-format.md, section
 * 2). Finding that out takes git or the disk, so it is the caller's part. Paths are relative
 * to the repository root, with forward slashes.
 */
export type RepositoryFiles = readonly string[]

export interface Structure {
  /** Whether the Components are declared in `.arch/components.yml` or are the Draft. */
  readonly origin: 'declared' | 'draft'
  readonly components: readonly DeclaredComponent[]
  /** Every Source File with the Component that owns it, in the order of their paths. */
  readonly sourceFiles: readonly OwnedSourceFile[]
  /** What is wrong with the declaration. Empty for a Draft, unless the declaration cannot be read. */
  readonly problems: readonly StructureProblem[]
  /** What the same checks find on the Draft: hints, not Problems — nothing was declared. */
  readonly hints: readonly StructureProblem[]
  /** Adopt is offered for a Draft, but not while a declaration is there that cannot be read. */
  readonly canAdopt: boolean
}

/** Read the Components of a repository and who owns which Source File. Never writes. */
export async function openStructure(fs: FileSystem, files: RepositoryFiles): Promise<Structure> {
  const sourceFiles = sourceFilesAmong(files)
  const declaration = readDeclaration(await fs.readText(DECLARATION_PATH))

  if (declaration.kind === 'declared') {
    const ownership = assign(declaration.components, sourceFiles)
    return {
      origin: 'declared',
      components: declaration.components,
      sourceFiles: ownership.sourceFiles,
      problems: [...declaration.problems, ...ownership.problems],
      hints: [],
      canAdopt: false
    }
  }

  const components = await draftComponents(fs, files, sourceFiles)
  const ownership = assign(components, sourceFiles)
  const unreadable = declaration.kind === 'unreadable'
  return {
    origin: 'draft',
    components,
    sourceFiles: ownership.sourceFiles,
    problems: unreadable ? [{ kind: 'unreadable-declaration', detail: declaration.detail }] : [],
    hints: ownership.problems,
    canAdopt: !unreadable && components.length > 0
  }
}
