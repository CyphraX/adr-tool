/**
 * Structure's Library inventory, as data for an agent (docs/mcp.md, "list_libraries";
 * docs/structure-format.md, section 3): the Libraries the manifests declare and the code
 * uses, per Component, with their versions and the licence an installed package declares. One
 * tool of its own, beside the tools of the Decision Logs: it analyses the code, which they never
 * do. It reads, and writes nothing; it looks nothing up outside the repository.
 */
import { analyseRepository } from '@adr-tool/cli/analysis'
import {
  everyComponent,
  librariesIn,
  libraryInventory,
  UNASSIGNED,
  type LibraryUser,
  type ScopedLibrary
} from '@adr-tool/structure/model'
import { repositoryFiles } from './files'
import { Refusal, type Tool } from './protocol'

/** How many files of one Component a Library lists at most; the count says how many there are. */
const FILES_LISTED = 50

function userData(user: LibraryUser): Record<string, unknown> {
  return {
    component: user.component ?? UNASSIGNED,
    files: user.files.slice(0, FILES_LISTED),
    fileCount: user.files.length,
    testOnly: user.testOnly,
    undeclared: user.undeclared.slice(0, FILES_LISTED),
    undeclaredCount: user.undeclared.length
  }
}

function libraryData(scoped: ScopedLibrary): Record<string, unknown> {
  const { library } = scoped
  return {
    name: library.name,
    ecosystem: library.ecosystem,
    status: scoped.status,
    versions: scoped.versions,
    imports: library.imports,
    ...(library.mapping !== undefined && { mapping: library.mapping }),
    declared: scoped.declared.map((declaration) => ({
      manifest: declaration.manifest,
      ...(declaration.line !== undefined && { line: declaration.line }),
      ...(declaration.version !== undefined && { version: declaration.version }),
      ...(declaration.group !== undefined && { group: declaration.group }),
      ...(declaration.component !== undefined && { component: declaration.component })
    })),
    usedBy: scoped.usedBy.map(userData),
    ...(library.installed !== undefined && { installed: library.installed }),
    licence: library.licence
  }
}

export function libraryTools(options: { readonly root: string }): Tool[] {
  const fs = repositoryFiles(options.root)
  return [
    {
      name: 'list_libraries',
      title: 'List the Libraries',
      description:
        'Structure\'s Library inventory, of the whole repository or of one Component and those inside it, as data: each Library the manifests declare (package.json, pom.xml, build.gradle, requirements and pyproject files, go.mod) or the code uses, with its status — "used", "unused" (declared, used by no file of the scope) or "undeclared" (used by a file for which no manifest declares it) —, the versions declared, the names the code imports it by and how they were told, the Components that use it and their files, and the licence an installed package declares, or why it cannot be told. Analyses the code, which takes a moment on a large repository. Nothing is looked up outside the repository.',
      inputSchema: {
        type: 'object',
        properties: {
          component: {
            type: 'string',
            description:
              'The ID of a Component, from list_components. Left out: the whole repository.'
          }
        },
        additionalProperties: false
      },
      annotations: {
        title: 'List the Libraries',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      run: async (input) => {
        const component = typeof input.component === 'string' ? input.component : undefined
        const { files, structure, dependencies } = await analyseRepository(options.root, fs)
        const ids = everyComponent(structure.components).map((one) => one.id)
        if (component !== undefined && !ids.includes(component)) {
          throw new Refusal(
            ids.length === 0
              ? `There is no Component ${component}: the repository has none.`
              : `There is no Component ${component}. list_components names the Components there are.`
          )
        }
        const inventory = await libraryInventory(fs, files, structure, dependencies)
        const libraries = librariesIn(inventory, component)
        const count = (status: ScopedLibrary['status']): number =>
          libraries.filter((library) => library.status === status).length
        const guessed = libraries.some(
          ({ library }) => library.mapping === 'normalised' || library.mapping === 'group'
        )
        const java = libraries.some(({ library }) => library.ecosystem === 'maven')
        const notes = [
          ...(guessed
            ? [
                'A Library whose mapping is "normalised" or "group" has its import names guessed: from its name, or the group ID of a Maven artefact. One that shows no use may be used under another name.'
              ]
            : []),
          ...(java
            ? [
                "The licence of a Java Library cannot be told: Maven's local repository lies outside the repository, and is not read."
              ]
            : [])
        ]
        return {
          origin: structure.origin,
          ...(component !== undefined && { component }),
          counts: {
            libraries: libraries.length,
            used: count('used'),
            unused: count('unused'),
            undeclared: count('undeclared'),
            licenceUnknown: libraries.filter(({ library }) => library.licence.kind === 'unknown')
              .length
          },
          libraries: libraries.map(libraryData),
          ...(notes.length > 0 && { notes })
        }
      }
    }
  ]
}
