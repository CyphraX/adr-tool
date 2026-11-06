---
status: accepted
created: 2026-11-06
decided: 2026-11-06
decision-makers: [Philipp Saal]
tags: [release, packaging]
relates-to: [0008-dependencies-come-from-parsers-alone-without-a-type-checker, 0010-the-suite-is-open-source-under-the-mit-licence, 0011-the-product-is-called-softarch-suite]
affects: [app, cli, mcp]
---

# Everything a release runs is bundled, and electron-builder packages the app

Release 0.1 is the first that people download rather than build: the desktop app as installers for Linux, Windows and macOS, and the command line and the MCP server for anyone who has Node.js. The workspace is a pnpm monorepo, whose `node_modules` are links into a store. The analysis needs TypeScript and the WebAssembly of tree-sitter at runtime ([ADR-0008](0008-dependencies-come-from-parsers-alone-without-a-type-checker.md)). Nobody in the project has a certificate to sign with. The release has to be built on three systems by one workflow, and keep working when a dependency moves.

So electron-vite bundles everything the app runs into `packages/app/out/`: the main process, the preload script, the window, the analysis worker, the workspace's own packages, TypeScript in the worker alone, and the WebAssembly as base64. The app's `package.json` lists no `dependencies`. electron-builder packages `out/` and that `package.json`, and nothing else, into every format of the release, configured in one file, `packages/app/electron-builder.yml`. 0.1 is not signed with a certificate. The Mac build is signed ad hoc, which needs none: a Mac with Apple silicon runs no code without a signature. The Windows build is not signed. The command line and the MCP server are released as the files `pnpm build` writes, `adr.mjs` and `adr-mcp.mjs`, one file each for Node.js 22.12 or later, with the WebAssembly in them too. How a release is cut is in [release.md](../release.md).

## Considered Options

- **Electron Forge.** It needs a maker per format. Its packager collects `node_modules` as npm lays them out, which under pnpm means `node-linker=hoisted` for the whole workspace: every package could then import what it never declared. electron-builder builds every format of the release from one file, both Macs on one runner, and from an Electron already on disk when GitHub cannot be reached.
- **Packaging `node_modules`**, with `pnpm deploy` or by letting electron-builder collect the production dependencies. Following pnpm's links is where packaging a pnpm workspace usually breaks. It also ships what the code never loads: whole packages for one module of each, the sources of TypeScript beside its bundle. A bundle holds what the code imports and nothing else, and its notices list exactly that ([ADR-0010](0010-the-suite-is-open-source-under-the-mit-licence.md)).
- **Signing with a certificate in 0.1.** A Developer ID from Apple and a code-signing certificate for Windows cost money every year and need an identity behind them. Notarizing a Mac build needs the hardened runtime and Apple's service in the workflow, with its secrets. Unsigned, both systems warn before the first start, and the README says how to open the app anyway.
- **The commands as single-file executables**, with Node's SEA. In Node.js 22 it takes a CommonJS script, and both commands are modules that wait at their top level. Each executable would be a whole Node.js, about 100 MB, built on each system. On a Mac it runs only once it is signed again after the script is injected, and unsigned it meets the same warnings as the app. A `.mjs` file of 13 MB runs wherever Node.js does, which is where agents and CI run.
- **The commands on npm.** `npx` would find them. It needs an account and a token in the workflow beyond its `GITHUB_TOKEN`, and a name on npm, which [ADR-0011](0011-the-product-is-called-softarch-suite.md) has not checked yet. The files are attached to the release; npm can follow.

## Consequences

- The app's archive is about 27 MB. Electron makes up the rest of each installer, 100 to 130 MB. Nothing is rebuilt for a system, as there is no native module.
- A dependency of the app goes into `devDependencies`. One in `dependencies` would stay a `require` that the package cannot satisfy.
- A build whose tree-sitter module was bundled without its WebAssembly fails, rather than shipping an analysis that reads no Java, Python or Go.
- Each build writes the notices of what it bundled. The installers carry them as files beside the app's archive, and each command ends with them as a comment, so that it stays one file.
- Windows and macOS warn before the first start of 0.1, and the app does not update itself. Signing, notarization and updates are open in [roadmap.md](../roadmap.md).
- `packages/app/scripts/render-icon.mjs` draws the icon in Electron's Chromium when the icon changes. It is not shipped. Its use of Electron is accepted as an Exception of `only-the-window-uses-electron`, justified by this ADR. It lives outside `build/`, which the analysis leaves out where git does not list the files, so that the Exception matches in a copy without git as well.
