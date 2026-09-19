---
status: accepted
created: 2026-09-19
decided: 2026-09-19
decision-makers: [Philipp Saal]
tags: [editor, file-format]
---

# The tool never re-serializes Markdown

ADRs are reviewed as git diffs, and a Correction promises that nothing but the visible change was touched. So the tool never parses a file into a document model and writes it back. All three editor modes — source, source with live preview, live editor — work on one and the same CodeMirror 6 text buffer, and a Metadata write changes only the tool's own keys, leaving every other byte as it was, foreign frontmatter keys included.

## Considered Options

- **A WYSIWYG editor on a document model (TipTap, Milkdown, ProseMirror).** The most comfortable editing experience and far less work for the live editor, but these editors normalize Markdown on save — list markers, line breaks, tables — so a one-word Correction would show up in review as dozens of changed lines.

## Consequences

- The live editor has to be built as inline decorations over raw Markdown, which is the largest single piece of editor work. Tables stay source at first.
- Metadata writes need a YAML layer that preserves formatting, comments and key order instead of dumping and reloading.
- Round-trip tests belong in `core` from the start: open and save without a change gives identical bytes; changing one key changes only that line.
