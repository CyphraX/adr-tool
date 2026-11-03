---
status: accepted
created: 2026-11-02
decided: 2026-11-02
decision-makers: [Philipp Saal]
tags: [export, security, markdown]
amends: [0014-the-export-is-static-html-from-core-printed-to-pdf-by]
affects: [app/renderer, core/export]
---

# Mermaid is drawn in the renderer and exported as an image

ADRs show their flows and states as `mermaid` code blocks, and GitHub draws them. The app showed them as code. Part 2 of [plan-vision.md](../plan-vision.md) asks for them drawn in the preview, in the live mode and in the app's export. An ADR is untrusted input, though: it comes with a repository someone cloned. Mermaid is a large library that turns text into markup. It has had cross-site scripting through HTML labels, click callbacks and `%%{init}%%` directives that switch its security off from inside a block.

Mermaid 12.2.0, at that exact version, draws in the renderer of the window. It is loaded the first time a block is shown, as chunks of its own; the window starts without it. It runs with `securityLevel: 'strict'`, so labels are encoded and there are no click handlers. It runs with `htmlLabels: false`, so labels are SVG text, with no `foreignObject` and no HTML. Its `secure` list holds the keys that a directive or a frontmatter `config:` in a block may not set, at any depth. They are the keys that loosen Mermaid — `securityLevel`, `startOnLoad`, `maxTextSize`, `maxEdges`, `suppressErrorRendering`, `htmlLabels`, `dompurifyConfig` — and every key whose value Mermaid writes into the CSS of a drawing as it is given: `theme`, `themeCSS`, `themeVariables`, `darkMode`, `fontFamily`, `altFontFamily`, `fontSize`, the font keys of sequence diagrams, and `layout`. The window decides the theme: the tokens of `main.css`, light or dark as the window is.

What Mermaid returns goes through DOMPurify 3.4.17 with its SVG and SVG-filter profiles (`packages/app/src/renderer/src/lib/sanitize.ts`). A block's own `style` and `classDef` lines still reach the drawing's CSS, so the CSS is then read by the browser's own parser rather than searched as text. CSS escapes such as `u\72l(` are decoded by that parser, and what it calls a `url()` is what is checked.

- **Style sheets**: each `<style>` is parsed into a `CSSStyleSheet`. Only style, media, supports and keyframes rules are kept, so `@import`, `@font-face` and `@namespace` go.
- **Style attributes**: each is replaced by what the parser read of it.
- **Declarations**: a declaration goes if it is a custom property or names anything outside the drawing. That means a `url()` other than `url("#…")`, `image-set()`, `cross-fade()` or `element()`, or a value taken from elsewhere (`var()`, `env()`, `attr()`).
- **Presentation attributes** are CSS as well, so the same check applies to them. One that holds a backslash is removed.
- **Addresses**: an `href` is removed unless it points into the drawing, or it is an `http(s)` link on an `a`.
- **What is left is refused** when its CSS still holds a backslash, or when its markup is not what a drawing may hold (`packages/app/src/shared/drawing.ts`). A refused block is shown as code.

Only then is the drawing shown.

A block that does not parse stays a code block, with what Mermaid says beside it in one sentence. In the live mode a block is drawn as a widget while the cursor is outside it; inside it, the source shows. Below a drawing, its source is a click away.

Blocks are drawn one at a time, because Mermaid's settings are global. A block is drawn only if it is still shown when its turn comes. The preview beside the editor draws a block once the typing pauses. What Mermaid says of a block is kept only while the block is shown. A block that Mermaid takes more than 15 seconds over stays code, and the next one is drawn.

**This amends [ADR-0014](0014-the-export-is-static-html-from-core-printed-to-pdf-by.md).** The export still writes through the one code of `adr export` and the app (`packages/cli/src/export.ts`). It now takes the drawn blocks as an optional input: a map from a block's source to its sanitized SVG (`ExportOptions.diagrams` in `core`).

- **The app**: the person picks where the export goes first. Main keeps that place and gives the window a ticket for it. The window then draws every block of every Decision Log in the light theme, in the export's fonts and at the size of its view box, and exports to the ticket. The main process does not trust the renderer's sanitizing alone. Before it writes a drawing, it holds the markup against the same allowlist (`diagramsRequest`):
  - one well-formed `<svg>` element;
  - only the elements Mermaid draws with, and none with a prefix;
  - no handler, prefixed or not;
  - no address that leads out;
  - no entity but XML's five, and no backslash, in an attribute or a style sheet;
  - no CSS that fetches.

  The text of a label is never looked at, so a label may say anything.
- **How the export writes a drawing**: each drawing is a file beside its page, `<page>.diagram-<n>.svg`. The page shows it with `<img>` and puts the source below it in a `<details>`. The image is named by the block's `accTitle` and `accDescr` when it has them. The style rules for drawings are added to `style.css` only when there are drawings, so an export without any is byte for byte what it was.
- **`adr export`** has no browser to draw with. It passes no drawings, and its blocks stay code blocks, as before.

The content security policy of ADR-0014 stays exactly as it is.

## Considered Options

- **The SVG inline in the page.** Mermaid styles its drawing with a `<style>` inside the SVG. The page's `style-src 'self'` blocks that, so the policy would need `'unsafe-inline'`, or Mermaid's CSS would have to be rewritten into the style sheet. Several drawings on the page for printing would also share one document's IDs. An SVG shown by `<img>` is a document of its own: it runs no script, fetches nothing, and keeps its style.
- **Mermaid's `securityLevel: 'sandbox'`.** It draws into a sandboxed `iframe` from a `data:` URL. The export's `default-src 'none'` allows no frame, and a frame has no size of its own in the preview.
- **Drawing in `core` or in the command line**, with mermaid-cli and a headless browser, or with a DOM in Node. That means a browser to download for a command that reads files. The app already has a browser engine.
- **Drawing in the main process.** Main has no DOM. It would need another hidden window, holding the same library the renderer can load anyway.
- **Scrubbing the CSS as text**, with patterns for `url(`, `@import` and `image-set(`. The review of the first version found `u\72l(` past it: CSS has escapes, and only its parser knows what they spell.
- **Sanitizing with rehype-sanitize, as the Markdown is.** Its schema is made for HTML, so SVG would need an allowlist written and kept by hand. DOMPurify's SVG profile is kept up to date against SVG's own ways in.

## Consequences

- An ADR with a Mermaid block reads drawn in the app and in the app's export. GitHub draws it on its own, and `adr export` shows it as code. This is the one way the two exports differ, and both come from the same code.
- The drawings of an export are listed in its marker file. A later export removes them with their page, and nothing else.
- A drawing in the export is light, whatever theme the window shows. Printed to PDF, it is the same image.
- A drawing opened on its own from a web host runs nothing and fetches nothing, because it holds nothing that would. The SVGs that ADR-0014 copies as images are not sanitized like this.
- A drawing whose CSS cannot be read with certainty is not drawn. That is what the backslash check costs, and Mermaid writes no backslash of its own.
- Mermaid measures its text in the window's document, so while it draws, the drawing is there as Mermaid made it, before it is sanitized. The window's content security policy (`default-src 'self'`, `img-src 'self' data: adr-asset:`) is what keeps that drawing from fetching anything. The review's cases do try, and the policy blocks them.
- The renderer ships Mermaid's chunks but loads them only for a document that has a block. Moving to a new version of Mermaid is a change to review, not an update that just happens.
- A `mermaid` block is found as the export finds it (`mermaidSources` in `core`): a fenced block whose info string starts with the word `mermaid`, in lower case, as GitHub has it.
