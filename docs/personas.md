# Personas

Who Softarch Suite is built for, as five people, so that every part of [plan-vision.md](plan-vision.md) can be measured against someone's day. The tiers of [vision.md](vision.md) ("Who it is for") are behind them: a single architect first, teams through git and CI, a consultant later, and the agent each of them brings. The people are invented; the situations are the ones the suite has to hold up in.

Each persona says what they come with, what they want from the suite, what makes them give up, and the scenario that a part's *done when* is checked against. A part names the personas it serves.

## Lena — the architect of her own repository

**Lead developer of a product team of twelve, and its architect in all but title.** A TypeScript monorepo of six packages, four years old. She writes the ADRs, draws the pictures for onboarding, and answers "may I import this from there?" ten times a week.

- **Comes with:** a repository she knows well, a few ADRs in `docs/adr`, a diagram in a slide deck that nobody updates, rules that live in her head and in review comments.
- **Wants:** to write the rules down once and have CI say them for her; a picture of the architecture that cannot lie because it is bound to the code; to see which decision explains which part of the structure; to be faster than with a whiteboard, a wiki and three linters.
- **Gives up when:** the suite rewrites a file she did not ask it to touch, asks her to run a build to analyse the code, needs a server or an account, or makes her wait for an analysis she did not ask for.
- **Scenario:** opens her repository, adopts the Draft as Components, declares that `ui` may not depend on `persistence`, sees the two places where it does, records one as an Exception justified by an ADR, fixes the other, and sets `adr check` into CI — in an afternoon.

## Jonas — the developer the suite meets in CI

**Backend developer in Lena's team, two years in.** Has never opened the app. Meets the suite when `adr check` fails his pull request.

- **Comes with:** a branch, a red check, and a deadline.
- **Wants:** to understand in one minute what is wrong — which Rule, which import, in which file and line — and what he can do: change the import, or ask for an Exception, with the ADR that would justify it.
- **Gives up when:** the message is an ID without a sentence, a line number that does not match his file, or a failure for something that was already there before his change.
- **Scenario:** reads the annotation on his pull request — "`billing` must not depend on `web`: `packages/billing/src/invoice.ts:3` imports `packages/web/src/format.ts`" — moves the helper, and the check is green; the next week he adds an ADR through a pull request, and `adr check` tells him that its `affects` names a Component that does not exist.

## Aylin — the consultant who assesses someone else's system

**Independent software architect, hired for two weeks to assess a client's system.** A Java backend of 40 Maven modules she has never seen, and a TypeScript front end.

- **Comes with:** a clone of a repository she does not trust, no build environment for it, and a report due to management in ten days.
- **Wants:** to open the repository safely without running anything from it; a structure she can map to Components quickly; to leave remarks on code that survive the client's next commits; to rate quality scenarios with evidence she can point to; a report that a manager can read.
- **Gives up when:** the suite runs `mvn`, needs network access, loses her remarks after a rebase, or produces a report that is a dump of numbers without her judgement in it.
- **Scenario:** opens the clone, adopts a Draft of the Maven modules, finds two cycles and a hotspot with the history analysis, annotates the code that causes them, writes an Assessment that rates six Quality Scenarios with Findings that cite the Violations, the hotspot and her Annotations, records three Risks, and exports the report as a PDF for the client.

## Priya — the reader who never installs the suite

**Head of engineering at Lena's company.** Reads, decides budgets, and asks "why did we do it this way?" in planning meetings.

- **Comes with:** a browser, a PDF reader, and ten minutes.
- **Wants:** the decisions, the architecture overview, the risks and the technical debt as pages she can open from a link or a file share; to see what changed since the last Assessment.
- **Gives up when:** she needs the app, a GitHub account or an explanation of a tool to read it.
- **Scenario:** opens the exported arc42 site from a file share: the building-block view is the current Diagram, chapter 9 lists the ADRs by Status, chapter 11 lists the open Risks and Technical Debt Items; she prints the latest Assessment report and compares it with the one of last quarter.

## The agent — the assistant each of them brings

**An AI coding agent that Lena runs in her editor**, connected to the suite through its MCP server. It writes code, and sometimes the ADR that goes with it.

- **Comes with:** a task, a working tree, and no memory of the architecture.
- **Wants:** to read the Components, the Rules and the decisions before it changes code; to know before it writes an import whether a Rule forbids it; to propose an ADR, an Exception or an Annotation as a change a person previews.
- **Gives up — that is, does the wrong thing — when:** what it can read is a picture rather than data, a refusal has no sentence, or the suite lets it write past a person.
- **Scenario:** asked to add a report to `billing`, it lists the Rules, sees that `billing` may use `persistence` but not `web`, writes the code accordingly, runs the check through the server, and plans an ADR that Lena accepts in the app.

## What the personas decide

- **Lena first.** When a part has to choose, it chooses for the single architect on her own repository; teams are served through files, git and CI, never through a server.
- **Jonas sets the bar for every message the suite prints**: a sentence, a file and a line he can open, and nothing that was already true before his change.
- **Aylin sets the bar for safety and for Java**: nothing from the analysed repository runs, nothing needs the network, and every remark survives a rebase.
- **Priya sets the bar for exports**: they open from disk, in any browser, without the app.
- **The agent sets the bar for the MCP server**: every module's artefacts can be read as data, and every write is a planned change that a person can see.
