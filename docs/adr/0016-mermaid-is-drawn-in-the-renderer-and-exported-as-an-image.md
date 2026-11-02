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

Mermaid 12.2.0, at that exact version, draws in the renderer of the window. It is loaded the first time a block is shown, as chunks of its own; the window starts without it. It runs with `securityLevel: 'strict'`, so labels are encoded and there are no click handlers. It runs with `htmlLabels: false`, so labels are SVG text, with no `foreignObject` and no HTML. Its `secure` list holds every key a directive in a block could otherwise change: `securityLevel`, `startOnLoad`, `maxTextSize`, `maxEdges`, `suppressErrorRendering`, `htmlLabels`, `dompurifyConfig` and `themeCSS`. Its colours are the tokens of `main.css`, light or dark as the window is.

What Mermaid returns goes through DOMPurify 3.4.17 with its SVG and SVG-filter profiles. After that, CSS loses `@import`, `image-set()` and every `url()` that does not point into the drawing. An `href` is removed unless it points into the drawing, or it is an `http(s)` link on an `a`. Only then is the drawing shown (`packages/app/src/renderer/src/lib/mermaid.ts` and `diagrams.ts`).

A block that does not parse stays a code block, with what Mermaid says beside it in one sentence. In the live mode a block is drawn as a widget while the cursor is outside it; inside it, the source shows.

**This amends [ADR-0014](0014-the-export-is-static-html-from-core-printed-to-pdf-by.md).** The export still writes through the one code of `adr export` and the app (`packages/cli/src/export.ts`). It now takes the drawn blocks as an optional input: a map from a block's source to its sanitized SVG (`ExportOptions.diagrams` in `core`).

- **The app**: before it exports, the app draws every block of every Decision Log in the light theme and passes the drawings in. The main process takes a drawing only if it is a single `<svg>` element with no script, `foreignObject`, frame, object, event handler or `javascript:` (`diagramsRequest`). It does not trust the renderer's sanitizing alone.
- **How the export writes a drawing**: each drawing is a file beside its page, `<page>.diagram-<n>.svg`. The page shows it with `<img>` and puts the source below it in a `<details>`.
- **`adr export`** has no browser to draw with. It passes no drawings, and its blocks stay code blocks, as before.

The content security policy of ADR-0014 stays exactly as it is.

## Considered Options

- **The SVG inline in the page.** Mermaid styles its drawing with a `<style>` inside the SVG. The page's `style-src 'self'` blocks that, so the policy would need `'unsafe-inline'`, or Mermaid's CSS would have to be rewritten into the style sheet. Several drawings on the page for printing would also share one document's IDs. An SVG shown by `<img>` is a document of its own: it runs no script, fetches nothing, and keeps its style.
- **Mermaid's `securityLevel: 'sandbox'`.** It draws into a sandboxed `iframe` from a `data:` URL. The export's `default-src 'none'` allows no frame, and a frame has no size of its own in the preview.
- **Drawing in `core` or in the command line**, with mermaid-cli and a headless browser, or with a DOM in Node. That means a browser to download for a command that reads files. The app already has a browser engine.
- **Drawing in the main process.** Main has no DOM. It would need another hidden window, holding the same library the renderer can load anyway.
- **Sanitizing with rehype-sanitize, as the Markdown is.** Its schema is made for HTML, so SVG would need an allowlist written and kept by hand. DOMPurify's SVG profile is kept up to date against SVG's own ways in.

## Consequences

- An ADR with a Mermaid block reads drawn in the app and in the app's export. GitHub draws it on its own, and `adr export` shows it as code. This is the one way the two exports differ, and both come from the same code.
- The drawings of an export are listed in its marker file. A later export removes them with their page, and nothing else.
- A drawing in the export is light, whatever theme the window shows. Printed to PDF, it is the same image.
- A drawing opened on its own from a web host runs nothing, because it holds nothing to run. The SVGs that ADR-0014 copies as images are not sanitized like this.
- The renderer ships Mermaid's chunks but loads them only for a document that has a block. Moving to a new version of Mermaid is a change to review, not an update that just happens.
- A `mermaid` block is found as the export finds it (`mermaidSources` in `core`): a fenced block whose info string starts with the word `mermaid`, in lower case, as GitHub has it.
