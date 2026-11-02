/**
 * The style sheet of the export: the app's two voices and its Status colours, with fonts the
 * reader's system has, since the export fetches nothing. Printed, every ADR starts a page.
 */
export const STYLE = `:root {
  color-scheme: light dark;
  --paper: #fcfcfd;
  --panel: #eef1f5;
  --line: #dde2ea;
  --ink: #1c2230;
  --ink-soft: #566075;
  --ink-faint: #8891a3;
  --link: #2f5f8a;
  --proposed: #a2650f;
  --accepted: #25764a;
  --rejected: #b0382f;
  --deprecated: #787063;
  --superseded: #586789;
  --unknown: #6b7385;
  --ui: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --document: 'IBM Plex Serif', Georgia, 'Times New Roman', serif;
  --code: 'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --paper: #181a20;
    --panel: #1f222a;
    --line: #2c313c;
    --ink: #e4e7ee;
    --ink-soft: #a5aec0;
    --ink-faint: #737d91;
    --link: #8fb0e0;
    --proposed: #e2aa4f;
    --accepted: #62c088;
    --rejected: #f08378;
    --deprecated: #a9a194;
    --superseded: #96a7cb;
    --unknown: #98a1b3;
  }
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--panel);
  color: var(--ink);
  font-family: var(--ui);
  font-size: 15px;
  line-height: 1.5;
}

a { color: var(--link); }

header.site, main, nav.pages, footer {
  max-width: 52rem;
  margin: 0 auto;
  padding: 0 1.25rem;
}

header.site { padding-top: 2.5rem; padding-bottom: 1rem; }
header.site h1 { margin: 0 0 0.25rem; font-size: 1.75rem; }
header.site p { margin: 0; color: var(--ink-soft); }

.count { color: var(--ink-faint); font-weight: 400; font-size: 0.85em; }

section.log { margin: 1.5rem 0 2.5rem; }
section.log h2 { font-size: 1.15rem; font-family: var(--code); border-bottom: 1px solid var(--line); padding-bottom: 0.4rem; }
section.group h3 { font-size: 0.95rem; margin: 1.25rem 0 0.4rem; }
section.group table { width: 100%; border-collapse: collapse; background: var(--paper); border: 1px solid var(--line); border-radius: 6px; }
section.group td { padding: 0.45rem 0.75rem; border-top: 1px solid var(--line); vertical-align: baseline; }
section.group tr:first-child td { border-top: 0; }
td.number { width: 4.5rem; color: var(--ink-faint); font-family: var(--code); font-size: 0.85em; }
td.date { width: 7.5rem; color: var(--ink-faint); text-align: right; white-space: nowrap; font-size: 0.85em; }

.status { font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.8rem; color: var(--unknown); }
.status.proposed { color: var(--proposed); }
.status.accepted { color: var(--accepted); }
.status.rejected { color: var(--rejected); }
.status.deprecated { color: var(--deprecated); }
.status.superseded { color: var(--superseded); }

nav.pages { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; padding-top: 1.25rem; font-size: 0.9rem; }
nav.pages a[rel='next'] { margin-left: auto; }

article.adr {
  max-width: 52rem;
  margin: 1rem auto 2rem;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 1.75rem 2.25rem 2.25rem;
}
main article.adr { margin-left: 0; margin-right: 0; }
article.adr header { border-bottom: 1px solid var(--line); padding-bottom: 1rem; margin-bottom: 1.25rem; }
article.adr .id { margin: 0 0 0.5rem; color: var(--ink-faint); font-family: var(--code); font-size: 0.85rem; }
article.adr .id .path { margin-left: 0.75rem; }
article.adr .status { margin: 0 0 0.75rem; font-size: 0.9rem; }

dl.facts, dl.relations { display: grid; grid-template-columns: max-content 1fr; gap: 0.2rem 1rem; margin: 0.5rem 0 0; font-size: 0.9rem; }
dl.facts div, dl.relations div { display: contents; }
dt { color: var(--ink-soft); }
dd { margin: 0; }
dd .log { color: var(--ink-faint); font-family: var(--code); font-size: 0.85em; margin-left: 0.5rem; }
details.corrections { margin-top: 0.75rem; font-size: 0.9rem; color: var(--ink-soft); }
details.corrections ul { margin: 0.4rem 0 0; padding-left: 1.25rem; }

.body { font-family: var(--document); font-size: 1.05rem; line-height: 1.6; }
.body h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 1rem; }
.body h2 { font-size: 1.2rem; margin: 1.75rem 0 0.5rem; }
.body h3 { font-size: 1.05rem; margin: 1.25rem 0 0.4rem; }
.body img { max-width: 100%; }
.body code { font-family: var(--code); font-size: 0.88em; background: var(--panel); padding: 0.05em 0.3em; border-radius: 3px; }
.body pre { background: var(--panel); padding: 0.75rem 1rem; border-radius: 6px; overflow-x: auto; line-height: 1.4; }
.body pre code { background: none; padding: 0; }
.body table { border-collapse: collapse; font-family: var(--ui); font-size: 0.9rem; }
.body th, .body td { border: 1px solid var(--line); padding: 0.3rem 0.6rem; text-align: left; }
.body blockquote { margin: 0; padding-left: 1rem; border-left: 3px solid var(--line); color: var(--ink-soft); }
.body a[title]:not([href]) { color: inherit; text-decoration: underline dotted; }

footer { padding-top: 1rem; padding-bottom: 2.5rem; color: var(--ink-faint); font-size: 0.8rem; }

@page { size: A4; margin: 18mm 16mm; }

@media print {
  :root { color-scheme: light; }
  body { background: #fff; color: #000; font-size: 10.5pt; }
  nav.pages, footer { display: none; }
  main, header.site { max-width: none; padding: 0; }
  article.adr { max-width: none; margin: 0; border: 0; border-radius: 0; padding: 0; background: none; }
  .print article.adr + article.adr { break-before: page; }
  article.adr header, dl.facts, dl.relations { break-inside: avoid; }
  .body pre, .body table, .body img, .body blockquote { break-inside: avoid; }
  .body h2, .body h3 { break-after: avoid; }
  details.corrections > *:not(summary) { display: block; }
  a { color: inherit; text-decoration: none; }
}
`

/**
 * What a page needs for a drawn Mermaid block (docs/adr/0016-…), added to the style sheet only
 * when the export has one: an export without drawings, `adr export`'s among them, is written as
 * before. A drawing stands on light paper, which it was drawn for, in either scheme.
 */
export const DIAGRAM_STYLE = `
.body figure.diagram { margin: 0 0 1rem; }
.body figure.diagram img { display: block; max-width: 100%; height: auto; padding: 0.75rem; border-radius: 6px; background: #fcfcfd; border: 1px solid var(--line); }
.body details.diagram-source { margin-top: 0.35rem; font-family: var(--ui); font-size: 0.8rem; color: var(--ink-faint); }

@media print {
  .body figure.diagram { break-inside: avoid; }
  .body details.diagram-source { display: none; }
}
`

/**
 * The fonts a drawing of the export is drawn with: what the reader's system has, since an SVG
 * shown as an image loads no font of its own, and the app's own fonts are not installed there.
 */
export const DIAGRAM_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
