/**
 * A slug as an ADR's is made from its title (docs/file-format.md, section 7): lowercase, German
 * umlauts and `ß` written out, other accents dropped, everything that is not a letter or a
 * digit a dash, at most `max` characters. Empty when nothing is left.
 */
export function slugOf(text: string, max = 60): string {
  const written = text
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('Ä', 'Ae')
    .replaceAll('Ö', 'Oe')
    .replaceAll('Ü', 'Ue')
    .replaceAll('ß', 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return written.slice(0, max).replace(/-+$/, '')
}
