# Releases

How a release of Softarch Suite is built and published: what it contains, how the desktop app is packaged and why, and the steps to cut one. The workflow is `.github/workflows/release.yml`, the packaging `packages/app/electron-builder.yml`. What each release contains is in [CHANGELOG.md](../CHANGELOG.md); how to install it is in the [README](../README.md#download).

## What a release contains

A release is a [GitHub release](https://github.com/CyphraX/adr-tool/releases) named after its tag, `v0.1.0`, with these files:

| File | What it is |
| --- | --- |
| `softarch-suite_0.1.0_amd64.deb` | The app for Debian and Ubuntu, x64. It installs to `/opt/Softarch Suite`, with a menu entry, `softarch-suite` on the path, and the AppArmor profile that Chromium's sandbox needs on Ubuntu 24.04 |
| `Softarch-Suite-0.1.0-linux-x86_64.AppImage` | The app for any Linux on x64, in one file that runs where it lies |
| `Softarch-Suite-0.1.0-linux-x64.tar.gz` | The app for Linux on x64, as a folder |
| `Softarch-Suite-0.1.0-win-x64-setup.exe` | The installer for Windows on x64 (NSIS): for the person who runs it, without administrator rights, with a Start menu entry and an uninstaller |
| `Softarch-Suite-0.1.0-win-x64-portable.exe` | The app for Windows on x64, run without installing |
| `Softarch-Suite-0.1.0-mac-arm64.dmg`, `….zip` | The app for Macs with Apple silicon |
| `Softarch-Suite-0.1.0-mac-x64.dmg`, `….zip` | The app for Macs with an Intel processor |
| `adr.mjs` | The command line, `adr lint`, `adr check` and `adr export`, in one file ([cli.md](cli.md)) |
| `adr-mcp.mjs` | The MCP server in one file ([mcp.md](mcp.md)) |
| `SHA256SUMS` | The SHA-256 checksum of each file above, for `sha256sum -c SHA256SUMS` |

The version is the same in every `package.json` of the repository. The app reads it from its own (`app.getVersion()`, which the About panel of macOS shows), and `adr --version` and `adr-mcp --version` print it.

Every installer carries the licence of the suite as `LICENSE.txt` beside the app's archive (in `resources/`, on a Mac in `Contents/Resources/`), and the notices of the packages it bundles: `THIRD-PARTY-NOTICES-main.txt` for the main process and the analysis, `THIRD-PARTY-NOTICES-window.txt` for the window. Each lists a package with its version and the licence text it comes with; each build writes them from the modules it bundled and the files it embedded — the grammars of tree-sitter for Java, Python and Go among them — (`packages/cli/notices.ts`). electron-builder adds `LICENSE.electron.txt` and `LICENSES.chromium.html`. `adr.mjs` and `adr-mcp.mjs` end with the notices of what they bundle, as a comment, so that each stays one file. That is what [ADR-0010](adr/0010-the-suite-is-open-source-under-the-mit-licence.md) asks of distribution. elkjs, under the EPL-2.0, is a file of its own in the window, and its notice says where its Source Code is ([ADR-0024](adr/0024-unmodified-modules-under-epl-2-0-or-the-unlicense-may-ship.md)); a build that bundles another package under the EPL fails until its notice says the same.

### What 0.1 is not yet

- **Signed.** Neither the Windows nor the macOS build is signed with a certificate, so both systems warn before the first start; the README says how to open them anyway. The Mac build is signed ad hoc, which needs no certificate: a Mac with Apple silicon runs no code without a signature, and the one Electron comes with no longer holds once electron-builder has named the app and its executable. The hardened runtime is off, as it only matters for notarization.
- **Tried by hand on Windows and macOS.** CI builds those installers; only the Linux build has been started and used. The first run on each wants the checks that [plan-roadmap.md](plan-roadmap.md#status) has waiting: quitting with an open dialog on a Mac (part 2), the rename that is tried again and the copy that stands in for a hard link on Windows (part 14). The tests run on Linux alone, as in CI.
- **Updated by itself.** There is no auto-update. A new version is installed over the old one; the repositories the app had open stay, as they live in its folder for user data, which follows the product name ([ADR-0011](adr/0011-the-product-is-called-softarch-suite.md)).
- **Published to npm.** `adr.mjs` and `adr-mcp.mjs` are attached to the release and nowhere else.

## How it is packaged

Why the release is built this way, and what else was weighed, is recorded in [ADR-0023](adr/0023-everything-a-release-runs-is-bundled-and-electron-builder.md).

### electron-builder

The app is packaged with [electron-builder](https://www.electron.build), configured in `packages/app/electron-builder.yml`. One tool and one file build every format the release has — AppImage, deb and tar.gz, NSIS and a portable exe, dmg and zip — and both Macs from one runner. Electron Forge would need a maker per format, and its packager expects the flat `node_modules` of npm; under pnpm, that means `node-linker=hoisted` for the whole workspace. electron-builder also builds from an Electron that is already on disk (`electronDist`), which a build without access to GitHub needs.

The appId is `io.github.cyphrax.softarch-suite`; the main process gives the window the same AppUserModelID, so that Windows groups it under the shortcut the installer made. The files are named `Softarch-Suite-<version>-<os>-<arch>.<ext>`, the deb as Debian names packages. `publish: null`: the workflow publishes, never electron-builder.

### No `node_modules` in the package

pnpm links each package's dependencies into `node_modules` from a store; following those links is where packaging a pnpm workspace usually breaks. The app avoids the question: electron-vite bundles everything the main process, the preload script, the window and the analysis worker run into `packages/app/out/`, and the package holds `out/` and its `package.json` and nothing else (`packages/app/electron.vite.config.ts`).

- The app's `package.json` lists no `dependencies`. electron-vite leaves only those as runtime requires, so chokidar, `@electron-toolkit/utils`, TypeScript, web-tree-sitter and the workspace's own packages are all bundled; electron-builder finds nothing to collect and nothing to rebuild (`npmRebuild: false`).
- TypeScript, about 9 MB, ends up in the analysis worker alone, the one place that loads it ([ADR-0008](adr/0008-dependencies-come-from-parsers-alone-without-a-type-checker.md)); the main process starts without it.
- The WebAssembly of tree-sitter — the runtime and the grammars of Java, Python and Go — is read through the command line's module `@adr-tool/cli/tree-sitter-wasm`. In development and in the tests it reads the files from their packages; the build carries them in the worker as base64, as in `adr`. So the packaged app has no file to find, inside its archive or outside it. A build in which the module ends up without them — a path the plugin did not recognise, as can happen on Windows — fails, rather than shipping an analysis that reads no Java, Python or Go (`packages/cli/command.config.ts`).
- The fonts and every other asset of the window are files of `out/renderer`, which Vite writes.

The app's archive is about 27 MB; Electron makes up the rest of each installer, about 100 to 130 MB.

### The menu

The app sets a menu of its own, in the language of the window (`packages/app/src/main/menu.ts`): on a Mac the app menu with About, Hide and Quit; File; Edit, without which the keys of the clipboard do nothing on a Mac; View with the zoom and full screen; and Window. Electron's default menu is not shipped: its View menu reloads the window, which loses the text of the editor, and opens the developer tools, and its Help menu points to Electron. A reload that comes another way, while the window holds text that is not saved, asks first.

### The icon

`packages/app/build/icon.svg` is the source: four Components and the Dependencies between them, drawn as the window draws a graph ([design.md](design.md)), on the window's ink. `packages/app/build/render-icon.mjs` draws it in Electron's Chromium into `icon.png`, 1024 px square, from which electron-builder derives the `.ico` of Windows and the `.icns` of macOS, and into `build/icons/`, one PNG for each size from 16 to 512 px, which the deb and the AppImage install into the hicolor theme of Linux: the menu and the dock look the icon up there by size. Each size is drawn from the SVG, not scaled down. After a change to the SVG, from `packages/app` (on Linux without a display, under `xvfb-run -a`):

```sh
pnpm exec electron build/render-icon.mjs
```

and commit what it writes.

### The command line and the MCP server

`adr.mjs` and `adr-mcp.mjs` are the files `pnpm build` writes to `packages/cli/dist` and `packages/mcp/dist`, built by the check job of the release. They need Node.js 22.12 or later and nothing else. Each ends with a comment that holds the notices of the packages it bundles — TypeScript, web-tree-sitter, `yaml`, `smol-toml`, the parsers of Markdown and the rest —, the same as the app's notices (`packages/cli/command.config.ts`).

They are not single-file executables. Node's SEA takes a CommonJS script in Node 22, and both commands are modules that wait at their top level; each executable would be a whole Node.js, about 100 MB, built on each system, and on a Mac it would run only once signed again after the script is injected. Unsigned, it would meet the same warnings as the app. A `.mjs` file of 13 MB runs on every system that has Node.js, which is where agents and CI run anyway.

## Cutting a release

1. **main is final.** Every pull request for the release is merged, and CI is green on the last commit.
2. **The version and the changelog.** On a branch: set the version in every `package.json`, the root's and those of `packages/*` —

   ```sh
   for file in package.json packages/*/package.json; do
     sed -i 's/"version": "[^"]*"/"version": "0.2.0"/' "$file"
   done
   ```

   — and give the release its section in [CHANGELOG.md](../CHANGELOG.md), headed `## [0.2.0] — 2026-12-01`, with the date it is tagged. Until then the section is headed `## [0.2.0] — unreleased`. The workflow takes the release notes from that section, and refuses a tag without one and a tag whose section still says `unreleased`. Run the checks of CI, open a pull request, and merge it.
3. **A dry run, if you like.** Under Actions → Release → Run workflow, on `main`: the workflow checks, builds the installers on all three systems and keeps them as the run's artifacts, without publishing anything. Download them and try them.
4. **The tag.** On the commit of `main` that is released:

   ```sh
   git switch main && git pull
   git tag -a v0.2.0 -m "Softarch Suite 0.2.0"
   git push origin v0.2.0
   ```

5. **The workflow runs** on the tag. `check` runs what CI runs — lint, format, types, tests, build and `adr check` — and keeps `adr.mjs` and `adr-mcp.mjs`. `package` builds the installers on `ubuntu-latest`, `windows-latest` and `macos-latest` at the same time. `release` runs once all of them have passed: it collects every file, writes `SHA256SUMS`, and creates the release named after the tag, with the files and the notes. Nothing needs a secret beyond the workflow's own `GITHUB_TOKEN`.
6. **Check the release page.** Every file of the table above is there; install one and start it.

When a job fails, nothing is published. Fix the cause on `main` and, if the fix changed the code, move the tag: `git push --delete origin v0.2.0` and `git tag -d v0.2.0`, then tag the new commit and push it as in step 4. A job that failed for a reason outside the code — a download that broke off — is run again from its run's page. Started by hand on the tag, the workflow uploads its files to the release that is already there, replacing those of the same name. A release that is wrong once published is deleted with its tag, `gh release delete v0.2.0 --cleanup-tag`, and made again.

## Building it locally

From the root of the repository, for the system it runs on:

```sh
pnpm install
pnpm build
pnpm --filter @adr-tool/app package
```

The files land in `packages/app/dist`. electron-builder downloads Electron and the tools of each format from GitHub. Where that is not possible, the unpacked app is built from the Electron that `pnpm install` put on disk, given on the command line rather than in the configuration:

```sh
cd packages/app
electron_dist="$(node -p "require('path').join(require('path').dirname(require.resolve('electron/package.json')), 'dist')")"
pnpm exec electron-builder --linux dir --publish never -c.electronDist="$electron_dist"
```

`dist/linux-unpacked/softarch-suite` then starts the packaged app; with `ADR_TOOL_REPO` set to the path of a repository, it opens that one too. That this repository opens in it, and that Structure analyses it — "Analysed in …" in its sidebar, with the Java, Python and Go of the fixtures read —, shows that TypeScript and the WebAssembly are in the package. An Electron from disk keeps its `default_app.asar` beside the app's archive; one that electron-builder downloads does not.
