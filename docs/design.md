# Design

How the window of Softarch Suite looks and behaves, written down so that every module added by [plan-vision.md](plan-vision.md) looks like one product and not like six tools behind one launcher ([vision.md](vision.md), principle 2). It records what Decisions does; where Structure does not do it yet, it says so, and the part that catches up. A part that has to depart from it says so in its status, and changes this document in the same pull request.

## The frame

- **One tab per repository**, across the top of the window. A tab keeps its module, its view and its selection while another is in front.
- **The bar at the top** holds the tabs on the left and, on the right, for the tab in front, the module switcher — one word per module, in the order of [vision.md](vision.md): Decisions, Structure, Conformance, Diagrams, Review, Assessment, Documentation — then the language menu and **Open repository**. A module shows in the switcher from the part that builds it on.
- **Three panes** in every module:
  - The **sidebar** on the left: what there is to look at, and filters. Each entry is a row with its label on the left and a count on the right. A count of something wrong is a red badge. Sections have small grey headings.
  - The **centre**: the list, graph, matrix, board or document of the view. Its head row has the view's title on the left and its tools on the right, as bordered buttons or a segmented switch; a legend, where the view needs one, stands at its foot.
  - The **detail** on the right: the thing that is selected. It starts with a small grey label of its kind ("Component", "Rule", "Annotation"), its title, its ID in the code font, and its actions as bordered buttons in one row; then sections, each under a small grey heading. The divider between the panes can be dragged — in Structure from part 4 of [plan-vision.md](plan-vision.md) on.
- **Every module answers the same three questions** in the same places: what there is (sidebar), how it hangs together (centre), and what this one is (detail).

## Writing

- **Nothing is written without a preview** ([ADR-0004](adr/0004-operations-return-change-sets.md)). Every action that changes a file opens the change dialog: a title that says what happens, a line that says how many files change, the diff of each, and the action as the dialog's one primary button.
- **One primary button per view**, dark and filled: in a dialog, the action that writes, on the right with Cancel left of it; in a view, the one thing the view is there for, such as **Adopt the Draft**. The actions of a detail are bordered buttons, each opening the preview of what it writes.
- **Forms write the files people also edit by hand.** A form changes the lines it is about and nothing else ([ADR-0002](adr/0002-never-reserialize-markdown.md)); what it cannot write without rewriting more, it refuses with a sentence.

## Words

- **No text in a component.** Every word the window shows is in `strings.en.ts` and `strings.de.ts`, and what is said about the domain in `wording.en.ts` and `wording.de.ts`; what a core package says has a code and its sentence (part 12 of [plan-roadmap.md](plan-roadmap.md)). German addresses the person as "Sie".
- **The terms of the glossaries** are written with a capital and used exactly: a Component, a Rule, a Violation, a Drift, an Annotation, a Finding. A word the glossary lists under _Avoid_ is not used for it.
- **A message is a sentence** that says what is wrong, where, and what can be done — the bar Jonas sets in [personas.md](personas.md). An empty view says why it is empty and what fills it.
- **Numbers** are right-aligned in tables, with the unit in the heading; a metric has its definition in a tooltip.

## Look

- **Colours come from the tokens** of `packages/app/src/renderer/src/main.css`, never as literal values, so that light and dark follow the system.
- **Colour has a meaning.** Red (`--problem`) is for what is wrong: a Problem, a Violation, a Cycle, a Drift. The colours of the five Status values say a Status and nothing else — a rejected ADR is red without being wrong. Amber is for what waits for a person, green for what is decided or holds. Selection, hover and the code have tokens of their own; everything else is ink on paper, in three strengths.
- **Type:** IBM Plex Sans for the window, IBM Plex Serif for what people write as documents — an ADR, an Assessment, a chapter of arc42 —, IBM Plex Mono for code, paths and IDs.
- **Words over icons.** The marks of a Status and the × that closes a tab are the only icons; a button says what it does.
- **Graphs** read from left to right: a box stands to the right of what it depends on, and its arrow points there. A solid line is a Dependency, a dashed one type-only; red marks a Cycle or a Violation. A dashed border marks something from elsewhere. Every graph has its legend at its foot.

## Behaviour

- **The keyboard reaches everything.** A list is a listbox that the arrows move through; <kbd>Ctrl</kbd> <kbd>K</kbd> (<kbd>⌘</kbd> <kbd>K</kbd>) searches; <kbd>Escape</kbd> closes a dialog; focus is drawn in `--focus`. Structure's lists catch up in part 4 of [plan-vision.md](plan-vision.md).
- **A graph is also a text.** Every graph and Diagram has a list beside it that a screen reader reads out as sentences, and its boxes are buttons in reading order — the Relations graph since part 14 of [plan-roadmap.md](plan-roadmap.md), Structure's Dependency graph from part 4 of [plan-vision.md](plan-vision.md) on.
- **Analysis happens in the background.** The window stays usable while code is analysed, says what it is doing, and shows the last result until the new one is there.
- **What is derived is never stored**, and the window says when something is derived: a Draft, a Violation, a Drift, a metric.
