# Configuration

The contract of the suite's settings for a repository: `.arch/config.yml`, beside the declaration of Components in `.arch/components.yml`. There is one file for every module, and each module has a key of its own at its top. What a key means, and what its module does without it, is in that module's format; this document is the file around the keys.

```yaml
# .arch/config.yml
diagrams: design/diagrams
```

That the modules share one file, each with a key of its own, is recorded in [ADR-0018](adr/0018-a-diagram-is-a-yaml-file-and-its-svg-is-committed-beside-it.md).

## 1. The file

- The file is optional, and so is every key in it: without the file, without a key, or with a key that has no value, its module uses its default. A file with nothing in it, or with comments only, is the same as none.
- It is YAML whose top level is a map. A key at the top belongs to one module, which reads that key and no other.
- Keys that no module knows, or that a module of a later version brings, are preserved and ignored, so that a repository can be opened by an older version of the suite.
- Opening a repository never writes the file. When the suite writes it, it changes the lines of its own key and nothing else ([ADR-0002](adr/0002-never-reserialize-markdown.md)).

The kernel reads the file for every module (`readConfig` and `openConfig` in `packages/kernel/src/config.ts`): it hands each key at the top to the modules with its value and its line, and knows none of them.

## 2. When it cannot be read

A file that is not YAML — a key written twice at the top included: which of the two is meant, nobody can tell — or whose top level is not a map is **one Problem of the file**. It is reported once, whichever modules keep settings there, and has no Repair.

| Problem                                                          | Code                | Sentence                                                                                                         |
| ---------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| The file cannot be read: it is not YAML, or its top level is not a map. | `unreadable-config` | .arch/config.yml cannot be read: its top level must be a map. What its settings decide is not done until it is fixed. |

Its detail says why: `config-not-yaml`, with what the YAML parser said, or `config-not-map`.

While the file cannot be read, **no module falls back on its defaults**: what a setting decides is not done until the file is fixed. Using the default instead would hide the mistake — the Diagrams would be looked for in the default directory and not be found, without a word —, as it would for Decision Logs ([file-format.md](file-format.md), section 6).

A key whose value its module cannot use is a Problem of that module, at the line of the key, and keeps that module from doing what the key decides; the other modules read theirs.

## 3. The keys

| Key        | Module   | Value                                                         | Without it                    | Contract                                          |
| ---------- | -------- | ------------------------------------------------------------- | ----------------------------- | ------------------------------------------------- |
| `diagrams` | Diagrams | The directory of the Diagrams: a relative path inside the repository | `docs/architecture/diagrams` | [diagrams-format.md](diagrams-format.md), section 1 |

A module that gets a setting adds its key here.

## 4. What is not here

- **The settings of Decisions** stay in `.adr/config.yml` — where the Decision Logs are and how they are numbered, the name of the repository, the Template that is preselected —, which keeps being read for good ([file-format.md](file-format.md), sections 6 and 7; [vision.md](vision.md), "On disk, in a user's repository").
- **The declaration of Components**, `.arch/components.yml`, is a model the architect writes, not a setting ([structure-format.md](structure-format.md), section 1).
