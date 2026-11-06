import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import { manifestLibraries } from '../src/manifests'

const read = (repository: Record<string, string>) =>
  manifestLibraries(memoryFileSystem(repository), Object.keys(repository))

describe('the Libraries the manifests declare (docs/structure-format.md, section 3, "Manifests")', () => {
  it('reads PEP 621, PEP 735 and Poetry from pyproject.toml, with the group of each', async () => {
    expect(
      await read({
        'pyproject.toml': [
          '[project]',
          'dependencies = ["requests[socks] >= 2.31 ; python_version < \'3.13\'", "attrs", "pip @ https://example.com/pip.whl"]',
          '[project.optional-dependencies]',
          'docs = ["sphinx (>=7)"]',
          '[dependency-groups]',
          'test = ["pytest>=8", { include-group = "docs" }]',
          '[tool.poetry.dependencies]',
          'python = "^3.11"',
          'pydantic = "^2.0"',
          'local = { path = "../local" }',
          'rich = { version = "^13", optional = true }',
          '[tool.poetry.dev-dependencies]',
          'black = "*"',
          '[tool.poetry.group.lint.dependencies]',
          'ruff = "^0.6"'
        ].join('\n')
      })
    ).toEqual([
      { manifest: 'pyproject.toml', name: 'requests', version: '>= 2.31', line: 2 },
      { manifest: 'pyproject.toml', name: 'attrs', line: 2 },
      { manifest: 'pyproject.toml', name: 'pip', line: 2 },
      { manifest: 'pyproject.toml', name: 'sphinx', version: '>=7', group: 'docs', line: 4 },
      { manifest: 'pyproject.toml', name: 'pytest', version: '>=8', group: 'test', line: 6 },
      { manifest: 'pyproject.toml', name: 'pydantic', version: '^2.0', line: 9 },
      { manifest: 'pyproject.toml', name: 'local', line: 10 },
      { manifest: 'pyproject.toml', name: 'rich', version: '^13', line: 11 },
      { manifest: 'pyproject.toml', name: 'black', version: '*', group: 'dev', line: 13 },
      { manifest: 'pyproject.toml', name: 'ruff', version: '^0.6', group: 'lint', line: 15 }
    ])
  })

  it('reads requirements files a line at a time, without options, paths and URLs', async () => {
    expect(
      await read({
        'requirements.txt': [
          '# pinned',
          'Django==5.1.2  # the web',
          '-r requirements-dev.txt',
          '-e .',
          '--index-url https://example.com/simple',
          'numpy>=1.26,<3 \\',
          '    --hash=sha256:abc',
          './vendored/pkg',
          'git+https://example.com/repo.git#egg=thing',
          'six'
        ].join('\n'),
        'requirements-dev.txt': 'pytest\n',
        'requirements/prod.txt': 'gunicorn==23.0\n',
        'notes.txt': 'not==a manifest\n'
      })
    ).toEqual([
      { manifest: 'requirements-dev.txt', name: 'pytest', line: 1 },
      { manifest: 'requirements.txt', name: 'Django', version: '==5.1.2', line: 2 },
      // A requirement continued over lines is on its first.
      { manifest: 'requirements.txt', name: 'numpy', version: '>=1.26,<3', line: 6 },
      { manifest: 'requirements.txt', name: 'six', line: 10 },
      { manifest: 'requirements/prod.txt', name: 'gunicorn', version: '==23.0', line: 1 }
    ])
  })

  it('reads what go.mod requires, single and in blocks, marking the indirect ones', async () => {
    expect(
      await read({
        'go.mod': [
          'module example.com/shop',
          'require github.com/google/uuid v1.6.0',
          'require (',
          '\tgolang.org/x/text v0.21.0 // indirect',
          '\t"github.com/quoted/mod" v1.0.0',
          ')',
          '// require commented.out v1.0.0'
        ].join('\n')
      })
    ).toEqual([
      { manifest: 'go.mod', name: 'github.com/google/uuid', version: 'v1.6.0', line: 2 },
      {
        manifest: 'go.mod',
        name: 'golang.org/x/text',
        version: 'v0.21.0',
        group: 'indirect',
        line: 4
      },
      { manifest: 'go.mod', name: 'github.com/quoted/mod', version: 'v1.0.0', line: 5 }
    ])
  })

  it('finds the line of each in the forms TOML allows: arrays over lines, inline tables, the same twice', async () => {
    expect(
      await read({
        'pyproject.toml': [
          '[project]',
          'name = "shop"',
          'dependencies = [',
          '  "requests>=2.31",  # the web',
          "  'attrs',",
          '  "requests>=2.31",',
          '  "esc\\u0061ped",',
          ']',
          'optional-dependencies = { dev = ["pytest"] }',
          '[tool.poetry]',
          'dependencies = { "zope.interface" = "*", rich = { version = "^13" } }'
        ].join('\n')
      })
    ).toEqual([
      { manifest: 'pyproject.toml', name: 'requests', version: '>=2.31', line: 4 },
      { manifest: 'pyproject.toml', name: 'attrs', line: 5 },
      { manifest: 'pyproject.toml', name: 'requests', version: '>=2.31', line: 6 },
      // Its text is not what it reads: no line, rather than a wrong one.
      { manifest: 'pyproject.toml', name: 'escaped' },
      { manifest: 'pyproject.toml', name: 'pytest', group: 'dev', line: 9 },
      { manifest: 'pyproject.toml', name: 'zope.interface', version: '*', line: 11 },
      { manifest: 'pyproject.toml', name: 'rich', version: '^13', line: 11 }
    ])
  })

  it('reads a manifest of many thousand requirements, the same one among them, in time linear in its length', async () => {
    const many = Array.from({ length: 50_000 }, (_, index) =>
      index % 2 === 0 ? '  "same",' : `  "pkg${index}>=1",`
    )
    const started = performance.now()
    const found = await read({
      'pyproject.toml': ['[project]', 'dependencies = [', ...many, ']'].join('\n'),
      'requirements.txt': `pkg>=1 \\\n${'  --hash=sha256:abc \\\n'.repeat(50_000)}  --hash=sha256:def\n`
    })
    expect(performance.now() - started).toBeLessThan(3000)
    expect(found).toHaveLength(50_001)
    expect(found[49_998]).toEqual({ manifest: 'pyproject.toml', name: 'same', line: 50_001 })
    expect(found.at(-1)).toEqual({
      manifest: 'requirements.txt',
      name: 'pkg',
      version: '>=1',
      line: 1
    })
  })

  it('reads the four groups of package.json, without the packages of the workspace and local specifiers', async () => {
    expect(
      await read({
        'package.json': JSON.stringify(
          {
            name: 'shop',
            workspaces: ['packages/*'],
            devDependencies: { prettier: '^3.7.4', '@types/node': '^24' }
          },
          null,
          2
        ),
        'packages/web/package.json': [
          '{',
          '  "name": "@shop/web",',
          '  "dependencies": {',
          '    "@shop/core": "workspace:*",',
          '    "shop": "0.0.0",',
          '    "react": "^19.0.0", "lodash": "npm:lodash-es@^4",',
          '    "local": "file:../local",',
          '    "linked": "link:../linked",',
          '    "relative": "../relative",',
          '    "odd\\"key": "1",',
          '    "nothing": 3',
          '  },',
          '  "peerDependencies": { "react": ">=18" },',
          '  "optionalDependencies": { "fsevents": "^2" },',
          '  "scripts": { "dependencies": "not one" }',
          '}'
        ].join('\n'),
        'packages/core/package.json': '{ "name": "@shop/core", "version": "0.0.0" }'
      })
    ).toEqual([
      { manifest: 'package.json', name: 'prettier', version: '^3.7.4', group: 'dev', line: 7 },
      { manifest: 'package.json', name: '@types/node', version: '^24', group: 'dev', line: 8 },
      { manifest: 'packages/web/package.json', name: 'react', version: '^19.0.0', line: 6 },
      {
        manifest: 'packages/web/package.json',
        name: 'lodash',
        version: 'npm:lodash-es@^4',
        line: 6
      },
      { manifest: 'packages/web/package.json', name: 'odd"key', version: '1', line: 10 },
      {
        manifest: 'packages/web/package.json',
        name: 'react',
        version: '>=18',
        group: 'peer',
        line: 13
      },
      {
        manifest: 'packages/web/package.json',
        name: 'fsevents',
        version: '^2',
        group: 'optional',
        line: 14
      }
    ])
  })

  it("reads a pom's dependencies with their scope, versions from properties and dependencyManagement, its parent's too", async () => {
    expect(
      await read({
        'pom.xml': [
          '<?xml version="1.0"?>',
          '<project>',
          '  <groupId>com.shop</groupId><artifactId>shop</artifactId><version>1.4</version>',
          '  <properties><slf4j.version>2.0.16</slf4j.version><junit>5.11.0</junit></properties>',
          '  <dependencyManagement><dependencies>',
          '    <dependency><groupId>org.slf4j</groupId><artifactId>slf4j-api</artifactId>',
          '      <version>${slf4j.version}</version></dependency>',
          '  </dependencies></dependencyManagement>',
          '  <dependencies>',
          '    <!-- <dependency><groupId>commented</groupId><artifactId>out</artifactId></dependency> -->',
          '    <dependency>',
          '      <groupId>org.junit.jupiter</groupId>',
          '      <artifactId>junit-jupiter</artifactId>',
          '      <version>${junit}</version>',
          '      <scope>test</scope>',
          '    </dependency>',
          '  </dependencies>',
          '</project>'
        ].join('\n'),
        'cart/pom.xml': [
          '<project xmlns="http://maven.apache.org/POM/4.0.0">',
          '  <parent><groupId>com.shop</groupId><artifactId>shop</artifactId><version>1.4</version></parent>',
          '  <artifactId>cart</artifactId>',
          '  <properties><guava.version>33.3.1-jre</guava.version></properties>',
          '  <dependencies>',
          '    <dependency><groupId>org.slf4j</groupId><artifactId>slf4j-api</artifactId></dependency>',
          '    <dependency><groupId>com.google.guava</groupId><artifactId>guava</artifactId><version>${guava.version}</version></dependency>',
          '    <dependency><groupId>com.shop</groupId><artifactId>catalog</artifactId><version>${project.version}</version></dependency>',
          '    <dependency><groupId>jakarta.servlet</groupId><artifactId>jakarta.servlet-api</artifactId><version>${servlet.version}</version><scope>provided</scope></dependency>',
          '    <dependency><groupId>org.x</groupId><artifactId>y</artifactId><optional>true</optional></dependency>',
          '  </dependencies>',
          '</project>'
        ].join('\n'),
        'catalog/pom.xml':
          '<project><parent><groupId>com.shop</groupId><artifactId>shop</artifactId></parent><artifactId>catalog</artifactId></project>'
      })
    ).toEqual([
      { manifest: 'cart/pom.xml', name: 'org.slf4j:slf4j-api', version: '2.0.16', line: 6 },
      { manifest: 'cart/pom.xml', name: 'com.google.guava:guava', version: '33.3.1-jre', line: 7 },
      // What no pom of the repository says stays as written.
      {
        manifest: 'cart/pom.xml',
        name: 'jakarta.servlet:jakarta.servlet-api',
        version: '${servlet.version}',
        group: 'provided',
        line: 9
      },
      { manifest: 'cart/pom.xml', name: 'org.x:y', group: 'optional', line: 10 },
      {
        manifest: 'pom.xml',
        name: 'org.junit.jupiter:junit-jupiter',
        version: '5.11.0',
        group: 'test',
        line: 11
      }
    ])
  })

  it('reads a parent pom only inside the repository, and only the one the pom names', async () => {
    const found = await read({
      'api/pom.xml': [
        '<project>',
        '  <parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><relativePath/></parent>',
        '  <artifactId>api</artifactId>',
        '  <dependencies><dependency><groupId>org.x</groupId><artifactId>y</artifactId><version>${v}</version></dependency></dependencies>',
        '</project>'
      ].join('\n'),
      'pom.xml':
        '<project><artifactId>other</artifactId><properties><v>9</v></properties></project>'
    })
    expect(found).toEqual([{ manifest: 'api/pom.xml', name: 'org.x:y', version: '${v}', line: 4 }])
  })

  it('reads a Gradle declaration after { or ; on its line, and every one of a list (PR #60)', async () => {
    expect(
      await read({
        'build.gradle': [
          "dependencies { implementation 'x:y:1' }",
          'dependencies {',
          "    implementation 'a:b:1', 'c:d:2'; testImplementation 'e:f:3'",
          '    api("g:h:4") { exclude group: "i" }',
          '}'
        ].join('\n')
      })
    ).toEqual([
      { manifest: 'build.gradle', name: 'x:y', version: '1', line: 1 },
      { manifest: 'build.gradle', name: 'a:b', version: '1', line: 3 },
      { manifest: 'build.gradle', name: 'c:d', version: '2', line: 3 },
      { manifest: 'build.gradle', name: 'e:f', version: '3', group: 'testImplementation', line: 3 },
      { manifest: 'build.gradle', name: 'g:h', version: '4', line: 4 }
    ])
  })

  it('reads the forms of Gradle on one line, Kotlin and the version catalog, without projects and files', async () => {
    expect(
      await read({
        'gradle/libs.versions.toml': [
          '[versions]',
          'jackson = "2.18.1"',
          '[libraries]',
          'jackson-databind = { module = "com.fasterxml.jackson.core:jackson-databind", version.ref = "jackson" }',
          'jackson_core = { group = "com.fasterxml.jackson.core", name = "jackson-core", version = "2.18.1" }',
          'slf4j = "org.slf4j:slf4j-api:2.0.16"',
          '[bundles]',
          'json = ["jackson-databind", "jackson_core"]'
        ].join('\n'),
        'app/build.gradle.kts': [
          'plugins { id("org.jetbrains.kotlin.jvm") }',
          'dependencies {',
          '    implementation("com.google.guava:guava:33.3.1-jre") // the collections',
          '    implementation(platform("org.springframework.boot:spring-boot-dependencies:3.4.0"))',
          '    implementation(project(":core"))',
          '    implementation(files("libs/x.jar"))',
          '    implementation(libs.jackson.databind)',
          '    api(libs.bundles.json)',
          '    runtimeOnly(libs.slf4j)',
          '    testImplementation(kotlin("test"))',
          '    compileOnly(group = "org.projectlombok", name = "lombok", version = "1.18.36")',
          '    // implementation("commented:out:1")',
          '}'
        ].join('\n'),
        'core/build.gradle': [
          'buildscript { dependencies { classpath "com.android.tools.build:gradle:8.7" } }',
          'dependencies {',
          "    implementation 'org.apache.commons:commons-lang3:3.17.0'",
          "    testImplementation group: 'junit', name: 'junit', version: '4.13.2'",
          '    annotationProcessor "org.mapstruct:mapstruct-processor:$mapstructVersion"',
          '}'
        ].join('\n')
      })
    ).toEqual([
      {
        manifest: 'app/build.gradle.kts',
        name: 'com.google.guava:guava',
        version: '33.3.1-jre',
        line: 3
      },
      {
        manifest: 'app/build.gradle.kts',
        name: 'org.springframework.boot:spring-boot-dependencies',
        version: '3.4.0',
        line: 4
      },
      {
        manifest: 'app/build.gradle.kts',
        name: 'com.fasterxml.jackson.core:jackson-databind',
        version: '2.18.1',
        line: 7
      },
      {
        manifest: 'app/build.gradle.kts',
        name: 'com.fasterxml.jackson.core:jackson-databind',
        version: '2.18.1',
        line: 8
      },
      {
        manifest: 'app/build.gradle.kts',
        name: 'com.fasterxml.jackson.core:jackson-core',
        version: '2.18.1',
        line: 8
      },
      { manifest: 'app/build.gradle.kts', name: 'org.slf4j:slf4j-api', version: '2.0.16', line: 9 },
      {
        manifest: 'app/build.gradle.kts',
        name: 'org.jetbrains.kotlin:kotlin-test',
        group: 'testImplementation',
        line: 10
      },
      {
        manifest: 'app/build.gradle.kts',
        name: 'org.projectlombok:lombok',
        version: '1.18.36',
        group: 'compileOnly',
        line: 11
      },
      {
        manifest: 'core/build.gradle',
        name: 'org.apache.commons:commons-lang3',
        version: '3.17.0',
        line: 3
      },
      {
        manifest: 'core/build.gradle',
        name: 'junit:junit',
        version: '4.13.2',
        group: 'testImplementation',
        line: 4
      },
      {
        manifest: 'core/build.gradle',
        name: 'org.mapstruct:mapstruct-processor',
        version: '$mapstructVersion',
        group: 'annotationProcessor',
        line: 5
      }
    ])
  })

  it('leaves out what go.mod requires from a module of the repository', async () => {
    expect(
      await read({
        'go.mod': [
          'module example.com/shop',
          'require (',
          '\texample.com/shop/billing v0.0.0',
          '\tgithub.com/google/uuid v1.6.0',
          ')',
          'replace example.com/shop/billing => ./billing'
        ].join('\n'),
        'billing/go.mod': 'module example.com/shop/billing\n'
      })
    ).toEqual([{ manifest: 'go.mod', name: 'github.com/google/uuid', version: 'v1.6.0', line: 4 }])
  })

  it('reads a line of a megabyte in every manifest in time linear in its length', async () => {
    const megabyte = 1024 * 1024
    const started = performance.now()
    await read({
      'package.json': `{"dependencies": {"a": "${'\\"'.repeat(megabyte / 2)}"}, ${'['.repeat(megabyte)}`,
      'pom.xml': `<project>${'<!--'.repeat(megabyte / 4)}`,
      'a/pom.xml': `<project><dependencies>${'<dependency a="'.repeat(megabyte / 15)}`,
      'b/pom.xml': `<project><version>${'${'.repeat(megabyte / 2)}</version></project>`,
      'c/pom.xml': `<project>${'<a>'.repeat(megabyte / 3)}`,
      'd/pom.xml': `<project>${'</a>'.repeat(megabyte / 4)}`,
      'build.gradle': `implementation ${'('.repeat(megabyte)}`,
      'a/build.gradle': `implementation ${"'".repeat(megabyte)}`,
      'b/build.gradle': `${' '.repeat(megabyte)}implementation group: ${'a: '.repeat(megabyte / 3)}`,
      'gradle/libs.versions.toml': `[libraries]\nx = "${':'.repeat(megabyte)}"\n`
    })
    // About a second alone, a few more beside the other tests; a reader quadratic in the
    // length of the line would take hours.
    expect(performance.now() - started).toBeLessThan(10_000)
  }, 20_000)

  it('leaves a character reference beyond the last code point as written', async () => {
    expect(
      await read({
        'pom.xml':
          '<project><dependencies><dependency><groupId>g</groupId><artifactId>a</artifactId>' +
          '<version>&#x110000;&#9999999;&#x41;</version></dependency></dependencies></project>'
      })
    ).toEqual([{ manifest: 'pom.xml', name: 'g:a', version: '&#x110000;&#9999999;A', line: 1 }])
  })

  it('works out each property once, leaves one that names itself, and none longer than a kibibyte', async () => {
    const pom = (properties: string, version: string): string =>
      `<project><properties>${properties}</properties><dependencies><dependency>` +
      `<groupId>g</groupId><artifactId>a</artifactId><version>${version}</version>` +
      '</dependency></dependencies></project>'
    const started = performance.now()
    const [self, fan, chain] = await Promise.all([
      read({ 'pom.xml': pom(`<a>${'${a}'.repeat(6)}</a>`, '${a}') }),
      // Each of ten levels names the next one four times: four to the tenth, were it expanded.
      read({
        'pom.xml': pom(
          Array.from({ length: 10 }, (_, n) => `<p${n}>${`\${p${n + 1}}`.repeat(4)}</p${n}>`).join(
            ''
          ) + '<p10>x</p10>',
          '${p0}'
        )
      }),
      read({ 'pom.xml': pom('<a>${b}</a><b>${c}</b><c>1.0</c>', '${a}-${missing}') })
    ])
    expect(performance.now() - started).toBeLessThan(2000)
    expect(self[0]!.version).toBe('${a}'.repeat(6))
    // Worked out as far as a kibibyte goes; what lies beyond stays as written.
    expect(fan[0]!.version!.length).toBeLessThanOrEqual(2048)
    expect(chain[0]!.version).toBe('1.0-${missing}')
  })

  it('reads deep nesting among closing tags that match nothing in time linear in its length', async () => {
    const depth = 50_000
    const started = performance.now()
    const found = await read({
      'pom.xml':
        '<project><dependencies><dependency><groupId>g</groupId><artifactId>a</artifactId>' +
        '</dependency></dependencies>' +
        '<a>'.repeat(depth) +
        '</b>'.repeat(depth) +
        '</a>'.repeat(depth) +
        '</project>'
    })
    expect(performance.now() - started).toBeLessThan(3000)
    expect(found).toEqual([{ manifest: 'pom.xml', name: 'g:a', line: 1 }])
  })

  it('follows a ref of the version catalog one level, so that one naming itself ends', async () => {
    const found = await read({
      'build.gradle': 'implementation libs.x\nimplementation libs.y\nimplementation libs.z',
      'gradle/libs.versions.toml': [
        '[versions]',
        'a = { ref = "a" }',
        'b = "2.0"',
        '[libraries]',
        'x = { module = "g:x", version = { ref = "a" } }',
        'y = { module = "g:y", version.ref = "b" }',
        'z = { module = "g:z", version.ref = "constructor" }'
      ].join('\n')
    })
    expect(found.map((library) => [library.name, library.version])).toEqual([
      ['g:x', undefined],
      ['g:y', '2.0'],
      ['g:z', undefined]
    ])
  })

  it('names nothing from a manifest its reader fails on, says which, and reads the others', async () => {
    const files = {
      'build.gradle': "implementation 'g:a:1'",
      'web/package.json': '{ "dependencies": { "react": "19" } }'
    }
    const fs = memoryFileSystem(files)
    // A reader that fails, as a reader with a fault in it would: the text is not one.
    const failing = {
      ...fs,
      readText: async (path: string, options?: { atMost?: number }) =>
        path === 'build.gradle' ? (42 as unknown as string) : fs.readText(path, options)
    }
    const notRead: unknown[] = []
    expect(
      await manifestLibraries(failing, Object.keys(files), (manifest) => notRead.push(manifest))
    ).toEqual([{ manifest: 'web/package.json', name: 'react', version: '19', line: 1 }])
    expect(notRead).toEqual([{ manifest: 'build.gradle', message: expect.any(String) }])
  })

  it('names nothing from a manifest it cannot read, and nothing that is never looked at', async () => {
    expect(
      await read({
        'pyproject.toml': '[project\ndependencies = [',
        'package.json': '{ "dependencies": ',
        'pom.xml': '<pro',
        'node_modules/x/requirements.txt': 'six\n',
        'node_modules/x/package.json': '{ "dependencies": { "six": "1" } }'
      })
    ).toEqual([])
  })
})
