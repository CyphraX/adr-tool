/**
 * What `core`, `structure`, `diagrams`, `review` and `assessment` say, in German: one sentence
 * for every code they have, taking the values their English sentence takes (docs/plan-roadmap.md, part 12). The
 * compiler asks for a sentence for every code; a code without one does not build.
 *
 * The vocabulary of the tool stays as it is: ADR, Decision Log, Status, Relation, Problem,
 * Migration, Frontmatter, Drift, Annotation, Assessment, Snapshot; Metadaten, Rückverweis,
 * Reparatur, Korrektur, Vorlage, Komponente, Entwurf, Quelldatei, Diagramm, Element, Verbindung,
 * Antwort, Anker, zitierte Zeilen, verwaist, neu anheften, Qualitätsszenario, Qualitätsmerkmal,
 * Befund, Beleg, Bewertung, Eintrag, Risiko, Schuldposten, Verstoß — a Violation, as Conformance
 * says it; a Finding that cites something „stützt sich auf“ it. What names a value or a key of a file — proposed,
 * accepted, supersedes, affects, container, scope, resolved — is written as the file writes it.
 */
import {
  STATUSES,
  type ForeignFormat,
  type Said,
  type SENTENCES as CORE_SENTENCES
} from '@adr-tool/core'
import type { REVIEW_SENTENCES } from '@adr-tool/review'
import type { STRUCTURE_SENTENCES } from '@adr-tool/structure/model'
import type { DIAGRAMS_SENTENCES } from '@adr-tool/diagrams'
import type { ASSESSMENT_SENTENCES, EvidenceKind } from '@adr-tool/assessment'

/**
 * Every code of `core`, `structure`, `diagrams`, `review` and `assessment`, with the values of
 * its sentence. The kernel's codes are in each of them; they are taken once.
 */
type Codes = typeof CORE_SENTENCES &
  Omit<typeof STRUCTURE_SENTENCES, keyof typeof CORE_SENTENCES> &
  Omit<typeof DIAGRAMS_SENTENCES, keyof typeof CORE_SENTENCES> &
  Omit<typeof REVIEW_SENTENCES, keyof typeof CORE_SENTENCES> &
  Omit<typeof ASSESSMENT_SENTENCES, keyof typeof CORE_SENTENCES>

/** A sentence for every code, taking the values the English one takes. */
type Wording<S> = { readonly [Code in keyof S]: S[Code] }

/** What each foreign format is called, in a sentence. */
const FORMAT: Record<ForeignFormat, string> = {
  'adr-tools': 'adr-tools',
  madr: 'MADR',
  'madr-2': 'MADR 2 oder log4brains'
}

/** The verb of a Relation that an ADR has to another one. */
const RELATES: Record<'supersedes' | 'amends', string> = {
  supersedes: 'ersetzt',
  amends: 'ergänzt'
}

const SEGMENT_RULE =
  'Ein Segment besteht aus Kleinbuchstaben, Ziffern und Bindestrichen und beginnt und endet mit einem Buchstaben oder einer Ziffer.'

const ELEMENT_ID_RULE =
  'Eine Element-ID besteht aus Kleinbuchstaben, Ziffern und Bindestrichen und beginnt und endet mit einem Buchstaben oder einer Ziffer.'

const LEVELS = 'system-context, container oder component'

/** A view level as a sentence names the Diagram that has it. */
const VIEW: Record<string, string> = {
  'system-context': 'ein Systemkontext',
  container: 'eine Containersicht',
  component: 'eine Komponentensicht'
}
const viewOf = (level: string): string => VIEW[level] ?? `ein Diagramm der Ebene „${level}“`

/** How many Source File Dependencies stand behind something. */
const dependenciesIn = (count: number): string =>
  count === 1
    ? 'eine Abhängigkeit zwischen Quelldateien'
    : `${count} Abhängigkeiten zwischen Quelldateien`

/** The start every refusal to write a foreign file shares. */
const foreign = (v: { adr: string; format: ForeignFormat }): string =>
  `${v.adr} ist im Format von ${FORMAT[v.format]} geschrieben. Das Werkzeug liest dieses Format und schreibt es nie.`

/** A list of names as a sentence has them: `a`, `a und b`, `a, b und c`. */
const listed = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`

/** How an orphaned Annotation is attached again, as the end of its Problem. */
const ATTACH_AGAIN = 'Sie muss neu an die Zeilen geheftet werden, um die es geht.'

/** What keeps a section in the text: `„Proposed“, „Clarifies […](…)“`. */
const quoted = (what: readonly string[]): string => what.map((one) => `„${one}“`).join(', ')

/** The Status as a sentence names it: one of the five values, or what is written, in quotes. */
/** A Status that is none of the five values comes in English quotes; German quotes it its own way. */
const germanQuotes = (is: string): string => is.replace(/^"(.*)"$/s, '„$1“')
const has = (v: { adr: string; is: string }): string =>
  `${v.adr} hat den Status ${germanQuotes(v.is)}.`

/** What is kept in each directory of Assessment, as a sentence names it. */
const KEPT: Record<string, string> = {
  assessments: 'kein Assessment',
  risks: 'kein Risiko',
  debt: 'kein Schuldposten'
}
const kept = (key: string): string => (Object.hasOwn(KEPT, key) ? KEPT[key]! : `nichts aus ${key}`)

/**
 * What kind a piece of evidence is, as a noun without its article, by the key the file writes:
 * a kind a later part adds needs its German here, or the window does not build.
 */
const KIND: Record<EvidenceKind, string> = {
  violation: 'Verstoß',
  metric: 'Metrik',
  annotation: 'Annotation',
  adr: 'ADR',
  risk: 'Risiko',
  debt: 'Schuldposten'
}
/** A piece of evidence before its name in the accusative: after „stützt sich auf“ and „es gibt“. */
const ACCUSATIVE: Record<EvidenceKind, string> = {
  violation: 'den Verstoß',
  metric: 'die Metrik',
  annotation: 'die Annotation',
  adr: 'das ADR',
  risk: 'das Risiko',
  debt: 'den Schuldposten'
}
const lookUp = (table: Record<string, string>, kind: string): string =>
  Object.hasOwn(table, kind) ? table[kind]! : kind
const evidence = (kind: string, name: string): string => `${lookUp(ACCUSATIVE, kind)} ${name}`
/** The same, at the start of a sentence. */
const Evidence = (kind: string, name: string): string => {
  const said = evidence(kind, name)
  return said.charAt(0).toUpperCase() + said.slice(1)
}

/** What another sentence said, inside this one; a plain text is passed on as it is. */
const german = (said: Said | string): string =>
  typeof said === 'string' ? said : (inGerman(said) ?? said.code)

export const DE: Wording<Codes> = {
  // The kernel: what any operation may refuse, and why .arch/config.yml cannot be read.
  'already-exists': (v) => `${v.path} existiert bereits.`,
  'no-longer-exists': (v) => `${v.path} existiert nicht mehr.`,
  'unreadable-config': (v) =>
    `${v.path} kann nicht gelesen werden: ${german(v.detail)}. Was seine Einstellungen entscheiden, geschieht nicht, bis die Datei korrigiert ist.`,
  'config-not-yaml': (v) => `es ist kein gültiges YAML: ${v.message}`,
  'config-not-map': () => 'die oberste Ebene muss ein Mapping sein',

  // Which ADR an operation is about.
  'no-adr': (v) => `Es gibt kein ADR ${v.id} in diesem Decision Log.`,
  'no-adr-in-repository': (v) => `Es gibt kein ADR ${v.id} in diesem Repository.`,
  'target-not-in-log': (v) =>
    `${v.adr} ${RELATES[v.type]} ${v.target}, aber ${v.target} ist nicht in diesem Decision Log.`,
  'target-not-in-repository': (v) =>
    `${v.adr} ${RELATES[v.type]} ${v.target}, aber ${v.target} ist kein ADR dieses Repositorys.`,
  'frontmatter-unreadable': (v) =>
    `Das Frontmatter von ${v.adr} kann nicht gelesen werden. Es muss korrigiert werden, bevor das Werkzeug hineinschreiben kann.`,

  // A foreign format is read and never written.
  'foreign-format': (v) => `${foreign(v)} Es muss zuerst migriert werden.`,
  'foreign-format-no-migration': (v) => `${foreign(v)} Es ${german(v.why)}`,
  'foreign-format-names-component': (v) =>
    `${foreign(v)} Es nennt ${v.component} in affects und muss zuerst migriert werden.`,
  'foreign-format-names-number': (v) =>
    `${foreign(v)} Es nennt seinen Nachfolger über die Nummer ${v.number}, die danach ein anderes ADR bezeichnen würde. Es muss zuerst migriert werden.`,
  'foreign-format-mentions': (v) =>
    `${foreign(v)} Es erwähnt ${v.id}. Zuerst muss es migriert oder das andere ADR umnummeriert werden.`,
  'foreign-format-mentions-elsewhere': (v) =>
    `${foreign(v)} Es erwähnt ${v.reference} und muss zuerst migriert werden.`,
  'successor-in-status-text': () =>
    'nennt seinen Nachfolger im Text seines Status, wo adr-tools einen Link schreibt. Als `status` würde das so gelesen, wie MADR es meint, und etwas anderes sagen als jetzt. Wird daraus von Hand eine Link-Zeile — Superseded by [2. Title](0002-title.md) —, kann es migriert werden.',

  // What a Status allows.
  'accept-needs-proposed': (v) =>
    `Nur ein ADR mit dem Status proposed kann angenommen werden. ${has(v)}`,
  'reject-needs-proposed': (v) =>
    `Nur ein ADR mit dem Status proposed kann abgelehnt werden. ${has(v)}`,
  'deprecate-needs-accepted': (v) =>
    `Nur ein ADR mit dem Status accepted kann als veraltet markiert werden. ${has(v)}`,
  'supersede-needs-decided': (v) =>
    `Nur ein ADR mit dem Status accepted oder deprecated kann ersetzt werden. ${has(v)}`,
  'amend-needs-accepted': (v) =>
    `Nur ein ADR mit dem Status accepted kann ergänzt werden. ${has(v)}`,
  'relations-fixed': (v) =>
    `Was ein ADR ersetzt oder ergänzt, steht fest, sobald es nicht mehr den Status proposed hat. ${has(v)}`,

  // Editing the Metadata lists.
  'relation-to-itself': (v) => `${v.adr} kann keine Relation zu sich selbst haben.`,
  'no-components-declared': () =>
    'In diesem Repository ist keine Komponente deklariert, also kann keine genannt werden.',
  'component-not-declared': (v) => `Es gibt keine deklarierte Komponente ${v.component}.`,
  'decision-maker-one-line': () =>
    'Ein Eintrag in decision-makers ist eine Zeile Text und darf nicht leer sein.',
  'tag-one-line': () => 'Ein Tag ist eine Zeile Text und darf nicht leer sein.',

  // A new ADR.
  'title-needs-letter': () => 'Der Titel braucht mindestens einen Buchstaben oder eine Ziffer.',
  'id-taken': (v) => `${v.id} existiert in diesem Decision Log bereits.`,
  'no-template': (v) => `Es gibt keine Vorlage namens „${v.name}“.`,
  'template-has-frontmatter': (v) =>
    `Die Vorlage „${v.name}“ beginnt mit Frontmatter. Eine Vorlage gibt nur den Text vor; das Frontmatter muss aus ${v.path} entfernt werden.`,
  'successor-by-number': (v) =>
    `${v.adr} gibt an, vom ADR mit der Nummer ${v.number} ersetzt zu werden, die es bisher nicht gab. Das neue ADR wird als dieser Nachfolger gelesen.`,

  // Editing the body; a Correction.
  'changed-since-edit': (v) =>
    `${v.adr} wurde auf der Festplatte geändert, nachdem diese Bearbeitung begonnen hat.`,
  'number-changed': (v) => `Eine Zahl hat sich geändert: ${v.numbers.join(', ')}.`,
  'many-words-changed': (v) =>
    `Mehr als ein paar Wörter haben sich geändert: ${v.added} hinzugefügt, ${v.removed} entfernt.`,

  // The ADRs' half of a Component's Rename.
  'rename-needs-two-ids': () =>
    'Eine Umbenennung braucht eine alte und eine neue Komponenten-ID, die sich unterscheiden.',
  'unreadable-has-affects': (v) =>
    `Das Frontmatter von ${v.adr} kann nicht gelesen werden, und es enthält eine Liste „affects“. Es muss korrigiert werden, bevor ${v.component} umbenannt wird.`,

  // Renumber.
  'renumber-needs-sequential': () =>
    'Nur ein ADR eines fortlaufend nummerierten Decision Logs hat eine Nummer.',
  'number-not-shared': (v) =>
    `Umnummerieren ist für ein ADR gedacht, das seine Nummer mit einem anderen teilt. ${v.adr} hat seine Nummer für sich allein, und seine ID bleibt, wie sie ist.`,
  'names-itself': (v) =>
    `${v.adr} nennt sich selbst in ${v.key}. Das muss entfernt werden, bevor es umnummeriert wird.`,
  'unreadable-mentions': (v) =>
    `Das Frontmatter von ${v.adr} kann nicht gelesen werden, und die Datei erwähnt ${v.mentioned}. Es muss korrigiert werden, bevor ${v.id} umnummeriert wird.`,
  'heading-carries-number': (v) =>
    `Die Überschrift von ${v.adr} trägt die Nummer ${v.number}. Sie bleibt, wie sie ist, und wird von nun an als Teil des Titels angezeigt.`,
  'mentioned-in-text': (v) => `${v.adr} erwähnt ${v.id} in seinem Text.`,

  // Migration.
  'migrate-unreadable': (v) =>
    `Das Frontmatter von ${v.adr} kann nicht gelesen werden, daher ist nicht zu erkennen, in welchem Format es geschrieben ist. Es muss zuerst korrigiert werden.`,
  'own-format-already': (v) => `${v.adr} ist bereits im eigenen Format des Tools geschrieben.`,
  'nothing-foreign': () => 'In diesem Decision Log gibt es kein ADR in einem fremden Format.',
  'nothing-migrated': (v) => ['Nichts kann migriert werden.', ...v.reasons.map(german)].join(' '),
  'changed-on-disk': (v) =>
    `${v.adr} wurde auf der Festplatte geändert und muss neu angesehen werden.`,
  'no-migration': (v) => `${v.adr} ${german(v.why)}`,
  'successor-unreadable': (v) =>
    `${v.adr} wird von ${v.successor} ersetzt, dessen Frontmatter nicht gelesen werden kann. Diese Datei muss zuerst korrigiert werden.`,
  'successor-foreign': (v) =>
    `${v.adr} wird von ${v.successor} ersetzt, das selbst im Format von ${FORMAT[v.format]} geschrieben ist. Zuerst muss ${v.successor} migriert werden, oder das ganze Decision Log.`,
  'cannot-migrate': (v) => `${v.adr} kann nicht migriert werden: ${german(v.why)}`,
  'waits-for-successor': (v) => `${v.adr} wartet auf seinen Nachfolger ${v.successor}.`,
  'status-section-stays': (v) =>
    `Der Abschnitt Status von ${v.adr} bleibt in seinem Text: Die Metadaten können ${quoted(v.keeps)} nicht aufnehmen.`,
  'successor-not-in-log': (v) =>
    `${v.adr} nennt „${v.successor}“ als seinen Nachfolger, aber das ist kein ADR dieses Decision Logs. Es wird geschrieben, wie es dasteht, und bleibt ein Problem.`,
  'listed-status-stays': (v) =>
    `Der Status von ${v.adr} bleibt in der Liste unter seinem Titel: Das Werkzeug kennt „${v.status}“ nicht.`,
  'listed-twice': (v) =>
    `Die Liste unter dem Titel von ${v.adr} nennt ${v.item} zweimal: Beide Einträge bleiben in seinem Text.`,
  'links-section-stays': (v) =>
    `Der Abschnitt Links von ${v.adr} bleibt in seinem Text: Die Metadaten können ${quoted(v.keeps)} nicht aufnehmen.`,

  // Repairs.
  'problem-gone': () => 'Dieses Problem besteht nicht mehr.',
  'fix-frontmatter-first': (v) =>
    `Nur gemeldet, weil das Frontmatter von ${v.adr} nicht gelesen werden kann. Das muss zuerst korrigiert werden.`,
  'fix-status-first': (v) =>
    `Nur gemeldet, weil der Status von ${v.adr} keiner der fünf Werte ist, was seine Relationen unwirksam macht. Das muss zuerst korrigiert werden.`,
  'deprecate-again': (v) =>
    `${v.adr} erhält den Status accepted. War es als veraltet markiert, bevor es als ersetzt markiert wurde, muss es danach erneut als veraltet markiert werden.`,
  'source-does-not-name': (v) =>
    `${v.source} nennt ${v.adr} nicht in ${v.type}. Sollte es das, hier abbrechen und ${v.adr} von Hand in ${v.source} eintragen: Dann ist der Rückverweis richtig.`,
  'source-still-proposed': (v) =>
    `${v.source} hat noch den Status proposed. Sobald es angenommen ist, wird der Rückverweis wieder geschrieben.`,
  'source-rejected': (v) => `${v.source} wurde abgelehnt: Seine Relationen treten nie in Kraft.`,

  // Metadata the tool must not write into.
  'not-single-value': (v) => `„${v.key}“ ist kein einzelner Wert`,
  'block-scalar': (v) =>
    `„${v.key}“ ist als Block über mehrere Zeilen geschrieben, den das Werkzeug nicht an Ort und Stelle ändern kann. Der Wert muss in einem Editor auf eine Zeile geschrieben werden.`,
  'not-a-list': (v) => `„${v.key}“ ist keine Liste`,
  'empty-block-list': (v) => `„${v.key}“ ist eine leere Blockliste`,
  'item-by-hand': (v) =>
    `„${v.key}“ ist so geschrieben, dass das Werkzeug keinen Eintrag herausnehmen kann. „${v.item}“ muss in einem Editor entfernt werden.`,
  'key-taken': (v) => `„${v.key}“ ist bereits vorhanden`,
  'frontmatter-never-closed': () => 'Das Frontmatter wird nie geschlossen',
  'frontmatter-not-yaml': (v) => `Das Frontmatter ist kein gültiges YAML: ${v.message}`,
  'frontmatter-not-mapping': () => 'Das Frontmatter ist kein Mapping',

  'configuration-first': (v) =>
    `${`${v.path} kann nicht verwendet werden: ${german(v.detail)}`.replace(/\.?$/, '.')} Die Datei muss zuerst repariert werden.`,

  // The details of Problems.
  'yaml-error': (v) => `${v.message} (Meldung des YAML-Parsers)`,
  'expected-single-value': () => 'Erwartet wird ein einzelner Wert',
  'not-a-date': (v) => `„${v.value}“ ist kein Datum der Form JJJJ-MM-TT`,
  'expected-list': () => 'Erwartet wird eine Liste',
  'expected-single-values': () => 'Erwartet wird eine Liste einzelner Werte',
  'expected-corrections': () => 'Erwartet wird eine Liste von Korrekturen',
  'correction-needs-date': () => 'Jede Korrektur braucht ein Datum der Form JJJJ-MM-TT',
  'unknown-status': (v) => `„${v.status}“ ist keiner der Werte ${STATUSES.join(', ')}`,
  'decided-while-proposed': () => 'Ein ADR mit dem Status proposed ist noch nicht entschieden',
  'adr-dir-outside': () => 'Das Verzeichnis muss ein relativer Pfad innerhalb des Repositorys sein',
  'expected-mapping': () => 'Erwartet wird ein Mapping',
  'repository-name': () =>
    '„name“ darf nur aus Buchstaben, Ziffern, „.“, „_“ und „-“ bestehen und muss mit einem Buchstaben oder einer Ziffer beginnen',
  'logs-not-a-list': () => '„logs“ muss eine Liste sein',
  'log-needs-path': () =>
    'Jedes Log braucht einen „path“, der relativ ist und innerhalb des Repositorys liegt',
  'naming-unknown': (v) => `„naming“ muss sequential oder date sein, nicht „${v.naming}“`,

  // Structure: Adopt, Repair and Rename.
  'declared-already': () => 'Die Komponenten dieses Repositorys sind bereits deklariert.',
  'nothing-to-adopt': () => 'Es gibt nichts zu übernehmen: Der Entwurf hat keine Komponenten.',
  'adopt-over-unreadable': (v) =>
    `${v.path} ist vorhanden und kann nicht gelesen werden. Übernehmen würde überschreiben, was jemand geschrieben hat; die Datei muss zuerst korrigiert werden.`,
  'no-repair': () =>
    'Dieses Problem hat keine Reparatur: Die Suite kann nicht wissen, was gemeint war.',
  'not-a-segment': (v) =>
    `„${v.segment}“ ist kein gültiges Segment einer Komponenten-ID. ${SEGMENT_RULE}`,
  'rename-needs-declaration': () =>
    'Nur eine deklarierte Komponente kann umbenannt werden. Zuerst muss der Entwurf übernommen werden.',
  'not-declared': (v) =>
    `${v.path} deklariert keine Komponente ${v.id}. Die Datei sollte neu angesehen werden.`,
  'segment-unchanged': (v) => `${v.id} hat dieses Segment bereits.`,
  'component-exists': (v) => `Es gibt bereits eine Komponente ${v.id}.`,
  'declared-by-now': (v) =>
    `${v.path} deklariert inzwischen Komponenten. Die Datei sollte neu angesehen werden.`,
  'cannot-add-components': (v) =>
    `${v.path} ist so geschrieben, dass die Suite keine Komponenten hinzufügen kann. Die Komponenten müssen in einem Editor hinzugefügt werden, oder die Datei wird entfernt und der Entwurf erneut übernommen.`,
  'no-pattern-list': (v) =>
    `${v.component} hat keine Liste „${v.key}“ mehr. Die Datei sollte neu angesehen werden.`,
  'pattern-gone': (v) => `„${v.pattern}“ steht nicht mehr in ${v.key} von ${v.component}.`,
  'cannot-rename-in': (v) =>
    `${v.path} ist so geschrieben, dass die Suite ${v.id} darin nicht umbenennen kann. Das Segment muss in einem Editor geändert werden.`,
  'pattern-by-hand': () =>
    'Die Liste ist so geschrieben, dass die Suite keinen Eintrag herausnehmen kann. Das Muster muss in einem Editor entfernt werden.',

  // The Problems of Structure.
  'unreadable-declaration': (v) => `${v.path} kann nicht gelesen werden: ${german(v.detail)}`,
  'invalid-segment': (v) =>
    `„${v.segment}“ in ${v.component} ist kein gültiges Segment einer Komponenten-ID. ${SEGMENT_RULE}`,
  'duplicate-component': (v) =>
    `${v.component} ist zweimal deklariert. Gelesen wird die erste Deklaration.`,
  'dead-pattern': (v) =>
    `Das Muster „${v.pattern}“ in ${v.key} von ${v.component} trifft keine Quelldatei.`,
  'pattern-outside-repository': (v) =>
    `Das Muster „${v.pattern}“ in ${v.key} von ${v.component} ist absolut oder verlässt das Repository. Es trifft nichts.`,
  'overlapping-components': (v) =>
    v.files.length === 1
      ? `${v.first} und ${v.second} beanspruchen beide ${v.files[0]}. Bis eine der beiden nachgibt, gilt die Datei als nicht zugeordnet.`
      : `${v.first} und ${v.second} beanspruchen beide ${v.files.length} Quelldateien. Bis eine der beiden nachgibt, gelten diese Dateien als nicht zugeordnet.`,
  'empty-component': (v) => `${v.component} hat weder paths noch components.`,

  // Why the declaration cannot be read: the rest of a sentence about the file.
  'not-yaml': (v) => `es ist kein gültiges YAML: ${v.message}`,
  'top-not-map': () => 'die oberste Ebene muss ein Mapping sein',
  'components-not-map': () => '„components“ muss ein Mapping von Komponenten sein',
  'component-not-map': (v) => `${v.id} muss ein Mapping seiner Schlüssel sein`,
  'children-not-map': (v) => `„components“ von ${v.id} muss ein Mapping von Komponenten sein`,
  'key-not-text': (v) => `„${v.key}“ von ${v.id} muss ein Text sein`,
  'key-not-patterns': (v) => `„${v.key}“ von ${v.id} muss eine Liste von Mustern sein`,

  // Why a Java file cannot be read.
  'java-missing': (v) => `Es fehlt: ${v.what}.`,
  'java-unreadable': () => 'Syntax, die nicht gelesen werden kann.',
  // Why a Python or a Go file cannot be read, as for Java.
  'python-missing': (v) => `Es fehlt: ${v.what}.`,
  'python-unreadable': () => 'Syntax, die nicht gelesen werden kann.',
  'go-missing': (v) => `Es fehlt: ${v.what}.`,
  'go-unreadable': () => 'Syntax, die nicht gelesen werden kann.',
  // Why a file of any language could not be read to its end.
  'nested-too-deep': () =>
    'Sie ist für ihren Parser zu tief verschachtelt: dem Parser ging der Stack aus.',
  'reader-failed': (v) => `Ihr Leser ist an ihr gescheitert: ${v.message}`,

  // The Problems of Diagrams.
  'invalid-diagrams-directory': (v) =>
    `„diagrams“ in ${v.path} muss ein relativer Pfad innerhalb des Repositorys sein. Bis das korrigiert ist, wird nach keinem Diagramm gesucht.`,
  'unreadable-diagram': (v) => `${v.path} kann nicht gelesen werden: ${german(v.detail)}.`,
  'no-level': () => `Das Diagramm hat keine Ebene. Eine Ebene ist ${LEVELS}.`,
  'unknown-level': (v) =>
    `Das Diagramm hat die Ebene „${v.level}“, die die Suite nicht kennt. Eine Ebene ist ${LEVELS}.`,
  'no-scope': () =>
    'Das Diagramm ist eine Komponentensicht und hat keinen scope: Es sagt nicht, in welche Komponente es hineinsieht.',
  'scope-without-component-level': (v) =>
    `Das Diagramm ist ${viewOf(v.level)} und hat einen scope, den nur eine Komponentensicht hat. Der scope wird nicht gelesen.`,
  'invalid-element-id': (v) => `„${v.id}“ ist keine gültige Element-ID. ${ELEMENT_ID_RULE}`,
  'duplicate-element': (v) => `${v.id} wird zweimal gezeigt. Gelesen wird das erste.`,
  'self-connection': (v) =>
    `Die Verbindung von ${v.id} zu ${v.id} wird nicht gezeichnet: Ein Element verwendet sich nicht selbst.`,
  'unknown-element': (v) =>
    `Die Verbindung von ${v.from} zu ${v.to} nennt ${v.id}, das kein Element des Diagramms ist. Sie wird nicht gezeichnet.`,
  'duplicate-connection': (v) =>
    `Das Diagramm verbindet ${v.from} zweimal mit ${v.to}. Gelesen wird die erste Verbindung.`,
  'component-gone': (v) =>
    `Das Diagramm zeigt ${v.component}, das keine deklarierte Komponente ist.`,
  'unknown-scope': (v) =>
    `Das Diagramm sieht in ${v.component} hinein, das keine deklarierte Komponente ist.`,
  'component-does-not-fit': (v) =>
    v.level === 'system-context'
      ? `${v.component} gehört nicht in einen Systemkontext, der das Repository als einen Kasten und keine Komponente zeigt.`
      : v.level === 'container'
        ? `${v.component} gehört nicht in eine Containersicht, die die Komponenten an der Spitze der Hierarchie zeigt.`
        : `${v.component} gehört nicht in die Komponentensicht von ${v.scope}, die die Teile von ${v.scope} zeigt und die Komponenten neben ihr und neben dem, was sie enthält.`,
  'repository-does-not-fit': (v) =>
    `Das Repository ${v.id} steht für jede Komponente, und nur ein Systemkontext zeigt es.`,

  'stale-picture': (v) =>
    `${v.picture} ist nicht das Bild des Diagramms, wie es jetzt ist: Das Diagramm oder seine Komponenten haben sich nach dem Export geändert. Es muss neu exportiert werden.`,

  // Why a Diagram cannot be read: the rest of a sentence about the file.
  'diagram-not-yaml': (v) => `es ist kein gültiges YAML: ${v.message}`,
  'diagram-not-map': () => 'die oberste Ebene muss ein Mapping sein',
  'diagram-key-not-text': (v) => `„${v.key}“ in Zeile ${v.line} muss ein Text sein`,
  'diagram-key-not-list': (v) => `„${v.key}“ in Zeile ${v.line} muss eine Liste sein`,
  'key-twice': (v) => `„${v.key}“ steht in Zeile ${v.line} ein zweites Mal`,
  'diagram-item-not-map': (v) =>
    `der Eintrag von „${v.key}“ in Zeile ${v.line} muss ein Mapping sein`,
  'element-without-kind': (v) =>
    `das Element in Zeile ${v.line} sagt weder component noch external noch repository`,
  'element-of-two-kinds': (v) =>
    `das Element in Zeile ${v.line} sagt mehr als eines von component, external und repository`,
  'element-without-position': (v) => `das Element in Zeile ${v.line} hat keine Position „at“`,
  'position-not-a-point': (v) =>
    `„at“ in Zeile ${v.line} muss aus zwei Zahlen bestehen, [x, y], jede zwischen -1000000 und 1000000`,
  'size-not-positive': (v) =>
    `„size“ in Zeile ${v.line} muss aus zwei positiven Zahlen bestehen, [Breite, Höhe], jede bis 1000000`,
  'connection-without-end': (v) => `die Verbindung in Zeile ${v.line} hat kein „${v.key}“`,

  // Drift.
  'connection-not-in-code': (v) =>
    `Das Diagramm verbindet ${v.from} mit ${v.to}, aber keine Quelldatei von ${v.from} hängt von einer von ${v.to} ab.`,
  'connection-perhaps-not-in-code': (v) =>
    `Das Diagramm verbindet ${v.from} mit ${v.to}. Von keiner Quelldatei von ${v.from} ist bekannt, dass sie von einer von ${v.to} abhängt, aber sicher ist das nicht: ${[
      v.notResolved > 0 &&
        `${v.notResolved === 1 ? 'eine Verwendung' : `${v.notResolved} Verwendungen`} in ${v.from} ${v.notResolved === 1 ? 'kann' : 'können'} nicht aufgelöst werden`,
      v.notAnalysed > 0 &&
        `${v.notAnalysed === 1 ? 'eine Quelldatei' : `${v.notAnalysed} Quelldateien`} von ${v.from} ${v.notAnalysed === 1 ? 'kann' : 'können'} nicht gelesen werden`
    ]
      .filter((part) => part !== false)
      .join(', und ')}.`,
  'dependency-not-in-diagram': (v) =>
    `${v.from} hängt im Code von ${v.to} ab, über ${dependenciesIn(v.count)}, und das Diagramm verbindet sie nicht.`,
  'scope-dependency-not-in-diagram': (v) =>
    v.from === v.scope
      ? `Die eigenen Dateien von ${v.scope} hängen im Code von ${v.to} ab, über ${dependenciesIn(v.count)}, und das Diagramm verbindet keinen Teil von ${v.scope} mit ${v.to}.`
      : `${v.from} hängt im Code von den eigenen Dateien von ${v.scope} ab, über ${dependenciesIn(v.count)}, und das Diagramm verbindet ${v.from} mit keinem Teil von ${v.scope}.`,

  // Diagrams: the Repair.
  'no-diagram-repair': () =>
    'Dieses Problem hat keine Reparatur: Die Suite kann nicht wissen, was gemeint war.',
  'no-longer-shows': (v) =>
    `${v.path} zeigt ${v.component} nicht mehr. Die Datei sollte neu angesehen werden.`,
  'no-export-without-declaration': (v) =>
    `${v.path} kann nicht gelesen werden, darum hätte das Bild nicht die Namen seiner Komponenten. Vor dem Export muss die Datei korrigiert werden.`,
  'cannot-remove-element': (v) =>
    `${v.path} ist so geschrieben, dass die Suite ${v.component} nicht herausnehmen kann. Es muss mit seinen Verbindungen in einem Editor entfernt werden.`,

  // Diagrams: the edits of the window and of agents.
  'cannot-edit-diagram': (v) =>
    `Die Suite kann in ${v.path} nicht ${german(v.edit)}, ohne mehr von der Datei neu zu schreiben als die Zeilen der Änderung. Diese Änderung muss in einem Editor gemacht werden.`,
  'editing-move': (v) => `${v.id} verschieben`,
  'editing-add': (v) => `${v.id} hinzufügen`,
  'editing-remove': (v) => `${v.id} herausnehmen`,
  'editing-describe': (v) => `den Namen oder die Beschreibung von ${v.id} ändern`,
  'editing-connect': (v) => `${v.from} mit ${v.to} verbinden`,
  'editing-disconnect': (v) => `die Verbindung von ${v.from} zu ${v.to} herausnehmen`,
  'editing-label': (v) => `die Verbindung von ${v.from} zu ${v.to} beschriften`,
  'invalid-position': () =>
    'Eine Position sind zwei Zahlen, [x, y], jede zwischen -1000000 und 1000000.',
  'already-shown': (v) => `${v.path} zeigt ${v.id} schon.`,
  'named-by-declaration': (v) =>
    `Name und Beschreibung von ${v.id} sind die seiner Deklaration in .arch/components.yml, nicht die des Diagramms.`,
  'connected-to-itself': (v) =>
    `Ein Element benutzt sich nicht selbst: ${v.id} kann nicht mit ${v.id} verbunden werden.`,
  'already-connected': (v) => `Das Diagramm verbindet ${v.from} schon mit ${v.to}.`,
  'not-connected': (v) =>
    `${v.path} verbindet ${v.from} nicht mit ${v.to}. Die Datei sollte neu angesehen werden.`,

  // Diagrams: a new Diagram, and the Rename of a Component in the Diagrams.
  'invalid-diagram-id': (v) =>
    `„${v.id}“ ist keine gültige Diagramm-ID. Eine Diagramm-ID besteht aus Kleinbuchstaben, Ziffern und Bindestrichen und beginnt und endet mit einem Buchstaben oder einer Ziffer.`,
  'not-in-new-diagram': (v) =>
    `Das neue Diagramm verbindet ${v.from} mit ${v.to}, zeigt aber kein Element ${v.id}.`,
  'no-diagrams-directory': (v) =>
    `${v.path} nennt kein Verzeichnis für die Diagramme, das sich verwenden lässt, darum kann kein Diagramm geschrieben werden. Das muss zuerst korrigiert werden.`,
  'cannot-rename-in-diagram': (v) =>
    `${v.path} nennt ${v.component} so, dass die Suite es nicht an seiner Stelle umschreiben kann, etwa als Textblock. Es muss dort zuerst in einem Editor umbenannt werden.`,
  'diagram-not-renamed': (v) =>
    `${v.path} kann nicht gelesen werden, darum schreibt die Umbenennung nicht um, was es über ${v.component} sagt.`,

  // The Problems of Review.
  'invalid-annotations-directory': (v) =>
    `„annotations“ in ${v.path} muss ein relativer Pfad innerhalb des Repositorys sein. Bis das korrigiert ist, wird keine Annotation gelesen.`,
  'unreadable-annotation': (v) => `${v.path} kann nicht gelesen werden: ${german(v.detail)}.`,
  'invalid-type': (v) =>
    `${v.path}: „type“ muss note, question oder concern sein, nicht „${v.value}“.`,
  'invalid-state': (v) => `${v.path}: „state“ muss open oder resolved sein, nicht „${v.value}“.`,
  'invalid-key': (v) => `${v.path}: „${v.key}“ ${german(v.detail)}.`,
  'no-anchor': (v) => `${v.path} hat keinen Anker: „anchor“ braucht „path“ und „lines“.`,
  'invalid-anchor': (v) => `${v.path}: Der Anker ${german(v.detail)}.`,
  'no-quote': (v) =>
    `Der Text von ${v.path} beginnt nicht mit den zitierten Zeilen in einem geschlossenen Codeblock.`,
  'quote-does-not-match-lines': (v) =>
    `${v.path} zitiert ${v.quoted} ${v.quoted === 1 ? 'Zeile' : 'Zeilen'} für die Zeilen ${v.lines}, das sind ${v.count}.`,
  'unknown-adr': (v) => `${v.path} verweist auf ${v.adr}, das kein ADR dieses Repositorys ist.`,
  'ambiguous-adr': (v) =>
    `${v.path} verweist auf ${v.adr}, das es in mehreren Decision Logs gibt: ${listed(v.candidates)}. Es muss mit seinem Log genannt werden.`,
  orphaned: (v) =>
    v.file === 'gone'
      ? `${v.annotation} ist verwaist: ${v.path} gibt es nicht mehr, auch nicht unter einem neuen Namen mit den zitierten Zeilen. ${ATTACH_AGAIN}`
      : `${v.annotation} ist verwaist: Die zitierten Zeilen ${v.lines} von ${v.path} werden darin nicht mehr gefunden. ${ATTACH_AGAIN}`,
  'unreadable-reply': (v) => `${v.path} kann nicht gelesen werden: ${german(v.detail)}.`,
  'replies-without-annotation': (v) =>
    `${v.path} enthält Antworten auf ${v.annotation}, aber es gibt keine Annotation ${v.annotation}.`,

  // Why an Annotation's file cannot be read, or a value is wrong: the rest of a sentence about it.
  'no-frontmatter': () => 'es hat kein Frontmatter',
  'frontmatter-open': () => 'sein Frontmatter wird nie geschlossen',
  'frontmatter-yaml': (v) => `sein Frontmatter ist kein gültiges YAML: ${v.message}`,
  'frontmatter-mapping': () => 'sein Frontmatter muss ein Mapping sein',
  'needs-text': () => 'muss ein Text sein',
  'needs-day': () => 'muss ein Datum der Form YYYY-MM-DD sein',
  'needs-adr-list': () => 'muss eine Liste von ADRs sein',
  'anchor-path': () => 'nennt einen Pfad, der absolut ist oder das Repository verlässt',
  'anchor-lines': () => 'muss seine Zeilen als Zahl oder als Bereich wie 12-18 angeben',
  'anchor-commit': () =>
    'muss seinen Commit mit dessen vollem Namen aus 40 oder 64 Hexadezimalziffern nennen',

  // Why an operation on Annotations is refused.
  'annotations-unavailable': (v) =>
    `Die Annotationen können nicht geschrieben werden: ${german(v.detail)}`,
  'no-annotation': (v) => `Es gibt keine Annotation ${v.id}.`,
  'annotation-unreadable': (v) =>
    `${v.path} kann nicht gelesen werden. Die Datei muss korrigiert werden, bevor die Suite hineinschreibt.`,
  'annotation-needs-author': () =>
    'Eine Annotation braucht den Namen ihrer Autorin oder ihres Autors.',
  'reply-needs-author': () => 'Eine Antwort braucht den Namen ihrer Autorin oder ihres Autors.',
  'reply-needs-text': () => 'Eine Antwort braucht einen Text.',
  'not-a-day': (v) => `„${v.date}“ ist kein Datum der Form YYYY-MM-DD.`,
  'not-a-time': (v) =>
    `„${v.time}“ ist kein Zeitpunkt der Form YYYY-MM-DDTHH:MM:SS mit Z oder einer Verschiebung wie +01:00.`,
  'no-source-file': (v) => `${v.path} ist keine Datei dieses Repositorys.`,
  'no-lines': (v) =>
    `${v.lines} sind keine Zeilen: Anzugeben sind die erste und die letzte, gezählt ab 1.`,
  'lines-outside': (v) =>
    `${v.path} hat ${v.count} ${v.count === 1 ? 'Zeile' : 'Zeilen'}; die Zeilen ${v.lines} liegen nicht darin.`,
  'carriage-return-in-lines': (v) =>
    `Die Zeilen ${v.lines} von ${v.path} enthalten einen Wagenrücklauf, der keine Zeile beendet; zitierte Zeilen können ihn nicht behalten.`,
  'resolved-already': (v) => `${v.id} hat bereits den Zustand resolved.`,
  'open-already': (v) => `${v.id} hat bereits den Zustand open.`,
  'cited-already': (v) => `${v.id} verweist bereits auf ${v.adr}.`,
  'not-cited': (v) => `${v.id} verweist nicht auf ${v.adr}.`,
  'no-such-adr': (v) => `${v.adr} ist kein ADR dieses Repositorys.`,
  'adr-in-several-logs': (v) =>
    `${v.adr} gibt es in mehreren Decision Logs: ${listed(v.candidates)}. Es muss mit seinem Log genannt werden.`,
  'key-by-hand': (v) =>
    `„${v.key}“ in ${v.path} ist so geschrieben, dass die Suite es nicht an seiner Stelle ändern kann. Es muss in einem Editor geändert werden.`,
  'not-moved': (v) => `${v.id} steht, wo sein Anker es sagt: Es gibt nichts zu aktualisieren.`,
  'without-repair': () =>
    'Dieses Problem hat keine Reparatur: Die Suite kann nicht wissen, was gemeint war.',

  // The Problems of Assessment.
  'invalid-directory-setting': (v) =>
    `„${v.key}“ in ${v.path} muss ein relativer Pfad innerhalb des Repositorys sein. Bis das korrigiert ist, wird ${kept(v.key)} gelesen.`,
  'unreadable-assessment': (v) => `${v.path} kann nicht gelesen werden: ${german(v.detail)}.`,
  'unreadable-risk': (v) => `${v.path} kann nicht gelesen werden: ${german(v.detail)}.`,
  'unreadable-debt-item': (v) => `${v.path} kann nicht gelesen werden: ${german(v.detail)}.`,
  'invalid-frontmatter-value': (v) => `${v.path}: „${v.key}“ ${german(v.detail)}.`,
  'assessment-without-date': (v) =>
    `${v.path} hat kein Datum: „date“ muss den Tag des Assessments als YYYY-MM-DD nennen.`,
  'unreadable-entry': (v) =>
    `${v.path}, Zeile ${v.line}: Der Block eines Eintrags kann nicht gelesen werden: ${german(v.detail)}.`,
  'entry-of-two-kinds': (v) =>
    `${v.path}, Zeile ${v.line}: Ein Block ist entweder ein Qualitätsszenario oder ein Befund und hat hier sowohl „scenario“ als auch „finding“.`,
  'entry-without-heading': (v) =>
    `${v.path}, Zeile ${v.line}: Der Block von ${v.entry} folgt nicht unmittelbar auf eine Überschrift der Ebenen 2 bis 6, die dem Eintrag seinen Titel gibt.`,
  'invalid-entry-id': (v) =>
    `${v.path}, Zeile ${v.line}: „${v.entry}“ ist keine ID eines Eintrags: Buchstaben, Ziffern, „.“, „_“ und „-“, am Anfang ein Buchstabe oder eine Ziffer.`,
  'duplicate-entry': (v) =>
    `${v.path}, Zeile ${v.line}: ${v.entry} steht zweimal unter den ${v.of === 'finding' ? 'Befunden' : 'Qualitätsszenarien'}. Es gilt der erste.`,
  'missing-entry-key': (v) =>
    `${v.path}: ${v.entry} hat kein „${v.key}“, das ein Qualitätsszenario braucht.`,
  'invalid-entry-value': (v) => `${v.path}: ${v.entry}: „${v.key}“ ${german(v.detail)}.`,
  'unknown-quality-attribute': (v) =>
    `${v.path}: ${v.entry} handelt von „${v.value}“, doch das ist weder ein Qualitätsmerkmal noch ein Teilmerkmal der ISO/IEC 25010.`,
  'invalid-evidence': (v) =>
    `${v.path}, Zeile ${v.line}: Ein Beleg von ${v.entry} ${german(v.detail)}.`,
  'unreadable-snapshot': (v) => `${v.path} kann nicht gelesen werden: ${german(v.detail)}.`,
  'snapshot-without-assessment': (v) =>
    `${v.path} ist der Snapshot von ${v.assessment}, und es gibt kein Assessment ${v.assessment}.`,
  'names-no-component': (v) =>
    `${v.path} nennt in „${v.key}“ die Komponente ${v.component}, die nicht deklariert ist.`,
  'unknown-previous-assessment': (v) =>
    `${v.path} folgt auf das Assessment ${v.previous}, das es in diesem Repository nicht gibt.`,
  'finding-unknown-scenario': (v) =>
    `${v.path}: ${v.finding} betrifft das Qualitätsszenario ${v.scenario}, das es in diesem Assessment nicht gibt.`,
  'violation-gone': (v) =>
    `${v.path}: ${v.finding} stützt sich auf den Verstoß ${v.violation}, den der Code nicht mehr hat. Der Befund sollte neu angesehen werden: Vielleicht ist er erledigt.`,
  'metric-not-in-snapshot': (v) =>
    `${v.path}: ${v.finding} stützt sich auf die Metrik ${v.metric} von ${v.subject}, die der Snapshot des Assessments nicht enthält.`,
  'metric-not-measured': (v) =>
    `${v.path}: ${v.finding} stützt sich auf die Metrik ${v.metric} von ${v.subject}, die der Code nicht hat.`,
  'final-without-snapshot': (v) =>
    `${v.path} ist final und stützt sich auf Metriken, hat aber keinen Snapshot, der sie festhält: Mit jedem Commit ergeben sie andere Werte.`,
  'finding-unknown-annotation': (v) =>
    `${v.path}: ${v.finding} stützt sich auf die Annotation ${v.target}, die es in diesem Repository nicht gibt.`,
  'finding-unknown-adr': (v) =>
    `${v.path}: ${v.finding} stützt sich auf das ADR ${v.target}, das es in diesem Repository nicht gibt.`,
  'finding-ambiguous-adr': (v) =>
    `${v.path}: ${v.finding} stützt sich auf das ADR ${v.target}, das es in mehreren Decision Logs gibt: ${listed(v.candidates)}. Es muss mit seinem Log genannt werden.`,
  'finding-unknown-risk': (v) =>
    `${v.path}: ${v.finding} stützt sich auf das Risiko ${v.target}, das es in diesem Repository nicht gibt.`,
  'finding-unknown-debt-item': (v) =>
    `${v.path}: ${v.finding} stützt sich auf den Schuldposten ${v.target}, den es in diesem Repository nicht gibt.`,

  // Why a file or a block of Assessment cannot be read: the rest of a sentence about it.
  'frontmatter-left-open': () => 'sein Frontmatter wird nie geschlossen',
  'frontmatter-not-valid-yaml': (v) => `sein Frontmatter ist kein gültiges YAML: ${v.message}`,
  'frontmatter-no-mapping': () => 'sein Frontmatter muss ein Mapping sein',
  'block-not-valid-yaml': (v) => `er ist kein gültiges YAML: ${v.message}`,
  'block-never-closed': () => 'sein Codeblock wird nie geschlossen',
  'in-comment-never-closed': () => 'er steht in einem HTML-Kommentar, der nie geschlossen wird',
  'snapshot-not-valid-yaml': (v) => `er ist kein gültiges YAML: ${v.message}`,
  'snapshot-no-mapping': () => 'seine oberste Ebene muss ein Mapping sein',
  'snapshot-commit-name': () =>
    'sein „commit“ muss den Commit mit dessen vollem Namen aus 40 oder 64 Hexadezimalziffern nennen',
  'snapshot-day': () => 'sein „date“ muss ein Datum der Form YYYY-MM-DD sein',
  'snapshot-numbers': (v) => `sein „${v.key}“ muss Namen auf Zahlen abbilden`,

  // Why a value of Assessment is wrong: the rest of a sentence about its key.
  'must-be-text': () => 'muss ein Text sein',
  'must-be-day': () => 'muss ein Datum der Form YYYY-MM-DD sein',
  'must-be-texts': () => 'muss eine Liste von Texten sein',
  'must-be-component-ids': () => 'muss eine Liste von Komponenten-IDs sein',
  'must-be-status': () => 'muss draft oder final sein',
  'must-be-risk-state': () => 'muss open, mitigated, accepted oder closed sein',
  'must-be-debt-state': () => 'muss open, scheduled oder paid-off sein',
  'must-be-assessment-id': () => 'muss die ID eines Assessments sein',
  'must-be-scenario-ids': () => 'muss eine Liste von IDs von Qualitätsszenarien sein',
  'must-be-evidence-list': () => 'muss eine Liste von Belegen sein',
  'must-be-level': () => 'muss H, M oder L sein',
  'must-be-rating': () => 'muss met, partly-met oder not-met sein',

  // What is wrong with a piece of evidence: the rest of a sentence about it.
  'evidence-not-a-mapping': () => 'ist kein Mapping',
  'evidence-of-no-kind': () => `nennt keines von ${listed(Object.keys(KIND))}`,
  'evidence-of-two-kinds': () => `nennt mehr als eines von ${listed(Object.keys(KIND))}`,
  'evidence-needs-key': (v) => `braucht „${v.key}“ als Text`,
  'evidence-needs-members': () =>
    'braucht „cycle“ als Liste der Mitglieder des Zyklus, mindestens zwei',
  'evidence-needs-subject': () =>
    'braucht, worum es geht: „from“ und „to“, „cycle“, „component“ oder „file“ und „name“',
  'evidence-needs-metric-subject': () =>
    'braucht, wovon die Metrik ist: „component“ oder „file“ und „name“',

  // Why an operation of Assessment is refused.
  'directory-unavailable': (v) => `Es kann ${kept(v.key)} geschrieben werden: ${german(v.detail)}`,
  'no-assessment': (v) => `Es gibt kein Assessment ${v.id}.`,
  'no-risk': (v) => `Es gibt kein Risiko ${v.id}.`,
  'no-debt-item': (v) => `Es gibt keinen Schuldposten ${v.id}.`,
  'no-scenario': (v) => `${v.assessment} hat kein Qualitätsszenario ${v.id}.`,
  'no-finding': (v) => `${v.assessment} hat keinen Befund ${v.id}.`,
  'file-needs-fixing': (v) =>
    `${v.path} kann nicht gelesen werden. Die Datei muss korrigiert werden, bevor die Suite hineinschreibt.`,
  'entry-needs-fixing': (v) =>
    `Der Block von ${v.id} in ${v.path} kann nicht gelesen werden. Er muss korrigiert werden, bevor die Suite hineinschreibt.`,
  'assessment-final': (v) =>
    `${v.id} ist final: Was es festhält, ist vollständig. In einem Editor kann es trotzdem geändert werden.`,
  'final-already': (v) => `${v.id} ist bereits final.`,
  'title-without-slug': (v) =>
    `Der Titel „${v.title}“ lässt keinen Namen für die Datei übrig: Er braucht einen Buchstaben oder eine Ziffer.`,
  'date-not-a-day': (v) => `„${v.date}“ ist kein Datum der Form YYYY-MM-DD.`,
  'assessment-needs-author': () =>
    'Ein Assessment braucht den Namen einer Autorin oder eines Autors.',
  'component-not-known': (v) => `${v.component} ist keine deklarierte Komponente.`,
  'components-need-declaration': () =>
    'Komponenten können erst genannt werden, wenn sie deklariert sind: Die IDs des Entwurfs sind keine Namen, die man aufschreibt.',
  'no-assessment-to-follow': () =>
    'Es gibt kein Assessment mit Datum, auf das ein neues folgen könnte.',
  'entry-id-invalid': (v) =>
    `„${v.id}“ ist keine ID eines Eintrags: Buchstaben, Ziffern, „.“, „_“ und „-“, am Anfang ein Buchstabe oder eine Ziffer.`,
  'entry-id-taken': (v) => `${v.assessment} hat bereits einen Eintrag ${v.id}.`,
  'entry-needs-title': () => 'Ein Eintrag braucht einen Titel, seine Überschrift.',
  'text-ends-entry': (v) =>
    `Der Text enthält eine Überschrift, die den Eintrag beenden würde: Unter einer Überschrift der Ebene ${v.level} brauchen seine eigenen Überschriften mehr als ${v.level} #.`,
  'text-left-open': () =>
    'Der Text öffnet einen Codeblock oder einen HTML-Kommentar, den er nicht schließt: Er würde alles darunter verbergen.',
  'scenario-needs-key': (v) => `Ein Qualitätsszenario braucht „${v.key}“.`,
  'not-a-quality-attribute': (v) =>
    `„${v.value}“ ist weder ein Qualitätsmerkmal noch ein Teilmerkmal der ISO/IEC 25010.`,
  'not-a-level': (v) => `„${v.value}“ ist keines von H, M und L.`,
  'not-a-rating': (v) => `„${v.value}“ ist keines von met, partly-met und not-met.`,
  'rating-unchanged': (v) => `${v.id} ist bereits so bewertet: Es gibt nichts zu ändern.`,
  'evidence-there-already': (v) =>
    `${v.finding} stützt sich bereits auf ${evidence(v.kind, v.name)}.`,
  'evidence-not-there': (v) =>
    `${Evidence(v.kind, v.name)} gibt es nicht, darum kann sich kein Befund darauf stützen.`,
  'evidence-ambiguous-adr': (v) =>
    `Das ADR ${v.adr} gibt es in mehreren Decision Logs: ${listed(v.candidates)}. Es muss mit seinem Log genannt werden.`,
  'evidence-incomplete': (v) =>
    `Der Beleg ist nicht vollständig: Ein Beleg der Art ${lookUp(KIND, v.kind)} braucht jeden Schlüssel, den diese Art nennt.`,
  'snapshot-without-values': () =>
    'Es gibt keine Metriken festzuhalten: Die Komponenten müssen deklariert sein und Quelldateien enthalten.',
  'state-unchanged': (v) => `${v.id} hat bereits den Zustand ${v.state}.`,
  'not-a-risk-state': (v) =>
    `„${v.state}“ ist kein Zustand eines Risikos: open, mitigated, accepted oder closed.`,
  'not-a-debt-state': (v) =>
    `„${v.state}“ ist kein Zustand eines Schuldpostens: open, scheduled oder paid-off.`,
  'value-by-hand': (v) =>
    `„${v.key}“ in ${v.path} ist so geschrieben, dass die Suite es nicht an seiner Stelle ändern kann. Es muss in einem Editor geändert werden.`,
  'cannot-rename-in-assessments': (v) =>
    `${v.path} nennt ${v.id} vielleicht dort, wo die Suite es nicht umschreiben kann: Die Datei kann nicht gelesen werden, oder die ID ist so geschrieben, dass kein Einfügen an ihrer Stelle möglich ist. Sie muss zuerst in einem Editor geändert werden.`,
  'has-no-repair': () =>
    'Dieses Problem hat keine Reparatur: Die Suite kann nicht wissen, was gemeint war.',
  'problem-no-longer-there': () => 'Das Problem besteht nicht mehr: Es gibt nichts zu reparieren.'
}

/** What a module said, in German; `undefined` for a code that has no German sentence. */
export function inGerman(said: Said): string | undefined {
  if (!Object.hasOwn(DE, said.code)) return undefined
  return (DE as unknown as Record<string, (values: unknown) => string>)[said.code]!(said.values)
}
