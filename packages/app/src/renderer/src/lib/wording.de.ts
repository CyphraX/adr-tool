import {
  nextPrefix,
  type Adr,
  type Correction,
  type DecisionLog,
  type FileChange,
  type ForeignFormat,
  type ForeignSign,
  type Problem,
  type Repair
} from '@adr-tool/core'
import type { Wording } from './wording.en'

/**
 * What is said about the domain in German: the same as wording.en.ts, which explains it. The
 * values a file holds — a Status as written, a key such as `supersedes` — stay as the file
 * writes them; what they are called is German.
 */

const count = (files: number): string => (files === 1 ? 'eine Datei' : `${files} Dateien`)

/** `a`, `a und b`, `a, b und c`. */
const listed = (parts: readonly string[]): string =>
  parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} und ${parts.at(-1)}`

const FORMAT_NAMES: Record<ForeignFormat, string> = {
  'adr-tools': 'adr-tools',
  madr: 'MADR',
  'madr-2': 'MADR 2 oder log4brains'
}

const FOREIGN_SIGN: Record<ForeignSign, string> = {
  'status-section': 'kein Frontmatter und ein Abschnitt Status im Text',
  'successor-in-status': 'ein Status, der einen Nachfolger nennt',
  deciders: '„deciders“ statt „decision-makers“',
  'listed-status': 'sein Status in der Liste unter dem Titel',
  'listed-deciders': 'seine Deciders in der Liste unter dem Titel'
}

const FOREIGN_READING: Record<ForeignFormat, string> = {
  'adr-tools':
    'Sein Status, seine Relationen und Rückverweise und der Tag, an dem es angelegt wurde, werden von dort übernommen.',
  madr: 'Das wird gelesen, wie MADR es meint.',
  'madr-2':
    'Was seine Liste unter dem Titel sagt — Status, Deciders, die Tags von log4brains —, wird von dort übernommen, sofern das Frontmatter es nicht schon sagt, und seine Relationen aus den Links seines Abschnitts Links.'
}

const NO_REPAIR =
  'Das Werkzeug kann nicht wissen, was hier gemeint war. Korrigieren Sie das Frontmatter der Datei in einem Editor; die Ansicht folgt.'

const unreadable = (problem: Problem): boolean =>
  problem.kind === 'invalid-frontmatter' || problem.kind === 'unterminated-frontmatter'

/** What a Problem says in detail — the reason a file cannot be read — in German. */
const detailOf = (problem: { readonly detail: string }): string => problem.detail

/** Why an ADR of a foreign format cannot be migrated, as the rest of a sentence about it. */
const noMigrationOf = (adr: Pick<Adr, 'noMigration'>): string => adr.noMigration ?? ''

export const de: Wording = {
  status: {
    proposed: 'Vorgeschlagen',
    accepted: 'Angenommen',
    rejected: 'Abgelehnt',
    deprecated: 'Veraltet',
    superseded: 'Ersetzt',
    unknown: 'Unbekannter Status'
  },

  relation: {
    supersedes: { from: 'Ersetzt', to: 'Ersetzt durch' },
    amends: { from: 'Ergänzt', to: 'Ergänzt durch' },
    'depends-on': { from: 'Hängt ab von', to: 'Benötigt von' },
    'relates-to': { from: 'Bezieht sich auf', to: 'Bezug genommen von' }
  },

  pending: {
    supersedes: { from: 'Soll ersetzen', to: 'Ersetzung vorgeschlagen von' },
    amends: { from: 'Soll ergänzen', to: 'Ergänzung vorgeschlagen von' }
  },

  summarizeChange(files: readonly FileChange[]): string {
    const renamed = files.filter((file) => file.renameTo !== undefined).length
    const created = files.filter((file) => file.creates).length
    const changed = files.filter(
      (file) => !file.creates && file.renameTo === undefined && file.after !== file.before
    ).length
    const parts = [
      ...(renamed > 0 ? [`benennt ${count(renamed)} um`] : []),
      ...(created > 0 ? [`legt ${count(created)} an`] : []),
      ...(changed > 0 ? [`ändert ${count(changed)}`] : [])
    ]
    if (parts.length === 0) return 'Dies ändert nichts.'
    const untouched =
      changed > 0 ? ` Sonst bleibt ${changed === 1 ? 'an ihr' : 'an ihnen'} alles, wie es ist.` : ''
    return `Dies ${listed(parts)}.${untouched}`
  },

  describeCorrection({ date, author, note }: Correction): string {
    return `${date}${author ? ` von ${author}` : ''}${note ? `: ${note}` : ''}`
  },

  repairLabel(repair: Repair, log: DecisionLog): string {
    switch (repair.kind) {
      case 'lowercase-status':
        return 'In Kleinbuchstaben schreiben'
      case 'remove-item':
        return `${repair.item} aus ${repair.key} entfernen`
      case 'add-back-reference':
        return `${repair.item} zu ${repair.key} hinzufügen`
      case 'set-status':
        return `Status auf ${repair.status} setzen`
      case 'renumber':
        return `Auf ${nextPrefix(log, '')} umnummerieren`
    }
  },

  migrateLogHint:
    'ADRs in einem fremden Format, das das Werkzeug liest und nie schreibt. Die Migration schreibt sie in das eigene Format des Werkzeugs um und zeigt die Änderung vorher.',

  impliedNote: 'in jener Datei festgehalten, nicht in dieser',

  describeForeign(adr: Adr): string {
    if (!adr.foreign) return ''
    const signs = listed((adr.foreignSigns ?? []).map((sign) => FOREIGN_SIGN[sign]))
    const read = `Gelesen als Datei von ${FORMAT_NAMES[adr.foreign]}${signs ? `: ${signs}` : ''}. ${FOREIGN_READING[adr.foreign]} Das Werkzeug schreibt dieses Format nie.`
    return adr.noMigration === undefined
      ? `${read} Die Migration schreibt die Datei in das eigene Format des Werkzeugs um und zeigt die Änderung vorher.`
      : `${read} Dieses ADR ${noMigrationOf(adr)}`
  },

  noRepairIn(adr: Pick<Adr, 'foreign' | 'noMigration'>): string {
    if (!adr.foreign) return NO_REPAIR
    const never = `Das Werkzeug liest das Format von ${FORMAT_NAMES[adr.foreign]} und schreibt es nie.`
    return adr.noMigration === undefined
      ? `${never} Migrieren Sie das ADR und sehen Sie wieder nach: Ein Problem, das eine Reparatur hat, bekommt sie dann angeboten. Was das Werkzeug nicht wissen kann — ein Status, der keiner der fünf ist —, wird von Hand korrigiert, vorher oder nachher.`
      : `${never} Korrigieren Sie die Datei in einem Editor; die Ansicht folgt.`
  },

  noRepair: NO_REPAIR,

  describeProblem(problem: Problem): string {
    switch (problem.kind) {
      case 'unterminated-frontmatter':
        return 'Das Frontmatter beginnt mit --- und wird nie geschlossen. Metadaten lassen sich erst lesen oder schreiben, wenn das behoben ist.'
      case 'invalid-frontmatter':
        return `Das Frontmatter lässt sich nicht lesen: ${detailOf(problem)}`
      case 'invalid-metadata':
        return `${problem.key}: ${detailOf(problem)}`
      case 'status-not-lowercase':
        return `Der Status ist „${problem.written}“ geschrieben. Er muss in Kleinbuchstaben stehen.`
      case 'unknown-target':
        return `${problem.key} nennt ${problem.target}, das nicht in diesem Decision Log steht.`
      case 'self-reference':
        return `${problem.key} nennt dieses ADR selbst.`
      case 'unknown-component':
        return `affects nennt ${problem.component}, aber das ist keine deklarierte Komponente.`
      case 'missing-back-reference':
        return `${problem.source} ist angenommen und verweist hierher, aber ${problem.key} führt es nicht auf.`
      case 'unfounded-back-reference':
        return `${problem.key} führt ${problem.source} auf, das keine solche Relation in Kraft hat.`
      case 'not-marked-superseded':
        return `${problem.source} ist angenommen und ersetzt dieses ADR, aber sein Status ist nicht superseded.`
      case 'superseded-without-successor':
        return 'Der Status ist superseded, aber kein angenommenes ADR ersetzt dieses.'
      case 'supersedes-cycle':
        return `Diese ADRs ersetzen einander im Kreis: ${problem.adrs.join(', ')}.`
      case 'duplicate-number':
        return `Die Nummer ${problem.number} wird von ${listed(problem.adrs)} verwendet.`
      case 'invalid-configuration':
        return `${problem.path} ist nicht verwendbar: ${detailOf(problem)}`
      case 'missing-log-directory':
        return `Der konfigurierte Ordner ${problem.path} existiert nicht.`
    }
  },

  describeConsequences(root: Problem): string {
    return unreadable(root)
      ? 'Nur gemeldet, weil sich diese Datei nicht lesen lässt. Korrigieren Sie zuerst ihr Frontmatter und sehen Sie dann wieder nach: Manches davon kann sich als echt erweisen.'
      : 'Nur gemeldet, weil der Status dieser Datei keiner der fünf Werte ist, was ihre Relationen aufhebt. Korrigieren Sie zuerst den Status und sehen Sie dann wieder nach: Manches davon kann sich als echt erweisen.'
  },

  describeCause(root: Problem): string {
    const adr = 'adr' in root ? root.adr : ''
    return unreadable(root)
      ? `Nur gemeldet, weil sich das Frontmatter von ${adr} nicht lesen lässt.`
      : `Nur gemeldet, weil der Status von ${adr} keiner der fünf Werte ist, was seine Relationen aufhebt.`
  }
}
