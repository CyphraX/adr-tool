/** The Template that is preselected when a repository configures none. */
export const DEFAULT_TEMPLATE = 'minimal'

/**
 * The Templates every repository has without configuring anything (docs/file-format.md,
 * section 7). A file of the same name in `.adr/templates/` takes the place of one of these.
 */
export const BUILT_IN_TEMPLATES: Readonly<Record<string, string>> = {
  minimal: `# {{title}}

What is the context, what did we decide, and why? One to three sentences are enough.
`,

  nygard: `# {{title}}

## Context

What is the issue that motivates this decision? Which forces are at play?

## Decision

What is the change that we are making?

## Consequences

What becomes easier or harder because of this decision?
`,

  madr: `# {{title}}

## Context and Problem Statement

Describe the context and the problem in two or three sentences, or as a question.

## Decision Drivers

- A force or concern that matters for this decision

## Considered Options

- Option 1
- Option 2

## Decision Outcome

Chosen option: "Option 1", because it is the only one that meets the decisive driver.

### Consequences

- Good, because …
- Bad, because …

## Pros and Cons of the Options

### Option 1

- Good, because …
- Bad, because …

### Option 2

- Good, because …
- Bad, because …

## More Information

Evidence, links, and when this decision should be looked at again.
`
}
