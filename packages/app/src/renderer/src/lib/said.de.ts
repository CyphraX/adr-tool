/**
 * What `core`, `structure` and `review` say, in German: one sentence for every code they have,
 * taking the values their English sentence takes (docs/plan-roadmap.md, part 12). The compiler
 * asks for a sentence for every code; a code without one does not build.
 *
 * The vocabulary of the tool stays as it is: ADR, Decision Log, Status, Relation, Problem,
 * Migration, Frontmatter, Annotation; Metadaten, Rückverweis, Reparatur, Korrektur, Vorlage,
 * Komponente, Entwurf, Quelldatei, Antwort, Anker, zitierte Zeilen, verwaist, neu anheften. What
 * names a value or a key of a file — proposed, accepted, supersedes, affects, resolved — is
 * written as the file writes it.
 */
import {
  STATUSES,
  type ForeignFormat,
  type Said,
  type SENTENCES as CORE_SENTENCES
} from '@adr-tool/core'
import type { REVIEW_SENTENCES } from '@adr-tool/review'
import type { STRUCTURE_SENTENCES } from '@adr-tool/structure/model'

/**
 * Every code of `core`, `structure` and `review`, with the values of its sentence. The kernel's
 * codes are in each; they are taken once.
 */
type Codes = typeof CORE_SENTENCES &
  Omit<typeof STRUCTURE_SENTENCES, keyof typeof CORE_SENTENCES> &
  Omit<typeof REVIEW_SENTENCES, keyof typeof CORE_SENTENCES>

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

/** What another sentence said, inside this one; a plain text is passed on as it is. */
const german = (said: Said | string): string =>
  typeof said === 'string' ? said : (inGerman(said) ?? said.code)

export const DE: Wording<Codes> = {
  // The kernel: what any operation may refuse.
  'already-exists': (v) => `${v.path} existiert bereits.`,
  'no-longer-exists': (v) => `${v.path} existiert nicht mehr.`,

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

  // The Problems of Review.
  'unreadable-configuration': (v) =>
    `${v.path} kann nicht gelesen werden: ${german(v.detail)}. Bis die Datei korrigiert ist, wird keine Annotation gelesen.`,
  'invalid-annotations-directory': (v) =>
    `„annotations“ in ${v.path} muss ein relativer Pfad innerhalb des Repositorys sein, nicht „${v.value}“. Bis das korrigiert ist, wird keine Annotation gelesen.`,
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
  'config-not-yaml': (v) => `es ist kein gültiges YAML: ${v.message}`,
  'config-not-mapping': () => 'die oberste Ebene muss ein Mapping sein',
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
  'no-source-file': (v) => `${v.path} ist keine Datei dieses Repositorys.`,
  'no-lines': (v) =>
    `${v.lines} sind keine Zeilen: Anzugeben sind die erste und die letzte, gezählt ab 1.`,
  'lines-outside': (v) =>
    `${v.path} hat ${v.count} ${v.count === 1 ? 'Zeile' : 'Zeilen'}; die Zeilen ${v.lines} liegen nicht darin.`,
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
    'Dieses Problem hat keine Reparatur: Die Suite kann nicht wissen, was gemeint war.'
}

/** What a module said, in German; `undefined` for a code that has no German sentence. */
export function inGerman(said: Said): string | undefined {
  if (!Object.hasOwn(DE, said.code)) return undefined
  return (DE as unknown as Record<string, (values: unknown) => string>)[said.code]!(said.values)
}
