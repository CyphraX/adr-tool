---
status: accepted
created: 2026-09-19
decided: 2026-09-19
decision-makers: [Philipp Saal]
tags: [stack]
---

# Electron, Svelte and TypeScript throughout

The app must run on Windows, macOS and Linux from day one, and its domain core must be reusable by a later CLI (`adr lint` in CI) and an MCP server. We build everything in TypeScript: a UI-free `core` package and an `app` package on Electron + Svelte 5 + Vite, in one pnpm monorepo. The Markdown, YAML and graph ecosystem the tool depends on lives in JavaScript, Electron's bundled Chromium renders the same on all three platforms, and it is the stack the author already works in.

## Considered Options

- **Tauri 2.** Much smaller installer and memory footprint, but it renders in the system WebView — WebKitGTK on Linux is a recurring source of rendering differences — and needs a Rust toolchain for anything beyond its plugins.
- **Electron/Svelte UI with a Java core as a sidecar process.** Would reuse the author's Java experience, but adds a bundled JRE on top of Chromium, a second build chain and inter-process communication, and would force the later CLI to ship a JVM or per-platform GraalVM builds instead of running via `npx`.
- **JavaFX, Compose Multiplatform, .NET/Avalonia, Flutter.** JavaFX was ruled out by the author outright; the others offer no comparable Markdown editor and pipeline ecosystem, and there is neither toolchain nor experience for them on the author's side.

## Consequences

- The installer is 100 MB or more and memory use is higher than a native app's. Accepted, as it is for other developer tools built on Electron.
- `core` must never import Electron or DOM APIs, or the CLI and the MCP server lose their foundation.
