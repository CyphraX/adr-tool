/**
 * The Libraries the `pom.xml` files of a repository declare (docs/structure-format.md,
 * section 3, "Manifests"): the `<dependencies>` of each project, named `groupId:artifactId`,
 * with the scope as the group. A version is read where the pom writes it, from its
 * `<dependencyManagement>`, or from those of its parents, and a `${property}` in it from the
 * `<properties>` of the pom and its parents — parents inside the repository only. Maven never
 * runs, and neither a local repository nor the network is asked: what lies outside the
 * repository is not read. A module of the repository is no Library.
 *
 * The XML is read by hand, by `indexOf` and one pass over each tag, so that the time is linear
 * in the length of the file whatever it holds; a property names others ten levels deep at most,
 * each worked out once per pom, and a value longer than a kibibyte is left as written.
 */
import { withinRepository } from '../paths'
import type { ManifestLibrary } from '../manifests'

/** An element of an XML document, as far as a pom needs it. */
export interface XmlElement {
  readonly name: string
  readonly children: XmlElement[]
  /** The text directly inside it, entities decoded, trimmed. */
  text: string
  /** The line its start tag is on, from 1. */
  readonly line: number
  /** Written `<name/>`: it has no content. */
  readonly empty: boolean
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

/** The largest code point there is; a reference beyond it names no character and stays as written. */
const LAST_CODE_POINT = 0x10ffff

const decode = (text: string): string =>
  text.replace(/&(#x[0-9A-Fa-f]{1,6}|#[0-9]{1,7}|lt|gt|amp|quot|apos);/g, (whole, name: string) => {
    if (!name.startsWith('#')) return ENTITIES[name] ?? whole
    const code = name.startsWith('#x')
      ? Number.parseInt(name.slice(2), 16)
      : Number.parseInt(name.slice(1), 10)
    return code <= LAST_CODE_POINT ? String.fromCodePoint(code) : whole
  })

/**
 * The root element of an XML document, read tolerantly: comments, processing instructions and
 * a doctype are passed over, CDATA is text, a tag that is not closed is closed by the end of
 * its parent. `undefined` where there is no element. A name keeps its local part: `pom:version`
 * is `version`.
 */
export function parseXml(text: string): XmlElement | undefined {
  const root: XmlElement = { name: '', children: [], text: '', line: 0, empty: false }
  const stack: XmlElement[] = [root]
  const texts: string[][] = [[]]
  /** How many elements of each name are open: a closing tag that matches none costs nothing. */
  const open = new Map<string, number>()
  let line = 1
  /** The next line break not counted yet; -1 when there is none. */
  let next = text.indexOf('\n')
  /** The line of an offset; offsets only grow, so the count goes on from the last one. */
  const lineAt = (offset: number): number => {
    while (next !== -1 && next < offset) {
      line++
      next = text.indexOf('\n', next + 1)
    }
    return line
  }
  const close = (): XmlElement => {
    const element = stack.pop()!
    element.text = decode(texts.pop()!.join('')).trim()
    open.set(element.name, open.get(element.name)! - 1)
    return element
  }

  let at = 0
  while (at < text.length) {
    const lt = text.indexOf('<', at)
    if (lt === -1) {
      texts.at(-1)!.push(text.slice(at))
      break
    }
    texts.at(-1)!.push(text.slice(at, lt))
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4)
      if (end === -1) break
      at = end + 3
    } else if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9)
      // CDATA is taken as it is: it is not decoded, so it goes past `decode` unharmed.
      texts
        .at(-1)!
        .push((end === -1 ? text.slice(lt + 9) : text.slice(lt + 9, end)).replaceAll('&', '&amp;'))
      if (end === -1) break
      at = end + 3
    } else if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt + 2)
      if (end === -1) break
      at = end + 2
    } else if (text.startsWith('<!', lt)) {
      const end = text.indexOf('>', lt + 2)
      if (end === -1) break
      at = end + 1
    } else if (text.startsWith('</', lt)) {
      const end = text.indexOf('>', lt + 2)
      const name = localName(text.slice(lt + 2, end === -1 ? undefined : end).trim())
      // Close up to the element of that name; a closing tag that matches none is passed over.
      // Each element is closed once, so the closing tags of a file take time linear in it.
      if ((open.get(name) ?? 0) > 0) while (close().name !== name);
      if (end === -1) break
      at = end + 1
    } else {
      // The end of the tag: the first `>` outside of a quoted attribute value.
      let end = lt + 1
      let quote: string | undefined
      for (; end < text.length; end++) {
        const char = text[end]!
        if (quote !== undefined) {
          if (char === quote) quote = undefined
        } else if (char === '"' || char === "'") quote = char
        else if (char === '>') break
      }
      if (end >= text.length) break
      const inside = text.slice(lt + 1, end)
      const empty = inside.endsWith('/')
      let nameEnd = 0
      while (nameEnd < inside.length && !/[\s/]/.test(inside[nameEnd]!)) nameEnd++
      const element: XmlElement = {
        name: localName(inside.slice(0, nameEnd)),
        children: [],
        text: '',
        line: lineAt(lt),
        empty
      }
      stack.at(-1)!.children.push(element)
      if (!empty) {
        stack.push(element)
        texts.push([])
        open.set(element.name, (open.get(element.name) ?? 0) + 1)
      }
      at = end + 1
    }
  }
  while (stack.length > 1) close()
  return root.children[0]
}

const localName = (name: string): string => name.slice(name.indexOf(':') + 1)

/** The first child of that name. */
export const childOf = (element: XmlElement | undefined, name: string): XmlElement | undefined =>
  element?.children.find((child) => child.name === name)

/** Every child of that name. */
const childrenOf = (element: XmlElement | undefined, name: string): XmlElement[] =>
  element?.children.filter((child) => child.name === name) ?? []

/** The text of the first child of that name, `undefined` where there is none or it is empty. */
const textOf = (element: XmlElement | undefined, name: string): string | undefined => {
  const text = childOf(element, name)?.text
  return text === undefined || text === '' ? undefined : text
}

/** A pom as far as its Libraries need it. */
interface Pom {
  readonly path: string
  readonly project: XmlElement
  readonly groupId: string | undefined
  readonly artifactId: string | undefined
  readonly version: string | undefined
  readonly properties: ReadonlyMap<string, string>
  /** The parent's coordinates as the pom names them, and where it lies, if in the repository. */
  readonly parent:
    | {
        readonly groupId?: string
        readonly artifactId?: string
        readonly version?: string
        readonly path?: string
      }
    | undefined
}

/** The parts of a pom its Libraries are read from; `undefined` where it is no project. */
function pomOf(path: string, text: string, known: ReadonlySet<string>): Pom | undefined {
  const project = parseXml(text)
  if (project?.name !== 'project') return undefined
  const parentElement = childOf(project, 'parent')
  const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  let parent: Pom['parent']
  if (parentElement) {
    const relative = childOf(parentElement, 'relativePath')
    // An empty `<relativePath/>` says the parent is looked up in a repository of artefacts.
    const written = relative === undefined ? '../pom.xml' : relative.text
    const resolved = written === '' ? undefined : withinRepository(directory, written)
    const pom =
      resolved === undefined
        ? undefined
        : known.has(resolved)
          ? resolved
          : known.has(resolved === '' ? 'pom.xml' : `${resolved}/pom.xml`)
            ? resolved === ''
              ? 'pom.xml'
              : `${resolved}/pom.xml`
            : undefined
    parent = {
      ...optional('groupId', textOf(parentElement, 'groupId')),
      ...optional('artifactId', textOf(parentElement, 'artifactId')),
      ...optional('version', textOf(parentElement, 'version')),
      ...optional('path', pom)
    }
  }
  const properties = new Map<string, string>()
  for (const property of childOf(project, 'properties')?.children ?? []) {
    properties.set(property.name, property.text)
  }
  return {
    path,
    project,
    groupId: textOf(project, 'groupId') ?? parent?.groupId,
    artifactId: textOf(project, 'artifactId'),
    version: textOf(project, 'version') ?? parent?.version,
    properties,
    parent
  }
}

const optional = <K extends string>(key: K, value: string | undefined): { [P in K]?: string } =>
  (value === undefined ? {} : { [key]: value }) as { [P in K]?: string }

/** How deep a property may name another one before it is left as written. */
const DEPTH = 10
/** The longest value a property is worked out to; a longer one is left as written. */
const LONGEST = 1024

/**
 * The Libraries of every `pom.xml` among `poms` (paths with their texts). A dependency on a
 * project of the repository — its `groupId:artifactId` is one of a pom here — is no Library.
 * A pom that cannot be read names nothing and is told to `notRead`; the others are read all
 * the same.
 */
export function inPoms(
  poms: ReadonlyMap<string, string>,
  notRead: (path: string, error: unknown) => void = () => {}
): ManifestLibrary[] {
  const known = new Set(poms.keys())
  const read = new Map<string, Pom>()
  for (const [path, text] of poms) {
    try {
      const pom = pomOf(path, text, known)
      if (pom) read.set(path, pom)
    } catch (error) {
      notRead(path, error)
    }
  }
  const local = new Set(
    [...read.values()].flatMap((pom) =>
      pom.groupId !== undefined && pom.artifactId !== undefined
        ? [`${pom.groupId}:${pom.artifactId}`]
        : []
    )
  )
  /** The pom and its parents inside the repository, the pom first; a loop ends where it closes. */
  const chainOf = (pom: Pom): Pom[] => {
    const chain = new Set<Pom>()
    for (let at: Pom | undefined = pom; at && !chain.has(at);) {
      chain.add(at)
      const parent: Pom | undefined =
        at.parent?.path === undefined ? undefined : read.get(at.parent.path)
      // The parent the pom names is the one that lies there, or it is not in the repository.
      const same: boolean =
        parent !== undefined &&
        (at.parent!.artifactId === undefined || parent.artifactId === at.parent!.artifactId) &&
        (at.parent!.groupId === undefined || parent.groupId === at.parent!.groupId)
      at = same ? parent : undefined
    }
    return [...chain]
  }

  const found: ManifestLibrary[] = []
  for (const pom of read.values()) {
    try {
      found.push(...librariesOf(pom, chainOf(pom), local))
    } catch (error) {
      notRead(pom.path, error)
    }
  }
  return found
}

/** The Libraries one pom declares, with the pom and its parents in `chain`, the pom first. */
function librariesOf(
  pom: Pom,
  chain: readonly Pom[],
  local: ReadonlySet<string>
): ManifestLibrary[] {
  // Each property is worked out once, and one that is being worked out is left as written where
  // it names itself again: a pom of a few hundred bytes cannot make a value of millions.
  const worked = new Map<string, string | undefined>()
  const working = new Set<string>()
  const value = (name: string): string | undefined => {
    if (worked.has(name)) return worked.get(name)
    if (working.has(name) || working.size >= DEPTH) return undefined
    working.add(name)
    const result = valueOf(name)
    working.delete(name)
    const kept = result !== undefined && result.length > LONGEST ? undefined : result
    worked.set(name, kept)
    return kept
  }
  const valueOf = (name: string): string | undefined => {
    for (const at of chain) {
      const property = at.properties.get(name)
      if (property !== undefined) return interpolate(property)
    }
    switch (name) {
      case 'project.version':
      case 'pom.version':
      case 'version':
        return pom.version === undefined ? undefined : interpolate(pom.version)
      case 'project.groupId':
      case 'pom.groupId':
      case 'groupId':
        return pom.groupId
      case 'project.artifactId':
      case 'pom.artifactId':
      case 'artifactId':
        return pom.artifactId
      case 'project.parent.version':
      case 'parent.version':
        return pom.parent?.version
      case 'project.parent.groupId':
      case 'parent.groupId':
        return pom.parent?.groupId
    }
    return undefined
  }
  /**
   * `${name}` replaced by its value where it is known, by `indexOf`; else left as written — and
   * so is the whole, where it would grow by more than a kibibyte.
   */
  const interpolate = (written: string): string => {
    let result = ''
    let at = 0
    for (let start = written.indexOf('${'); start !== -1; start = written.indexOf('${', at)) {
      const end = written.indexOf('}', start + 2)
      if (end === -1) break
      const known = value(written.slice(start + 2, end).trim())
      result += written.slice(at, start) + (known ?? written.slice(start, end + 1))
      if (result.length > written.length + LONGEST) return written
      at = end + 1
    }
    return result + written.slice(at)
  }
  const coordinates = (dependency: XmlElement): string | undefined => {
    const groupId = textOf(dependency, 'groupId')
    const artifactId = textOf(dependency, 'artifactId')
    return groupId === undefined || artifactId === undefined
      ? undefined
      : `${interpolate(groupId)}:${interpolate(artifactId)}`
  }
  // What `<dependencyManagement>` of the pom and its parents pin, the nearest first.
  const managed = new Map<string, string>()
  for (const at of chain) {
    const list = childOf(childOf(at.project, 'dependencyManagement'), 'dependencies')
    for (const dependency of childrenOf(list, 'dependency')) {
      const name = coordinates(dependency)
      const version = textOf(dependency, 'version')
      if (name !== undefined && version !== undefined && !managed.has(name)) {
        managed.set(name, interpolate(version))
      }
    }
  }
  const found: ManifestLibrary[] = []
  for (const dependency of childrenOf(childOf(pom.project, 'dependencies'), 'dependency')) {
    const name = coordinates(dependency)
    if (name === undefined || local.has(name)) continue
    const written = textOf(dependency, 'version')
    const version = written === undefined ? managed.get(name) : interpolate(written)
    const scope = interpolate(textOf(dependency, 'scope') ?? 'compile')
    const group =
      scope !== 'compile' && scope !== 'runtime'
        ? scope
        : textOf(dependency, 'optional') === 'true'
          ? 'optional'
          : undefined
    found.push({
      manifest: pom.path,
      name,
      ...(version === undefined ? {} : { version }),
      ...(group === undefined ? {} : { group }),
      line: dependency.line
    })
  }
  return found
}
