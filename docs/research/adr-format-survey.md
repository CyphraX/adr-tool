# ADR format survey: status vocabulary, relations, file naming

Fetch date for every source below: 2026-09-19. All claims come from the primary source named next to them (raw repo files, official docs, the original blog post). Where I state something that is derived from reading a script rather than from a fixture or an explicit statement, it is marked "(derived)".

Repository snapshots used:

- npryce/adr-tools, branch `master`, HEAD `b3279baf9be2207d1a4f4bbd608fd0b591c72aee` at fetch time
- adr/madr, tags `2.1.2`, `3.0.0`, `4.0.0` and branches `main` / `develop`
- thomvaill/log4brains, branch `master`, HEAD `37187fc8e0cd615c155eb27d6116e1e05681a918` at fetch time

All sources were reachable. Nothing in this report is filled in from memory.

---

## 1. Michael Nygard, "Documenting Architecture Decisions" (2011)

Source: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
(adr-tools still cites the older URL `http://thinkrelevance.com/blog/2011/11/15/documenting-architecture-decisions` in its scripts and `init.md`; same article.)

**(a) Status vocabulary and location**

- Four words appear, all in running prose: "proposed", "accepted", "deprecated", "superseded". There is no "rejected" and no "draft". (cognitect.com post, section "Status")
- Status is one of the named parts of the document body. The post lists the parts in this order: Title, Context, Decision, Status, Consequences. Note that Status comes AFTER Decision in the original; adr-tools moved it to the top. (cognitect.com post)
- No literal syntax is prescribed. The post does not show a sample file, a heading level, or a "superseded by" line. The only wording is that a changed or reversed decision may be marked deprecated or superseded "with a reference to its replacement". (cognitect.com post)

**(b) Relations**

- Only supersession, and only in prose: keep the old ADR, "mark it as superseded". No link syntax, no relation names, no "amends". (cognitect.com post)

**(c) File naming, ID, directory**

- `doc/arch/adr-NNN.md`: three-digit placeholder, `adr-` prefix, NO title slug in the file name. (cognitect.com post)
- Numbered "sequentially and monotonically"; numbers are not reused. (cognitect.com post)
- Markdown or Textile are both named as acceptable formats. (cognitect.com post)

**(d) Title format**

- Short noun phrases, example given as `ADR 1: Deployment on Ruby on Rails 3.0.10`. So the original form is `ADR N: Title`, not `N. Title`. (cognitect.com post)

**(e) Date**

- Not mentioned. The post defines no date field; a text search of the page for "date", "dated" and "timestamp" finds only the phrase "kept up to date". (cognitect.com post)

---

## 2. adr-tools (npryce)

Sources:
- Template: https://github.com/npryce/adr-tools/blob/master/src/template.md
- `adr new`: https://github.com/npryce/adr-tools/blob/master/src/adr-new
- `adr link`: https://github.com/npryce/adr-tools/blob/master/src/adr-link
- `adr init`: https://github.com/npryce/adr-tools/blob/master/src/adr-init and https://github.com/npryce/adr-tools/blob/master/src/init.md
- Helpers: https://github.com/npryce/adr-tools/blob/master/src/_adr_add_link , `_adr_remove_status`, `_adr_status`, `_adr_links`, `_adr_title`, `_adr_dir` (same directory)
- Fixtures (strongest evidence for literal output): https://github.com/npryce/adr-tools/blob/master/tests/supercede-existing-adr.expected and https://github.com/npryce/adr-tools/blob/master/tests/linking-new-records.expected
- README: https://github.com/npryce/adr-tools/blob/master/README.md

**(a) Status vocabulary and location**

- Status lives in the body under a level-2 heading, literally `## Status`, which is the FIRST section after the title and date. The template is:

  ```
  # NUMBER. TITLE

  Date: DATE

  ## Status

  STATUS

  ## Context
  ```
  (src/template.md)
- adr-tools has NO status vocabulary and no validation. The only status word the tool ever writes is `Accepted`, substituted for `STATUS` at creation (`-e "s|STATUS|Accepted|"`). New ADRs are therefore born "Accepted", not "Proposed". Anything else is hand-edited free text. (src/adr-new)
- The `## Status` section is a container, not a single value: it holds the status word as one paragraph, plus zero or more link paragraphs (see b). (tests/linking-new-records.expected)
- Superseded is written as a LINK LINE, not as a status word, and it is spelled with a "c": `Superceded by`. Exact fixture output for the old ADR:

  ```
  ## Status

  Superceded by [2. Second Record](0002-second-record.md)
  ```
  The word `Accepted` is deleted from the old ADR, so the link line is all that remains. (tests/supercede-existing-adr.expected; src/adr-new calls `_adr_remove_status "Accepted"`)
- (derived) `_adr_remove_status` only deletes a line that equals exactly `Accepted`. An old ADR whose status had been hand-edited to e.g. `Proposed` keeps that word AND gains the `Superceded by ...` line. A tolerant reader must expect both. (src/_adr_remove_status, src/adr-new)
- The tool's own status reader prints every non-blank, non-heading line between `## Status` and the next heading. (src/_adr_status)

**(b) Relations**

- Built in: `Supersedes` does not exist in this spelling. The tool writes `Supercedes` (new ADR) and `Superceded by` (old ADR). New-ADR fixture:

  ```
  ## Status

  Accepted

  Supercedes [1. First Record](0001-first-record.md)
  ```
  (tests/supercede-existing-adr.expected)
- Custom links: `adr new -l TARGET:LINK:REVERSE-LINK` and `adr link SOURCE LINK TARGET REVERSE-LINK`. LINK and REVERSE-LINK are ARBITRARY strings; the tool does not recognise or validate any relation type. (src/adr-new, src/adr-link)
- `Amends` / `Amended by` appear only as the worked example in the help text (`-l "5:Amends:Amended by"`, `adr link 12 Amends 10 "Amended by"`). The fixture additionally uses `Clarifies` / `Clarified by`, which shows the pair is just an example. (src/adr-new, src/adr-link, tests/linking-new-records.expected)
- Literal line format, one paragraph per link, appended at the end of the `## Status` section: `<LINK TEXT> [<N>. <Title>](<NNNN-slug>.md)`. The link label is the target's H1 minus the leading `# `, so it includes the unpadded number and the dot. The href is the bare file name (same directory, no path). (src/_adr_add_link, src/_adr_title)
- The tool's own link parser is this sed expression, which is a usable reference regex for a reader: `s/^(.+) \[.*\]\(0*([1-9][0-9]*).*\)/\2=\1/p` - link type is everything before ` [`, target ID is the leading integer of the href with zeros stripped. (src/_adr_links)

**(c) File naming, ID, directory**

- `NNNN-slug.md`: `printf "%04d"`, a single dash, then the slug. Next number is max existing leading integer + 1. (src/adr-new)
- Slug: every run of non-alphanumeric characters becomes one `-`, lowercased, leading and trailing non-alphanumerics stripped (`tr -Ccs [:alnum:] - | tr [:upper:] [:lower:]`). (src/adr-new)
- Default directory `doc/adr` (singular `doc`). (README.md, src/_adr_dir, src/adr-init)
- `.adr-dir`: a plain text file containing only the relative path of the ADR directory. `adr init DIR` writes it into the current working directory. Lookup walks from the cwd up to `/`, and at each level takes `.adr-dir` first, else an existing `doc/adr`; fallback `doc/adr`. (src/adr-init, src/_adr_dir)
- A project template override is looked up at `<adr-dir>/templates/template.md` (or env `ADR_TEMPLATE`), so files in an adr-tools directory need not follow the default template. (src/adr-new)

**(d) Title format**

- `# N. Title` with the UNPADDED number: `# 1. Record architecture decisions`, while the file is `0001-record-architecture-decisions.md`. (src/init.md, src/adr-new, fixtures)
- (derived) The title reader is `head -1 | cut -c 3-`, so line 1 must be the H1. adr-tools files therefore never carry YAML front matter. (src/_adr_title)

**(e) Date**

- Body line directly under the H1, literally `Date: 1992-01-12` - plain text, not a heading, not a list item. Format `%Y-%m-%d` (overridable through env `ADR_DATE`); the project's own ADR 8 is titled "use ISO 8601 format for dates". Creation date only; the tool never updates it. (src/template.md, src/adr-new, https://github.com/npryce/adr-tools/tree/master/doc/adr)

---

## 3. MADR

Sources:
- 4.0.0 template: https://github.com/adr/madr/blob/4.0.0/template/adr-template.md
- 3.0.0 template: https://github.com/adr/madr/blob/3.0.0/template/adr-template.md
- 2.1.2 template: https://github.com/adr/madr/blob/2.1.2/template/template.md
- Current template: https://github.com/adr/madr/blob/main/template/adr-template.md
- Docs home (source of adr.github.io/madr): https://github.com/adr/madr/blob/4.0.0/docs/index.md , rendered at https://adr.github.io/madr/
- Changelog: https://github.com/adr/madr/blob/develop/CHANGELOG.md
- MADR's own decisions: https://github.com/adr/madr/tree/4.0.0/docs/decisions (ADR-0002, 0005, 0008, 0009, 0013)

**(a) Status vocabulary and location**

No MADR version I checked (1.4.0, 2.1.2, 3.0.0, 4.0.0, main) uses a `## Status` heading; intermediate releases were not opened. Its ADR-0008 lists "Use separate heading" as a considered option and rejects it as using too much space. (docs/decisions/0008-add-status-field.md)

| Version | Where | Exact template literal |
|---|---|---|
| 1.4.0 | none | the template has no status field at all (https://github.com/adr/madr/blob/1.4.0/template/template.md) |
| 2.1.2 | Bullet list under the H1 | `* Status: [proposed \| rejected \| accepted \| deprecated \| … \| superseded by [ADR-0005](0005-example.md)] <!-- optional -->` |
| 3.0.0 | YAML front matter | `status: {proposed \| rejected \| accepted \| deprecated \| … \| superseded by [ADR-0005](0005-example.md)}` |
| 4.0.0 | YAML front matter, quoted string | `status: "{proposed \| rejected \| accepted \| deprecated \| … \| superseded by ADR-0123"` |

- Vocabulary in 2.x, 3.x and 4.x: proposed, rejected, accepted, deprecated, superseded by - lowercase, and explicitly OPEN-ENDED via the `| … |` placeholder. There is no "draft". (all three templates)
- The 4.0.0 tag is missing the closing `}` of the placeholder; `main` and `develop` read `superseded by ADR-0123}"`. A reader will meet both. (4.0.0 vs main template)
- "superseded by" changed shape between major versions: 2.x and 3.x carry a Markdown link inside the status value, `superseded by [ADR-0005](0005-example.md)`; 4.x carries only an identifier, `superseded by ADR-0123`. Changelog 4.0.0-beta: "Removed link to ADR in `status` field. Only identifier should be put", and the value was put in quotes "to tell YAML it's a string". (CHANGELOG.md)
- The whole front matter block is optional ("optional metadata elements"). In MADR's own decision log I sampled 8 of the 19 ADRs (develop branch): 7 have no `status:` at all, and the one that has it says `status: on hold` - a value outside the template list. Their front matter also carries Jekyll keys (`parent: Decisions`, `nav_order: 8`) that a reader must ignore. (docs/decisions/0003-provide-own-madr-tools.md, 0008-add-status-field.md)
- ADR-0013 itself lists as a drawback of front matter that it "pretends to be more accurate than it can be (e.g., possible status values)". (docs/decisions/0013-use-yaml-front-matter-for-meta-data.md)

**(b) Relations**

- The only relation with fixed wording is `superseded by`, and it lives inside the status value (see a). There is no reverse `supersedes` field in any template.
- 2.x had an optional `## Links` section: `* [Link type] [Link to ADR] <!-- example: Refined by [ADR-0005](0005-example.md) -->`. Free-text link type; the only example is `Refined by`. (2.1.2 template)
- 3.0.0-beta renamed `## Links` to `## More Information`, which is free prose. ADR-0009 chose this and lists "parsing gets harder" as the known downside; its example is a prose sentence starting `[ADR-0008](0008-add-status-field.md) reasons on ...`. (CHANGELOG.md, docs/decisions/0009-support-links-between-adrs-inside-an-adrs.md)
- The plain-text reference form is `ADR-0001` (4 digits). (docs/decisions/0005-use-dashes-in-filenames.md)
- No "amends" anywhere in MADR.

**(c) File naming, ID, directory**

- `NNNN-title-with-dashes.md`, adopted explicitly because it "is exactly the format offered by adr-tools". NNNN is consecutive; the docs assume no more than 9,999 ADRs; title lowercase with dashes. (docs/decisions/0005, docs/index.md)
- MADR's own log starts at `0000-...`, and contains mixed-case slugs such as `0001-use-CC0-or-MIT-as-license.md`, so lowercase is a convention, not a guarantee. (docs/decisions directory listing)
- Directory: `docs/decisions` since 3.0.0-beta; before that `docs/adr`. (CHANGELOG.md, docs/index.md)
- Optional category subfolders (`decisions/backend/0001-use-quarkus.md`), in which case numbers are unique only within a category. (docs/index.md)
- The template file itself sits in the same folder as `adr-template.md` (`template.md` in 2.x), so a reader must skip it. (docs/index.md, CHANGELOG.md)
- The docs allow other naming patterns and warn that then "some existing tooling might not be applicable". (docs/index.md)

**(d) Title format**

- `# {short title ...}` with NO number. ADR-0002 "Do Not Use Numbers in Headings" rejects the `# 2. Title` form explicitly. The ID exists only in the file name. (docs/decisions/0002-do-not-use-numbers-in-headings.md)
- From 3.0.0 on, line 1 of the file is `---`, not the H1. In 4.0.0 there is a blank line between the closing `---` and the H1; in 3.0.0 there is none. (3.0.0 and 4.0.0 templates)

**(e) Date**

- 2.x: bullet `* Date: [YYYY-MM-DD when the decision was last updated]`. 3.x/4.x: front matter `date: {YYYY-MM-DD when the decision was last updated}`. Semantics are LAST UPDATED, not created - the opposite of adr-tools. (all three templates)
- Related people fields changed name: `Deciders` bullet (2.x), `deciders:` (3.x), `decision-makers:` (4.x), plus `consulted:` and `informed:` from 3.0.0-beta.2. (CHANGELOG.md)

---

## 4. log4brains

Sources:
- Template: https://github.com/thomvaill/log4brains/blob/master/docs/adr/template.md
- Status enum: https://github.com/thomvaill/log4brains/blob/master/packages/core/src/adr/domain/AdrStatus.ts
- ADR entity: https://github.com/thomvaill/log4brains/blob/master/packages/core/src/adr/domain/Adr.ts
- Body parser: https://github.com/thomvaill/log4brains/blob/master/packages/core/src/adr/domain/MarkdownBody.ts
- Slug and file rules: `AdrSlug.ts`, `AdrFile.ts`, `AdrRelation.ts` in the same directory
- Own ADRs: https://github.com/thomvaill/log4brains/blob/master/docs/adr/20201016-use-the-adr-slug-as-its-unique-id.md and `20200926-use-the-adr-number-as-its-unique-id.md`
- README: https://github.com/thomvaill/log4brains/blob/master/README.md

**(a) Status vocabulary and location**

- The template is MADR 2.x with two additions (`draft`, `Tags`) and `-` list markers. Status is a bullet in the list directly under the H1:
  `- Status: [draft | proposed | rejected | accepted | deprecated | … | superseded by [xxx](yyyymmdd-xxx.md)] <!-- optional -->` (docs/adr/template.md)
- Closed enum in code, six values: `draft`, `proposed`, `rejected`, `accepted`, `deprecated`, `superseded`. (AdrStatus.ts)
- Parsing rules: the value is lowercased; anything that starts with `superseded by` maps to `superseded`; a missing Status line means `accepted`; an unrecognised value falls back to `draft` (the code comment says this is usually the untouched template text). (AdrStatus.ts, Adr.ts)
- Real superseded example from their own log:
  `- Status: superseded by [20201016-use-the-adr-slug-as-its-unique-id](20201016-use-the-adr-slug-as-its-unique-id.md)`
  The superseder is extracted by stripping `/superseded\s*by\s*:?/i` from the value. (docs/adr/20200926-...md, Adr.ts)
- No YAML front matter. `MarkdownBody.ts` contains no front matter handling at all; metadata is read from the first `<ul>` found between the top of the document and the first `h2`, each item matched with `^\s*<key>\s*:\s*(.*)$`, case-insensitive. Keys read: `Status`, `Deciders`, `Date`, `Tags`. (MarkdownBody.ts, Adr.ts) The core package does depend on a `yaml` library; I did not trace its use and assume it is for the `.log4brains.yml` config file - unverified.

**(b) Relations**

- On supersede the tool writes two things: the old ADR's status value becomes `superseded by [slug](slug.md)` (lowercase), and the new ADR gets a bullet `- Supersedes [slug](slug.md)` under a `## Links` heading at the end of the file, created if absent. (Adr.ts `supersedeBy` / `markAsSuperseder`, AdrRelation.ts, MarkdownBody.ts `addLink`)
- Literal example: `- Supersedes [20200926-use-the-adr-number-as-its-unique-id](20200926-use-the-adr-number-as-its-unique-id.md)`. Note the link label is the slug, not the title. (docs/adr/20201016-...md)
- Other link types are free text in the `## Links` list; the template's only example is `Refined by [xxx](yyyymmdd-xxx.md)`, inherited from MADR 2.x. No "amends". (docs/adr/template.md)

**(c) File naming, ID, directory**

- `YYYYMMDD-slug.md`. The ID is the slug, i.e. the file name without extension; there are no numbers. Slug built with `slugify(title, {lower: true, strict: true})`, prefixed by the creation date formatted `YYYYMMDD`. (AdrSlug.ts)
- This was a deliberate move away from `NNNN-adr-title.md`: their ADR 20201016 supersedes the number scheme because parallel branches produce duplicate numbers and merge conflicts. (docs/adr/20201016-...md)
- When reading, ANY `.md` file in the folder is an ADR except the reserved names `template.md`, `readme.md`, `index.md`, `backlog.md` (case-insensitive). The date prefix is not enforced on read. (AdrFile.ts)
- Default directory `./docs/adr`, set as `adrFolder` in `.log4brains.yml` (README section "How to configure `.log4brains.yml`?"); monorepo packages get their own folder, and then the slug is `package/slug`. (README.md, AdrSlug.ts)

**(d) Title format**

- `# Title`, first H1, no number - same as MADR. (docs/adr/template.md, MarkdownBody.ts `getFirstH1Title`)

**(e) Date**

- Optional bullet `- Date: 2020-10-16`. Accepted input formats are `YYYY-MM-DD` and `DD/MM/YYYY`. If absent, ordering falls back to the Git creation date, then the file creation date, then the slug. (Adr.ts, docs/adr/20201016-...md)
- Tags: optional bullet `- Tags: ...`, split on spaces and/or commas, lowercased. (docs/adr/template.md, Adr.ts)

---

## 5. AWS Prescriptive Guidance, "ADR process"

Sources:
- https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html
- https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/appendix.html
- https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/best-practices.html

This is a process guide, not a file format. It refers readers to adr.github.io for templates.

**(a) Status vocabulary and location**

- Four states, capitalised and bold in the text: **Proposed**, **Accepted**, **Rejected**, **Superseded**. There is NO "Deprecated" and no "Draft". (adr-process.html)
- Lifecycle: an ADR starts as Proposed; review keeps it Proposed (rework), or moves it to Rejected (with a recorded reason) or Accepted. After acceptance or rejection it is immutable; a change needs a new ADR, and once that is approved the old one is set to Superseded. (adr-process.html)
- In the example ADR, status is a body section: `## Status` followed by the single word `Accepted`. (appendix.html)
- No literal "superseded by ..." syntax is shown anywhere. (all three pages)

**(b) Relations**

- Supersession only, described as a process step. No link format, no relation names, no "amends". (adr-process.html, best-practices.html)
- The example carries in-file versioning under `## Notes` (Author, Version `0.1`, Changelog), which sits alongside supersession rather than replacing it. (appendix.html)

**(c) File naming, ID, directory**

- Not mentioned. The guide only recommends a central location, naming a Git repository or a wiki page as the two popular options. (best-practices.html)

**(d) Title format**

- The example uses a `## Title` heading whose content is a full sentence; there is no number. (appendix.html)

**(e) Date**

- Its own body section: `## Date` followed by `2022-03-11`. The process text says the owner adds "a timestamp, version, and list of stakeholders" at acceptance, so the date is the acceptance date. (appendix.html, adr-process.html)

---

## 6. Other templates (one line each)

On the adr.github.io templates page itself (https://adr.github.io/adr-templates/):

- MADR - options with pros and cons plus status and decision-maker metadata.
- Nygard ADR - title, status, context, decision, consequences.
- Y-Statement - one sentence: "In the context of ..., facing ..., we decided for ... to achieve ..., accepting ...".
- ISO/IEC/IEEE 42010:2011 - the standard's Appendix A suggests nine information items per decision.

NOT on adr.github.io, only in Joel Parker Henderson's collection, which adr.github.io links to for "numerous other" formats (https://github.com/joelparkerhenderson/architecture-decision-record):

- Tyree and Akerman (described there as "more sophisticated"), arc42, Alexandrian pattern, business case, Planguage, Paulo Merson.
- That repo also promotes a third naming style: unnumbered, present-tense imperative verb phrase, lowercase with dashes, e.g. `choose-database.md`. MADR's docs point to it as the alternative to `NNNN-`.

---

## Conclusions

### 1. Status set

| Status | Nygard | adr-tools | MADR 2/3/4 | log4brains | AWS |
|---|---|---|---|---|---|
| proposed | yes | free text | yes | yes | yes |
| accepted | yes | yes (only word the tool writes) | yes | yes (also the default when missing) | yes |
| rejected | no | free text | yes | yes | yes |
| deprecated | yes | free text | yes | yes | no |
| superseded | yes | as link line `Superceded by` | `superseded by ...` | `superseded by ...` | yes |
| draft | no | no | no | yes | no |

- `proposed, accepted, rejected, deprecated, superseded` is a sound choice: it is exactly the MADR template list and exactly the log4brains enum minus `draft`. It is the UNION across sources rather than something every source has - Nygard lacks `rejected`, AWS lacks `deprecated`, adr-tools defines no vocabulary at all.
- Extras seen in primary sources: `draft` (log4brains, in both template and code), `on hold` (MADR's own decision log). MADR marks the list as open-ended with `| … |`, so a reader must accept unknown values rather than fail.
- "superseded" is almost never a bare word in files. It is a phrase with a target: `Superceded by [N. Title](file.md)` (adr-tools), `superseded by [ADR-0005](0005-example.md)` (MADR 2/3, log4brains), `superseded by ADR-0123` (MADR 4). Match case-insensitively on `super[sc]eded by`.
- Case differs: adr-tools and AWS capitalise (`Accepted`); MADR and log4brains use lowercase.

### 2. Relation types

- Only Supersedes / Superseded by is established across sources, and even it is written differently everywhere (see above; adr-tools misspells both directions with a "c").
- `Amends` / `Amended by` is NOT a tool-recognised relation anywhere. It exists solely as the example in adr-tools' help text for the free-text `-l` option, where `Clarifies` / `Clarified by` works identically. MADR 2.x and log4brains use `Refined by` as their example instead. MADR 3+ dropped structured links for prose. Nygard and AWS name no relation other than supersession.
- Practical reading rule: treat supersession as the one typed relation; treat any other `<text> [label](file.md)` line in an adr-tools `## Status` section or a MADR 2.x / log4brains `## Links` list as a generic labelled link whose type is the free text.

### 3. ID and file naming

- `NNNN-slug.md` (4 digits, zero-padded, single dash, lowercase dash-separated slug) dominates: adr-tools defined it and MADR adopted it by explicit decision citing adr-tools.
- Deviations: Nygard's original `adr-NNN.md` (3 digits, prefix, no slug); log4brains `YYYYMMDD-slug.md` with the slug as ID, chosen specifically to avoid number collisions on parallel branches; Joel Parker Henderson's unnumbered `verb-phrase.md`; MADR category subfolders where numbers repeat per folder; AWS specifies nothing. MADR's own log starts at `0000` and has mixed-case slugs.
- Directories differ per tool: `doc/adr` (adr-tools, overridable via `.adr-dir`), `docs/adr` (MADR up to 2.x, log4brains), `docs/decisions` (MADR 3+), `doc/arch` (Nygard).

### 4. What contradicts "`NNNN-slug.md` + body-level `## Status` is the dominant legacy convention"

The file-name half holds. The `## Status` half holds only for adr-tools (and AWS's example). Specifically:

1. No MADR version checked uses a `## Status` heading: no status field in 1.4.0, bullet `* Status:` under the H1 in 2.x, YAML `status:` in 3.x and 4.x. log4brains follows the bullet form. A reader needs three status locations: `## Status` section, top bullet list, YAML front matter.
2. In adr-tools the `## Status` section is multi-paragraph: status word plus link lines. A superseded ADR has NO status word left, only `Superceded by [...]`. Status must be inferred from the link line.
3. The "c" spelling (`Superceded` / `Supercedes`) is what adr-tools actually writes.
4. Title lines differ: `# 1. Title` (adr-tools, unpadded number) vs `# Title` (MADR, log4brains, by explicit decision) vs `ADR 1: Title` (Nygard) vs a `## Title` section (AWS).
5. Line 1 is the H1 in adr-tools files but `---` in MADR 3+ files, and MADR front matter may contain unrelated Jekyll keys.
6. Date semantics conflict: adr-tools `Date:` is creation date; MADR `date:` is last-updated; AWS is acceptance date; Nygard has none; log4brains also accepts `DD/MM/YYYY`.
7. Default status differs: adr-tools creates ADRs as `Accepted`; log4brains treats a missing status as `accepted` and an unparseable one as `draft`; MADR's metadata block is wholly optional, so "no status" is a normal state.
8. The ADR directory always contains non-ADR Markdown: `adr-template.md` / `template.md`, `README.md`, `index.md`, `backlog.md`, and adr-tools' `templates/` subfolder.
