<script lang="ts">
  import { RULES_PATH } from '@adr-tool/conformance'
  import type { DecisionLog } from '@adr-tool/core'
  import { DECLARATION_PATH } from '@adr-tool/structure/model'
  import { wordConformanceProblem, wordStructureProblem } from '../lib/said'
  import { app, statusKey } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import type { Placed } from '../lib/together'
  import {
    NO_REPAIR,
    codeSpans,
    describeConsequences,
    describeProblem,
    logName,
    noRepairIn,
    prefixOf,
    repairLabel
  } from '../lib/wording'
  import DiagramsProblems from './DiagramsProblems.svelte'
  import StatusMark from './StatusMark.svelte'

  // The Problems of the repository in front, of every module, in one list (docs/plan-vision.md,
  // part 2). The same list stands in the middle of Decisions, Structure and Conformance; a click
  // opens what a Problem is about in its module, and the list goes along.

  const tab = $derived(app.active)
  const problems = $derived(app.repositoryProblems)
  const logs = $derived(tab?.repository.repository.logs ?? [])
  const structure = $derived(problems?.structure)
  const rules = $derived(problems?.conformance)
  const rulesCount = $derived(
    rules?.state === 'known' ? rules.entries.filter((entry) => !entry.note).length : 0
  )
  const selectedComponent = $derived(
    tab?.module === 'structure' && tab.structure.selection?.kind === 'node'
      ? tab.structure.selection.id
      : undefined
  )
  const decisionsCount = $derived(
    (problems?.decisions.own.length ?? 0) +
      (problems?.decisions.logs.reduce((sum, log) => sum + log.groups.length, 0) ?? 0)
  )

  const isOpen = (one: Placed): boolean =>
    tab?.module === 'decisions' && one.log === app.log?.path && one.adr.id === tab.selectedId
  const logOf = (path: string): DecisionLog | undefined => logs.find((log) => log.path === path)
</script>

{#snippet withCode(text: string)}
  {#each codeSpans(text) as part, position (position)}{#if part.code}<code>{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

{#snippet subject(one: Placed)}
  <button
    class="artefact"
    class:selected={isOpen(one)}
    onclick={() => app.showProblemAdr(one.log, one.adr.id)}
  >
    <StatusMark status={statusKey(one.adr)} />
    {#if logs.length > 1}<span class="log">{logName(one.log)}</span>{/if}
    <span class="prefix">{prefixOf(one.adr)}</span>
    <span class="title">{one.adr.title ?? one.adr.id}</span>
  </button>
{/snippet}

{#snippet count(value: number)}
  <span class="count" class:some={value > 0}>{value}</span>
{/snippet}

<div class="list">
  <div class="head">
    <h2>{t.repositoryProblems.heading}</h2>
    <span class="tools">
      <button onclick={() => app.startSearching()}>{t.search}</button>
      {#if tab?.module === 'structure'}
        <button onclick={() => app.showInStructure(tab.structure.show)}>
          {t.repositoryProblems.backToStructure}
        </button>
      {:else if tab?.module === 'conformance'}
        <button onclick={() => app.showInConformance(tab.conformance.show)}>
          {t.repositoryProblems.backToConformance}
        </button>
      {:else if tab?.module === 'diagrams'}
        <button onclick={() => app.diagrams.closeProblems()}>
          {t.diagrams.backToDiagrams}
        </button>
      {:else}
        <button onclick={() => app.show('adrs')}>{t.backToAdrs}</button>
      {/if}
    </span>
  </div>

  {#if problems && structure && rules}
    <div class="groups">
      <p class="lead">
        {problems.count === 0 && structure.state === 'known' && rules.state === 'known'
          ? t.repositoryProblems.none
          : t.repositoryProblems.lead}
      </p>

      <section aria-label={t.modules.decisions}>
        <h3>{t.modules.decisions} {@render count(decisionsCount)}</h3>
        {#if decisionsCount === 0}
          <p class="empty">{t.repositoryProblems.noneHere}</p>
        {/if}
        <ul>
          {#each problems.decisions.own as problem, position (position)}
            <li class="group">
              <p class="whole">{t.together.repository}</p>
              <p class="what">{describeProblem(problem)}</p>
            </li>
          {/each}
          {#each problems.decisions.logs as { log, groups } (log)}
            {@const decisionLog = logOf(log)}
            {#if logs.length > 1}<li class="in-log">{logName(log)}</li>{/if}
            {#each groups as { problem, subjects, consequences, repairs }, position (position)}
              <li class="group">
                {#each subjects as one (`${one.log}/${one.adr.id}`)}
                  <div class="subject">
                    {@render subject(one)}
                    {#if decisionLog && repairs.length > 1}
                      <!-- Several repairs: any one of them repairs the Problem, and the person says which. -->
                      {#each repairs.filter((repair) => one.log === log && repair.adr === one.adr.id) as repair, nth (nth)}
                        <button
                          class="repair"
                          disabled={app.editing?.adrId === repair.adr}
                          onclick={() => app.repair(repair, log)}
                        >
                          {repairLabel(repair, decisionLog)}
                        </button>
                      {/each}
                    {/if}
                  </div>
                {/each}
                <p class="what">{describeProblem(problem)}</p>
                {#if decisionLog && repairs.length === 1}
                  <button
                    class="repair only"
                    disabled={app.editing?.adrId === repairs[0]!.adr}
                    onclick={() => app.repair(repairs[0]!, log)}
                  >
                    {repairLabel(repairs[0]!, decisionLog)}
                  </button>
                {:else if repairs.length === 0}
                  {@const foreign = subjects.find((one) => one.adr.foreign)?.adr}
                  <p class="by-hand">{foreign ? noRepairIn(foreign) : NO_REPAIR}</p>
                {/if}
                {#if consequences.length > 0}
                  <div class="consequences">
                    <p>{describeConsequences(problem)}</p>
                    <ul>
                      {#each consequences as consequence, nth (nth)}
                        <li>
                          {#each consequence.subjects.filter((one) => !subjects.some((own) => own.adr.id === one.adr.id && own.log === one.log)) as one (`${one.log}/${one.adr.id}`)}
                            {@render subject(one)}
                          {/each}
                          <span class="what">{describeProblem(consequence.problem)}</span>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </li>
            {/each}
          {/each}
        </ul>
      </section>

      <section aria-label={t.repositoryProblems.traces}>
        <h3>{t.repositoryProblems.traces} {@render count(problems.traces.length)}</h3>
        {#if problems.traces.length === 0}
          <p class="empty">{t.repositoryProblems.noneHere}</p>
        {/if}
        <ul>
          {#each problems.traces as trace, position (position)}
            {@const decisionLog = logOf(trace.log)}
            <li class="group">
              {#if trace.subject}<div class="subject">{@render subject(trace.subject)}</div>{/if}
              <p class="what">{describeProblem(trace.problem)}</p>
              {#each trace.repairs as repair, nth (nth)}
                {#if decisionLog}
                  <button
                    class="repair only"
                    disabled={app.editing?.adrId === repair.adr}
                    onclick={() => app.repair(repair, trace.log)}
                  >
                    {repairLabel(repair, decisionLog)}
                  </button>
                {/if}
              {:else}
                <p class="by-hand">
                  {trace.subject?.adr.foreign ? noRepairIn(trace.subject.adr) : NO_REPAIR}
                </p>
              {/each}
            </li>
          {/each}
        </ul>
      </section>

      <section aria-label={t.modules.structure}>
        <h3>
          {t.modules.structure}
          {#if structure.state === 'known'}{@render count(structure.entries.length)}{/if}
        </h3>
        {#if structure.state === 'reading'}
          <p class="empty" role="status">{t.repositoryProblems.reading}</p>
        {:else if structure.state === 'failed'}
          <p class="empty">{t.repositoryProblems.failed(structure.reason)}</p>
        {:else}
          {#if structure.again}
            <p class="empty" role="status">{t.repositoryProblems.again}</p>
          {:else if tab?.outline.known && !tab.outline.known.current}
            <!-- Structure is not open, so its files are not watched: say how old the list is. -->
            <p class="empty">{t.repositoryProblems.asOfShort(tab.outline.known.analysedAt)}</p>
          {/if}
          {#if structure.entries.length === 0}
            <p class="empty">
              {structure.origin === 'draft'
                ? t.repositoryProblems.draft
                : t.repositoryProblems.noneHere}
            </p>
          {/if}
          <ul>
            {#each structure.entries as entry, position (position)}
              <li class="group">
                <div class="subject">
                  {#each entry.components as id (id)}
                    <button
                      class="artefact"
                      class:selected={id === selectedComponent}
                      onclick={() => app.showComponent(id, true)}
                    >
                      <span class="kind">{t.repositoryProblems.component}</span>
                      <code>{id}</code>
                    </button>
                  {:else}
                    <button class="artefact" onclick={() => app.showProblemDeclaration()}>
                      <span class="kind">{t.repositoryProblems.declaration}</span>
                      <code>{DECLARATION_PATH}</code>
                    </button>
                  {/each}
                </div>
                <p class="what">{@render withCode(wordStructureProblem(entry.problem))}</p>
                {#if entry.repairable}
                  <button class="repair only" onclick={() => app.repairStructure(entry.problem)}>
                    {t.structure.repair}
                  </button>
                {:else}
                  <p class="by-hand">{@render withCode(t.repositoryProblems.byHand)}</p>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section aria-label={t.modules.conformance}>
        <h3>
          {t.modules.conformance}
          {#if rules.state === 'known'}{@render count(rulesCount)}{/if}
        </h3>
        {#if rules.state === 'reading'}
          <p class="empty" role="status">{t.repositoryProblems.rulesReading}</p>
        {:else if rules.state === 'failed'}
          <p class="empty">{t.repositoryProblems.rulesFailed(rules.reason)}</p>
        {:else}
          {#if rules.again}
            <p class="empty" role="status">{t.repositoryProblems.rulesAgain}</p>
          {/if}
          {#if rules.entries.length === 0}
            <p class="empty">{t.repositoryProblems.noneHere}</p>
          {/if}
          <ul>
            {#each rules.entries as entry, position (position)}
              <li class="group" class:note={entry.note}>
                <div class="subject">
                  <button class="artefact" onclick={() => app.showInRulesFile(entry.found.line)}>
                    <span class="kind"
                      >{entry.note
                        ? t.repositoryProblems.note
                        : t.repositoryProblems.rulesFile}</span
                    >
                    <code>{RULES_PATH}</code>
                    <span class="kind">{t.repositoryProblems.atLine(entry.found.line)}</span>
                  </button>
                </div>
                <p class="what">{@render withCode(wordConformanceProblem(entry.found))}</p>
                {#if entry.repair}
                  {@const repair = entry.repair}
                  <button class="repair only" onclick={() => app.repairConformance(repair)}>
                    {repair.kind === 'remove-exception'
                      ? t.review.removeException.action
                      : t.review.narrowException.action}
                  </button>
                {:else if !entry.note}
                  <p class="by-hand">{@render withCode(t.repositoryProblems.rulesByHand)}</p>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <DiagramsProblems section={problems.diagrams} />
    </div>
  {/if}
</div>

<style>
  .list {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--panel-raised);
    border-right: 1px solid var(--line);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex: none;
    padding: 6px 14px;
    border-bottom: 1px solid var(--line);
  }

  h2 {
    min-width: 0;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .tools {
    display: flex;
    flex: none;
    gap: 8px;
  }

  .head button,
  .repair {
    padding: 3px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .head button:hover,
  .repair:hover {
    background: var(--hover);
  }

  .groups {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 16px;
    user-select: text;
    cursor: auto;
  }

  .lead {
    padding: 10px 14px 4px;
    color: var(--ink-soft);
    line-height: 1.5;
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 14px 6px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  ul {
    list-style: none;
    padding: 0;
  }

  .in-log {
    padding: 8px 14px 2px;
    font-family: var(--code);
    font-size: 11.5px;
    color: var(--ink-faint);
  }

  .group {
    padding: 10px 14px 12px 11px;
    border-left: 3px solid var(--problem);
    border-bottom: 1px solid var(--line);
    background: var(--paper);
  }

  /* A note fails nothing: it is not red. */
  .group.note {
    border-left-color: var(--line-strong);
  }

  .subject {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 4px 10px;
    min-height: 26px;
  }

  .artefact {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 2px 6px;
    margin-left: -6px;
    border-radius: 3px;
    font-weight: 500;
    text-align: left;
  }

  .artefact:hover {
    background: var(--hover);
  }

  .artefact.selected {
    background: var(--selected);
  }

  .artefact :global(svg) {
    flex: none;
  }

  .log,
  .kind {
    flex: none;
    font-size: 12px;
    font-weight: 400;
    color: var(--ink-faint);
  }

  .prefix {
    flex: none;
    color: var(--ink-soft);
    font-weight: 400;
  }

  .title {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  code {
    font-family: var(--code);
    font-size: 0.92em;
  }

  .repair {
    flex: none;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .repair.only {
    margin-top: 8px;
  }

  .repair:disabled {
    color: var(--ink-faint);
  }

  .whole {
    font-weight: 500;
  }

  .what {
    color: var(--ink-soft);
    line-height: 1.5;
  }

  .group > .what {
    margin-top: 2px;
  }

  .by-hand {
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--ink-faint);
  }

  .consequences {
    margin-top: 10px;
    padding: 8px 10px;
    border-radius: 4px;
    background: var(--panel);
  }

  .consequences > p {
    color: var(--ink-soft);
    line-height: 1.5;
  }

  .consequences li {
    margin-top: 8px;
  }

  .consequences .artefact {
    font-weight: 400;
  }

  .consequences .what {
    display: block;
    font-size: 12px;
  }

  .empty {
    padding: 2px 14px 6px;
    color: var(--ink-soft);
    line-height: 1.5;
  }

  .count {
    color: var(--ink-faint);
  }

  .count.some {
    min-width: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--problem);
    color: var(--paper);
    font-size: 10.5px;
    font-weight: 600;
    line-height: 16px;
    text-align: center;
  }
</style>
