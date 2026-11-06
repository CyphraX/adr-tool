import { describe, expect, it } from 'vitest'
import {
  searchComponents,
  searchLibraries,
  searchSourceFiles
} from '../src/renderer/src/lib/search'

// docs/plan-vision.md, part 2: the search finds Components and Source Files beside ADRs; part
// 15: and Libraries.

const COMPONENTS = [
  { id: 'kernel', name: 'kernel' },
  { id: 'core', name: 'Decisions core' },
  { id: 'core/metadata', name: 'metadata' },
  { id: 'core/kernel-bridge', name: 'Bridge' },
  { id: 'structure', name: 'Structure core' },
  { id: 'app', name: 'Desktop app' }
]

const FILES = [
  { path: 'packages/app/src/main/index.ts', component: 'app' },
  { path: 'packages/core/src/kernel.ts', component: 'core' },
  { path: 'packages/kernel/src/change/change-set.ts', component: 'kernel' },
  { path: 'packages/kernel/src/index.ts', component: 'kernel' },
  { path: 'packages/kernel/test/kernel.test.ts', component: 'kernel' },
  { path: 'scripts/kernelize.mjs' }
]

describe('the search over Components', () => {
  it('finds a Component by its ID and by its name, the one that is the word first', () => {
    expect(searchComponents(COMPONENTS, 'kernel').map((hit) => hit.id)).toEqual([
      'kernel',
      'core/kernel-bridge'
    ])
    expect(searchComponents(COMPONENTS, 'Decisions').map((hit) => hit.id)).toEqual(['core'])
    expect(searchComponents(COMPONENTS, 'meta').map((hit) => hit.id)).toEqual(['core/metadata'])
  })

  it('wants every word, in the ID or the name, and ignores case and accents', () => {
    expect(searchComponents(COMPONENTS, 'core struct').map((hit) => hit.id)).toEqual(['structure'])
    expect(searchComponents(COMPONENTS, 'DÉSKTOP').map((hit) => hit.id)).toEqual(['app'])
    expect(searchComponents(COMPONENTS, 'core nothing')).toEqual([])
    expect(searchComponents(COMPONENTS, '   ')).toEqual([])
  })

  it('keeps the order of the declaration among Components that match equally well', () => {
    expect(searchComponents(COMPONENTS, 'core').map((hit) => hit.id)).toEqual([
      'core',
      'core/metadata',
      'core/kernel-bridge',
      'structure'
    ])
  })
})

describe('the search over Source Files', () => {
  it('finds Source Files by their path, those whose name holds the word first', () => {
    expect(searchSourceFiles(FILES, 'kernel').map((hit) => hit.path)).toEqual([
      'packages/core/src/kernel.ts',
      'packages/kernel/test/kernel.test.ts',
      'scripts/kernelize.mjs',
      'packages/kernel/src/index.ts',
      'packages/kernel/src/change/change-set.ts'
    ])
  })

  it('wants every word somewhere in the path, and says which Component owns the file', () => {
    expect(searchSourceFiles(FILES, 'kernel change')).toEqual([
      {
        path: 'packages/kernel/src/change/change-set.ts',
        component: 'kernel',
        score: 30 + 60
      }
    ])
    expect(searchSourceFiles(FILES, 'kernelize')).toEqual([
      { path: 'scripts/kernelize.mjs', score: 80 }
    ])
    expect(searchSourceFiles(FILES, 'main/index').map((hit) => hit.path)).toEqual([
      'packages/app/src/main/index.ts'
    ])
    expect(searchSourceFiles(FILES, 'nowhere')).toEqual([])
  })
})

const LIBRARIES = [
  { ecosystem: 'npm', name: '@codemirror/state', imports: ['@codemirror/state'] },
  { ecosystem: 'npm', name: 'electron', imports: ['electron'] },
  { ecosystem: 'npm', name: 'electron-vite', imports: ['electron-vite'] },
  { ecosystem: 'maven', name: 'com.google.guava:guava', imports: ['com.google.common'] },
  { ecosystem: 'python', name: 'PyYAML', imports: ['yaml', '_yaml'] }
] as const

describe('the search over Libraries', () => {
  it('finds a Library by its name, a part of it, or a name the code imports it by', () => {
    const found = (query: string) => searchLibraries(LIBRARIES, query).map((hit) => hit.name)
    expect(found('electron')).toEqual(['electron', 'electron-vite'])
    expect(found('codemirror')).toEqual(['@codemirror/state'])
    expect(found('guava')).toEqual(['com.google.guava:guava'])
    expect(found('common')).toEqual(['com.google.guava:guava'])
    expect(found('yaml')).toEqual(['PyYAML'])
    expect(found('vite electron')).toEqual(['electron-vite'])
    expect(found('gradle')).toEqual([])
    expect(searchLibraries(LIBRARIES, 'pyyaml')[0]).toMatchObject({ ecosystem: 'python' })
  })
})
