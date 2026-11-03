/**
 * How the name a Library is declared by is tied to the name the code uses it by
 * (docs/structure-format.md, section 3, "The Library inventory"), where the two differ and
 * nothing installed in the repository says how: a small table of well-known differences for
 * Python and Java, and Python's normalisation of names (PEP 503). The tables are the suite's
 * own knowledge, named as such wherever a mapping comes from them.
 */

/** PEP 503: lowercase, every run of `-`, `_` and `.` one `-`. `PyYAML` and `pyyaml` are one. */
export const normalisedPython = (name: string): string => name.toLowerCase().replace(/[-_.]+/g, '-')

/**
 * Python distributions whose top-level packages are not their name, normalised: what the
 * code imports of each. Where a distribution's installed metadata is in the repository, that
 * is read instead.
 */
export const PYTHON_IMPORTS: ReadonlyMap<string, readonly string[]> = new Map([
  ['attrs', ['attr', 'attrs']],
  ['beautifulsoup4', ['bs4']],
  ['discord-py', ['discord']],
  ['faiss-cpu', ['faiss']],
  ['faiss-gpu', ['faiss']],
  ['google-api-python-client', ['googleapiclient']],
  ['grpcio', ['grpc']],
  ['msgpack-python', ['msgpack']],
  ['mysqlclient', ['MySQLdb']],
  ['opencv-contrib-python', ['cv2']],
  ['opencv-contrib-python-headless', ['cv2']],
  ['opencv-python', ['cv2']],
  ['opencv-python-headless', ['cv2']],
  ['pillow', ['PIL']],
  ['protobuf', ['google']],
  ['psycopg2-binary', ['psycopg2']],
  ['pycryptodome', ['Crypto']],
  ['pycryptodomex', ['Cryptodome']],
  ['pygobject', ['gi']],
  ['pyjwt', ['jwt']],
  ['pymupdf', ['fitz', 'pymupdf']],
  ['pyopenssl', ['OpenSSL']],
  ['pyserial', ['serial']],
  ['python-dateutil', ['dateutil']],
  ['python-dotenv', ['dotenv']],
  ['python-jose', ['jose']],
  ['python-magic', ['magic']],
  ['python-multipart', ['multipart', 'python_multipart']],
  ['pyyaml', ['yaml', '_yaml']],
  ['pyzmq', ['zmq']],
  ['ruamel-yaml', ['ruamel']],
  ['scikit-image', ['skimage']],
  ['scikit-learn', ['sklearn']],
  ['setuptools', ['setuptools', 'pkg_resources', '_distutils_hack']]
])

/**
 * Maven artefacts whose packages do not begin with their group ID, or share it with others:
 * the package prefixes the code imports of each.
 */
export const JAVA_PACKAGES: ReadonlyMap<string, readonly string[]> = new Map([
  ['com.fasterxml.jackson.core:jackson-annotations', ['com.fasterxml.jackson.annotation']],
  ['com.fasterxml.jackson.core:jackson-core', ['com.fasterxml.jackson.core']],
  ['com.fasterxml.jackson.core:jackson-databind', ['com.fasterxml.jackson.databind']],
  ['com.google.code.gson:gson', ['com.google.gson']],
  ['com.google.guava:guava', ['com.google.common', 'com.google.thirdparty']],
  ['commons-codec:commons-codec', ['org.apache.commons.codec']],
  ['commons-collections:commons-collections', ['org.apache.commons.collections']],
  ['commons-io:commons-io', ['org.apache.commons.io']],
  ['commons-lang:commons-lang', ['org.apache.commons.lang']],
  ['commons-logging:commons-logging', ['org.apache.commons.logging']],
  ['junit:junit', ['org.junit', 'junit']],
  ['org.apache.commons:commons-collections4', ['org.apache.commons.collections4']],
  ['org.apache.commons:commons-lang3', ['org.apache.commons.lang3']],
  ['org.apache.commons:commons-text', ['org.apache.commons.text']],
  ['org.junit.jupiter:junit-jupiter', ['org.junit.jupiter']],
  ['org.junit.jupiter:junit-jupiter-api', ['org.junit.jupiter.api']],
  ['org.junit.jupiter:junit-jupiter-params', ['org.junit.jupiter.params']],
  ['org.projectlombok:lombok', ['lombok']]
])

/** What DefinitelyTyped names `@types/babel__core`: the types of `@babel/core`. */
export function typedPackage(name: string): string | undefined {
  if (!name.startsWith('@types/')) return undefined
  const rest = name.slice('@types/'.length)
  const scoped = rest.indexOf('__')
  return scoped === -1 ? rest : `@${rest.slice(0, scoped)}/${rest.slice(scoped + 2)}`
}
