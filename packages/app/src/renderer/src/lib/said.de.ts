/**
 * What `core`, `structure` and `diagrams` say, in German: one sentence for every code they have,
 * taking the values their English sentence takes (docs/plan-roadmap.md, part 12). The compiler
 * asks for a sentence for every code; a code without one does not build.
 *
 * The vocabulary of the tool stays as it is: ADR, Decision Log, Status, Relation, Problem,
 * Migration, Frontmatter, Drift; Metadaten, Rückverweis, Reparatur, Korrektur, Vorlage,
 * Komponente, Entwurf, Quelldatei, Diagramm, Element, Verbindung. What names a value or a key of a
 * file — proposed, accepted, supersedes, affects, container, scope — is written as the file
 * writes it.
 */
import {
  STATUSES,
  type ForeignFormat,
  type Said,
  type SENTENCES as CORE_SENTENCES
} from '@adr-tool/core'
import type { STRUCTURE_SENTENCES } from '@adr-tool/structure/model'
import type { DIAGRAMS_SENTENCES } from '@adr-tool/diagrams'

/**
 * Every code of `core`, `structure` and `diagrams`, with the values of its sentence. The kernel's
 * codes are in each of them; they are taken once.
 */
type Codes = typeof CORE_SENTENCES &
  Omit<typeof STRUCTURE_SENTENCES, keyof typeof CORE_SENTENCES> &
  Omit<typeof DIAGRAMS_SENTENCES, keyof typeof CORE_SENTENCES>

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

/** What keeps a section in the text: `„Proposed“, „Clarifies […](…)“`. */
const quoted = (what: readonly string[]): string => what.map((one) => `„${one}“`).join(', ')

/** The Status as a sentence names it: one of the five values, or what is written, in quotes. */
/** A Status that is none of the five values comes in English quotes; German quotes it its own way. */
const germanQuotes = (is: string): string => is.replace(/^"(.*)"$/s, '„$1“')
const has = (v: { adr: string; is: string }): string =>
  `${v.adr} hat den Status ${germanQuotes(v.is)}.`

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
    `${v.path} verbindet ${v.from} nicht mit ${v.to}. Die Datei sollte neu angesehen werden.`
}

/** What a module said, in German; `undefined` for a code that has no German sentence. */
export function inGerman(said: Said): string | undefined {
  if (!Object.hasOwn(DE, said.code)) return undefined
  return (DE as unknown as Record<string, (values: unknown) => string>)[said.code]!(said.values)
}
