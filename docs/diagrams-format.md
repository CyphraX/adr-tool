# Diagrams format

The contract of the Diagrams module: where the Diagrams of a repository are, what a Diagram looks like on disk, which connections the code suggests and what counts as Drift, which Problems a Diagram can have, and how it is drawn as SVG. The `diagrams` package implements exactly this document, and an agent or a person who follows it can write a Diagram without the app.

Vocabulary follows the [Diagrams glossary](contexts/diagrams/CONTEXT.md), the [Structure glossary](contexts/structure/CONTEXT.md) and the shared language in [CONTEXT-MAP.md](../CONTEXT-MAP.md). Where the module sits in the suite is in [vision.md](vision.md); how it gets built is in [plan-vision.md](plan-vision.md), parts 6, 7 and 19. Every section names the part it arrives with, so that this document never promises more than the code does. The file format, and that the SVG beside a Diagram is committed on purpose, are recorded in [ADR-0018](adr/0018-a-diagram-is-a-yaml-file-and-its-svg-is-committed-beside-it.md).

Three rules stand above everything else:

- **The suite never changes a byte it was not asked to change** ([ADR-0002](adr/0002-never-reserialize-markdown.md)). A Diagram is edited by people, by agents and — from part 7 on — by the suite alike; whatever the suite writes there, nothing else in the file moves.
- **The layout belongs to the file.** Every box stands where its file says, at the size its file says. The suite never arranges a Diagram that exists; it only places what it adds.
- **Drift is derived and never stored.** What enters the file is what a person decides: an element, a connection, a label, a position. The SVG beside a Diagram is derived as well, and is the one thing of this module that is committed although it is ([vision.md](vision.md), "Stored and derived").

## 1. Where Diagrams are (part 6)

The Diagrams of a repository are the files directly in `docs/architecture/diagrams/` whose names end in `.yml`.

- A file whose name begins with a dot is not a Diagram, nor is a `.yaml` file, nor anything in a directory below. The directory not being there is not a Problem: the repository has no Diagrams yet.
- The **Diagram ID** is the file name without `.yml`: `docs/architecture/diagrams/packages.yml` is the Diagram `packages`. Diagrams are listed by ID.
- The picture of a Diagram is the file of the same name with `.svg` in the same directory: `docs/architecture/diagrams/packages.svg` (section 6).
- Opening a repository never writes.

Another directory is set in `.arch/config.yml`, beside `.arch/components.yml`:

```yaml
# .arch/config.yml
diagrams: design/diagrams # optional; docs/architecture/diagrams when absent
```

- `diagrams` is a path relative to the repository root, with forward slashes. Without the file, without the key, or with an empty `diagrams:`, the default applies.
- Keys the suite does not know are preserved and ignored, so that the other modules can keep their own settings in the same file.
- A file that is not YAML or whose top level is not a map, and a `diagrams` that is not a text, is absolute, leaves the repository or is its root, is a Problem (section 5), and **no Diagram is looked for** while it stands: looking in the default directory instead would hide the mistake, as it would for Decision Logs ([file-format.md](file-format.md), section 6).

## 2. The file (part 6)

A Diagram is a YAML file. This repository's own, abridged:

```yaml
# docs/architecture/diagrams/packages.yml
title: The packages of Softarch Suite
description: Each package, and which of them uses which.
level: container
elements:
  - component: kernel
    at: [40, 120]
  - component: core
    at: [240, 60]
  - external: git
    name: git
    description: Holds the history of the repository.
    at: [640, 300]
connections:
  - from: core
    to: kernel
    label: reads the disk through its port
```

### Keys at the top

Every key is optional.

| Key           | Value                                         | Meaning                                                                                          |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `title`       | text                                          | The title, drawn above the picture. Without it, the picture has the Diagram ID as its title only. |
| `description` | text                                          | What the Diagram shows, in a sentence or two; drawn below the title.                              |
| `level`       | `system-context`, `container` or `component`  | The view level (section 3). Without it, the Diagram is drawn, and its elements are not checked against a level. |
| `scope`       | Component ID                                  | For the level `component` only: the Component the Diagram looks into.                             |
| `elements`    | list of maps                                  | The boxes, one item each, in the order they are drawn.                                            |
| `connections` | list of maps                                  | The arrows, one item each, in the order they are drawn.                                           |

`elements:` and `connections:` without a value are empty lists.

### Elements

An element is a Component, an External System, or — in a system context only — the repository itself. Each item of `elements` says which with exactly one of the first three keys:

| Key           | Value              | Meaning                                                                                                          |
| ------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `component`   | Component ID       | A Component, by its ID ([structure-format.md](structure-format.md), section 1). Its name and description are those of its declaration. |
| `external`    | element ID         | An External System, a plain box with no code behind it.                                                          |
| `repository`  | element ID         | The repository as one box: everything its Components hold.                                                       |
| `name`        | text               | The name in the box of an External System or the repository. Without it, the element ID.                        |
| `description` | text               | A sentence in the box of an External System or the repository, below its name.                                  |
| `at`          | `[x, y]`, numbers  | Where the top left corner of the box stands. Required.                                                           |
| `size`        | `[width, height]`, positive numbers | The size of the box. Without it, the box is as large as its text needs (section 6).             |

A Component's `name` and `description` come from `.arch/components.yml`, so that the picture says what the declaration says; written on its element, they are ignored. Keys the suite does not know are preserved and ignored, at the top level and in an item, as in the declaration of Components.

Positions and sizes are in the units of the SVG, a pixel each, and grow to the right and downwards. They may be negative and need not be whole; the suite writes whole numbers. They are kept exactly as they are written, and nothing is ever moved to make room.

### Connections

| Key     | Value      | Meaning                                                                      |
| ------- | ---------- | ---------------------------------------------------------------------------- |
| `from`  | element ID | The element that uses the other one. Required.                                |
| `to`    | element ID | The element that is used. Required. The arrow points at it.                   |
| `label` | text       | What the connection says, written on its line. Optional.                      |

Whether a connection is type-only is not stored: a Diagram says that one part uses another, and Drift compares it with every Dependency, type-only or not (section 4).

### IDs

- The **element ID** of a Component is its Component ID: `core`, `core/metadata`. That of an External System or of the repository is the text after `external` or `repository`, a segment as a Component ID has them — lowercase ASCII letters, digits and dashes, starting and ending with a letter or a digit — so that it can never be read as a Component below another.
- Connections name elements by their element IDs. The elements of one Diagram have distinct IDs: an External System cannot share its ID with a Component the Diagram shows.
- A Component ID is what a Rename of the Component rewrites (part 7): in `component`, `scope`, `from` and `to`, and nowhere else.

### How the suite writes (part 7)

So that the suite can change one element or one connection without touching any other line, it writes, and reads best, this style — which is also the style of the example above:

- the keys at the top in the order of the table; `elements` before `connections`;
- one item per element and per connection, in block style, its first key on the line of its `-`, then its other keys in the order of the tables, one per line;
- `at` and `size` as a flow list on one line, `[x, y]`, so that moving a box changes one line;
- a new element at the end of `elements`, a new connection at the end of `connections`.

A person may write any YAML that reads as the same Diagram. Where the suite cannot change what is asked without rewriting more — a list in flow style, an item with a comment on the line of its `-`, an anchor — it refuses, and says so.

### What a valid Diagram is

A file **can be read** when it is YAML whose top level is a map (or nothing at all), and the keys the suite owns have values of the form above: the texts are texts, `elements` and `connections` are lists of maps, every element has exactly one of `component`, `external` and `repository` and has an `at` of two numbers, a `size` is two positive numbers, and every connection has a `from` and a `to`. A file that cannot be read is a Problem, and nothing else is said about it.

A Diagram is **valid** when it can be read and has none of the Problems of section 5.

## 3. View levels (part 6)

The view level of a Diagram follows the C4 model, as a depth of the one Component hierarchy: what C4 calls a container is a top-level Component here, and what it calls a component is a Component below it ([vision.md](vision.md), "The spine"). A level says which Components belong in the Diagram; External Systems belong in every one.

| `level`          | Depth | The Components it shows                                                                                         |
| ---------------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| `system-context` | 0     | None. The repository is one box, among the External Systems it is used by and uses.                                |
| `container`      | 1     | The Components at the top of the hierarchy.                                                                         |
| `component`      | `scope` + 1 | The children of the Component `scope`, and — beside them, for context — the Components beside `scope` and beside each Component that contains it. |

- A component view can look into a Component at any depth: the component view of `core` shows `core/metadata` and its siblings, with `kernel`, `structure` and the other top-level Components beside them; that of `core/metadata` shows the children of `core/metadata`, with `core/lifecycle` and the other children of `core` beside them, and the top-level Components beside `core`. No two of the Components a level allows contain each other.
- The repository box belongs in a system context only.
- What does not belong in the Diagram's level is a Problem (section 5). It is drawn all the same, and its connections count for Drift.

## 4. Suggested connections and Drift (part 6)

Both are derived from Structure's Dependencies ([structure-format.md](structure-format.md), section 3) every time they are asked for, and never written anywhere.

- The **shown Components** of a Diagram are its Component elements whose Component is declared — the first element of an ID where there are two.
- A Source File counts for the **deepest shown Component that contains it**; a Source File no shown Component contains counts for none. Where the shown Components fit the level, no two of them contain each other and "deepest" never has to choose; where they do not, a file counts once all the same.
- Test files are left out and type-only Dependencies count, as in Structure's views. A caller may ask for test files to be counted.

A **suggested connection** from A to B is the set of Dependencies from the Source Files that count for A to those that count for B, for two different shown Components. Like a Dependency between Components, it has a **weight** — the number of pairs of Source Files behind it — and is type-only when every Dependency behind it is. A suggestion says whether the Diagram draws it already. External Systems and the repository have none: no code stands behind them.

**The scope's own files.** In a component view, the Source Files the scope owns itself, and none of its parts — `packages/core/src/index.ts` is `core`'s own —, stand at the **boundary** of the view, as the own files of a parent stand beside its children in Structure's levels ([structure-format.md](structure-format.md), section 4). They count for the scope, as long as the Diagram does not show the scope itself:

- A Dependency between them and a shown Component outside the scope suggests a connection between that Component and the scope, **through the scope**: `app` depends on `core` through `packages/core/src/index.ts`. The Diagram draws it with a connection the same way between that Component and any part of the scope it shows — `app` to `core/adr`, say.
- A Dependency between them and a part of the scope suggests nothing: the view looks into the scope, and its own files and its parts are one.
- Through the scope's own files, a Component outside may reach any part of the scope, and a part may reach what those files use. A connection between the two is therefore **not Drift** where a suggestion through the scope stands behind it the same way, although no Dependency between the two does: `app` may reach `core/adr` through `core`'s own files. Which part the files lead to, the suite cannot tell; it says neither that the code has the connection nor that it does not.

**Drift** is a difference between the Diagram and the code. There are two kinds:

| Drift                                                                                    | Code                         | Sentence                                                                                     |
| ---------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| A connection from one shown Component to another that no suggested connection stands behind | `connection-not-in-code`     | The Diagram connects `app` to `core`, but no Source File of `app` depends on one of `core`.     |
| The same, where Structure could not follow everything the Source Files of `from` use         | `connection-perhaps-not-in-code` | The Diagram connects `a` to `b`. No Source File of `a` is known to depend on one of `b`, but that is not certain: one use in `a` cannot be resolved. |
| A suggested connection that the Diagram does not draw                                      | `dependency-not-in-diagram`  | `app` depends on `core` in the code, through 12 Source File Dependencies, and the Diagram does not connect them. |
| A suggested connection through the scope that the Diagram does not draw                    | `scope-dependency-not-in-diagram` | `app` depends on `core`'s own files in the code, through 3 Source File Dependencies, and the Diagram connects `app` to no part of `core`. — or, the other way: `core`'s own files depend on `kernel` in the code, through 2 Source File Dependencies, and the Diagram connects no part of `core` to `kernel`. |

- Direction counts: a connection from `core` to `kernel` stands for the Dependencies of `core` on `kernel`, and not for those the other way round.
- A connection the code does not have is **not certain** where Structure could not follow everything the Source Files that count for `from` use: a use it cannot resolve — a package of a workspace whose `dist` is not built, say — or a file it cannot read ([structure-format.md](structure-format.md), sections 2 and 3). The Drift is the same, `connection-not-in-code`, marked as not certain with how many uses are not resolved and how many files cannot be read, and its sentence is the second one above. What the Source Files of `to` use does not matter: a Dependency is found in the file that uses.
- A connection from or to an External System, the repository, an element whose Component is gone, or an ID that is no element has no Drift. The last two are Problems.
- Drift needs a declaration of Components that can be read. On the Draft, whose IDs follow directories, and while `.arch/components.yml` cannot be read, there are no suggested connections and no Drift, and no Problem of section 5 that is about a Component ID is reported — as for the Traces of ADRs ([structure-format.md](structure-format.md), section 6).
- Drift is not drawn into the SVG of section 6: the picture is the Diagram as it is meant. The window shows Drift on the Diagram (part 7).

## 5. Problems (part 6)

Diagrams adds these **Problems**. Each is reported at its file and, where it has one, its line; each sentence is the English one of its code, and the window words the code in its own language.

### Of `.arch/config.yml`

| Problem                                                                       | Code                          | Sentence                                                                                                                | Repair |
| ----------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------ |
| The file cannot be read: it is not YAML, or its top level is not a map.       | `unreadable-config`           | .arch/config.yml cannot be read: its top level must be a map. No Diagram is looked for until it is fixed.               | —      |
| `diagrams` is not a text, is absolute, leaves the repository or is its root.  | `invalid-diagrams-directory`  | "diagrams" in .arch/config.yml must be a relative path inside the repository. No Diagram is looked for until it is fixed. | —      |

### Of a Diagram's file

| Problem                                                                                       | Code                             | Sentence                                                                                                                                  | Repair |
| --------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| The file cannot be read (section 2). The detail says why.                                      | `unreadable-diagram`             | docs/architecture/diagrams/packages.yml cannot be read: the element on line 7 has no position "at".                                        | —      |
| There is no `level`.                                                                          | `no-level`                       | The Diagram has no level. A level is one of system-context, container and component.                                                       | —      |
| `level` is none of the three.                                                                 | `unknown-level`                  | The Diagram has the level "layers", which the suite does not know. A level is one of system-context, container and component.             | —      |
| A component view has no `scope`.                                                              | `no-scope`                       | The Diagram is a component view and has no scope: it does not say which Component it looks into.                                          | —      |
| A Diagram of another level has a `scope`.                                                      | `scope-without-component-level`  | The Diagram is a container view and has a scope, which only a component view has. The scope is not read.                                  | —      |
| The ID of an External System or of the repository is not a segment.                          | `invalid-element-id`             | "GitHub" is not a valid element ID. An element ID consists of lowercase letters, digits and dashes, and starts and ends with a letter or a digit. | —      |
| Two elements have the same ID. The first one is read.                                          | `duplicate-element`              | core is shown twice. The first one is read.                                                                                                | —      |
| A connection from an element to itself. It is not drawn.                                       | `self-connection`                | The connection from core to core is not drawn: an element does not use itself.                                                             | —      |
| A connection names an ID that is no element of the Diagram. It is not drawn.                   | `unknown-element`                | The connection from core to kernal names kernal, which is not an element of the Diagram. It is not drawn.                                  | —      |
| Two connections have the same `from` and `to`. The first one is read.                          | `duplicate-connection`           | The Diagram connects core to kernel twice. The first connection is read.                                                                   | —      |

### Against the declaration of Components

Reported only where `.arch/components.yml` declares Components and can be read (section 4).

| Problem                                                                                       | Code                          | Sentence                                                                                                                                           | Repair |
| --------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **An element whose Component is gone**: it names a Component ID that is not declared.         | `component-gone`              | The Diagram shows billing, which is not a declared Component.                                                                                         | Remove the element and its connections (previewed). |
| `scope` names a Component ID that is not declared.                                             | `unknown-scope`               | The Diagram looks into billing, which is not a declared Component.                                                                                    | —      |
| A Component element does not belong in the level (section 3).                                  | `component-does-not-fit`      | core/metadata does not belong in a container view, which shows the Components at the top of the hierarchy.                                            | —      |
| The repository is shown at a level other than the system context.                             | `repository-does-not-fit`     | The repository suite stands for every Component, and only a system context shows it.                                                                 | —      |

A Repair is offered only where exactly one change is right. An element whose Component is gone was meant to show something that is no longer there; whether it was renamed, split or removed, the suite cannot tell — but the element cannot stay, so its Repair takes it out. It removes, as one previewed change:

- the lines of the element's item, from its `-` to the end of the line of its last key, for every element that names the Component;
- the lines of the item of every connection whose `from` or `to` is the Component ID — unless another element of the Diagram, an External System say, keeps that ID.

A comment inside an item, or behind it on its last line, goes with it; nothing else in the file changes, and comments above and below an item stay where they are. Where an item does not have its lines to itself — a list in flow style, a comment, a tag or an anchor on the line of its `-` in front of it, anything but a comment behind it — the Repair is refused with the advice to use an editor. Whatever the suite hands out has been checked to read back as the same Diagram without those items.

Problems of Diagrams appear in the Problems view of the repository, grouped by module (part 7).

## 6. The picture (part 6)

The `diagrams` package draws a Diagram as SVG itself, without a browser, so that the command line and the app write the same bytes.

### What it draws

- **A box per element**, at its `at`, in the order of `elements`; a later element of an ID that is there already is not drawn. A box has rounded corners and a solid border; an External System's border is dashed, because it is from elsewhere ([design.md](design.md), "Look"), and the repository's is drawn heavier. In the box stand its name and, below, its description. A Component whose declaration is gone is drawn under its ID.
- **An arrow per connection**, in the order of `connections`: a straight line from the middle of one box towards the middle of the other, starting and ending at their borders, its head at the element that is used. Where two elements are connected both ways, each line is moved 6 px to its own right, so that both show. A connection that section 5 says is not drawn is left out, and so is one between two boxes with the same middle.
- **A label** in the middle of each line, on a ground of the background's colour, so that it stays legible across a line.
- **The title and the description** above the boxes; the Diagram ID in the picture's `<title>` where there is no title.
- **The legend at the foot**, naming what the picture holds: "Component", "External System", "This repository", and "uses; the arrow points at what is used". It names only what the picture has.
- The picture's `<desc>` holds the description and one sentence per connection — "app uses core: reads and plans ADRs." —, which a screen reader reads out ([design.md](design.md), "A graph is also a text").

**Drift is not drawn**, and neither are Problems: the export is the picture as it is intended.

### Sizes and the width of text

A box without `size` is as large as its text, so its size follows the name and description of the element, and is computed the same way everywhere. Text is IBM Plex Sans where the reader has it and the system's sans serif otherwise; its width cannot be measured without a browser, so it is **estimated from fixed metrics**: each character is given a width in ems, multiplied by the size of the font.

| Characters                                                        | Width   |
| ----------------------------------------------------------------- | ------- |
| combining marks (U+0300 to U+036F)                                | 0       |
| the blank, `i j l I ' \| . , : ; !`                                | 0.3 em  |
| `f r t ( ) [ ] { } / \ - "`                                       | 0.4 em  |
| `m w M W @ %`                                                     | 0.9 em  |
| the other capital letters A to Z                                  | 0.7 em  |
| every other printable ASCII character: small letters, digits, signs | 0.6 em  |
| characters of East Asian scripts that are written wide, and emoji | 1 em    |
| every other character                                             | 0.65 em |

Text in bold is 5 % wider. The figures are on the wide side of the common sans serifs, so that a text fits the box it was measured for; in a narrower font the box has room to spare.

| Text                     | Font                  | Line   |
| ------------------------ | --------------------- | ------ |
| Name in a box            | 14 px, bold (600)     | 18 px  |
| Description in a box     | 12 px                 | 16 px  |
| Label of a connection    | 12 px                 | 16 px  |
| Title of the Diagram     | 16 px, bold (600)     | 20 px  |
| Description of the Diagram, legend | 12 px       | 16 px  |

- A box without `size` is 12 px wider than its text on either side: at least 120 px wide, as wide as its name, and — with a description — as wide as the description on one line, up to 240 px. The description is wrapped at blanks to the width inside the box; a word longer than that stands on a line of its own.
- Its height is 10 px above and below the name and the description, with 4 px between them, and at least 48 px. The text is centred in the box, also in a box with a `size`; text a `size` has no room for stands beyond its border.
- A label's ground is 4 px wider than the label on either side, and one line high.
- The picture is 24 px wider than what it holds on every side; the title and the description stand 16 px above the highest box or label, wrapped at the width of the boxes but at least at 360 px, and the legend 24 px below the lowest.

### What the file is

- **Deterministic**: the same Diagram and the same declaration give the same bytes, with no date, no random ID and every number written the same way — whole numbers as they are, others to two places. A committed SVG therefore changes exactly when the picture does, and a diff of it is short.
- **Self-contained and inert**: no script, no event attribute, no link, no `<image>`, no `<foreignObject>`, no reference to anything outside the file — its one reference is to the arrowhead defined inside it. Fonts are named, never loaded.
- **Safe text**: every text from the Diagram or the declaration is escaped for XML (`&`, `<`, `>`, `"`, `'`), line breaks and tabs inside a text become blanks, and a character XML does not allow becomes U+FFFD.
- **Light and dark**: the colours are a fixed palette of the window's tokens (`packages/app/src/renderer/src/main.css`) — `--panel` behind, `--paper` in the boxes, `--ink` for names and titles, `--ink-soft` for lines, labels and descriptions, `--ink-faint` for borders —, the light ones by default and the dark ones under `prefers-color-scheme: dark`, in a `<style>` inside the file. The background is filled, so that the picture reads on a light page and on a dark one alike.
- Its words — the legend and the sentences of `<desc>` — are English, whoever exports, so that the file does not change with the language of a window.

### The export

The export writes the picture beside its Diagram, `<Diagram ID>.svg` in the same directory, as a previewed change set ([ADR-0004](adr/0004-operations-return-change-sets.md)): a new file, or the whole of the file that is there. The SVG beside a Diagram belongs to the suite, and is not edited by hand. When the file is there already with the same bytes, the change set is empty. A Diagram that cannot be read is not exported.

GitHub shows the SVG where the repository is browsed, and an ADR embeds it as an image: `![The packages](../architecture/diagrams/packages.svg)`. That it is committed although it is derived is recorded in [ADR-0018](adr/0018-a-diagram-is-a-yaml-file-and-its-svg-is-committed-beside-it.md); nothing checks yet that it is current — export again after changing the Diagram.

## 7. What is not in the repository (part 6)

Suggested connections and Drift are derived and never stored, nor cached in the repository. Of all this module computes, only the SVG of section 6 enters the repository, and only when a person exports it.
