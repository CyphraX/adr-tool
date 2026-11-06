<script lang="ts">
  import { fingerprintText, RULES_PATH, type Rule } from '@adr-tool/conformance'
  import type {
    ConformanceException,
    ConformanceView,
    ConformanceViolation
  } from '../../../shared/ipc'
  import {
    adrNamed,
    exceptionNames,
    metricWording,
    referenceOf,
    ruleSays
  } from '../lib/conformance'
  import { wordConformance } from '../lib/said'
  import { app, statusKey } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { codeSpans, logName, prefixOf } from '../lib/wording'
  import Picker from './Picker.svelte'
  import RuleForm from './RuleForm.svelte'
  import StatusMark from './StatusMark.svelte'

  // What the selection in Conformance stands for: a Violation with its Rule and the imports
  // behind it, each line a click into the code viewer, and the way to accept it; a Rule with
  // what it says, why, and where it is written; an Exception with its reason and its ADR. A
  // Rule being written takes the place of all of them.
  let { view }: { view: ConformanceView } = $props()

  const conformance = $derived(app.active?.conformance)
  const selection = $derived(conformance?.selection)
  const accepting = $derived(conformance?.accepting)
  const logs = $derived(app.active?.repository.repository.logs ?? [])
  const openPath = $derived(conformance?.code?.path)
  const openLine = $derived(conformance?.code?.line)

  const ruleOf = (id: string): Rule | undefined => view.rules.find((rule) => rule.id === id)

  /** Every ADR of the repository, as an Exception names it. */
  const candidates = $derived(
    logs.flatMap((log) =>
      log.adrs.map((adr) => ({ id: referenceOf(log.path, adr.id), adr, log: log.path }))
    )
  )

  const violationOf = (key: string): ConformanceViolation | undefined =>
    view.violations.find((violation) => violation.key === key)
</script>

{#snippet withCode(text: string)}
  {#each codeSpans(text) as part, position (position)}{#if part.code}<code>{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

{#snippet fileLink(path: string, marks: readonly number[] = [])}
  <button
    class="path file"
    class:open={openPath === path}
    title={t.structure.viewer.open(path)}
    onclick={() => app.openConformanceCode(path, marks)}>{path}</button
  >
{/snippet}

{#snippet lineLinks(path: string, lines: readonly number[])}
  <span class="faint lines"
    >{t.structure.detail.lineWord(lines.length)}
    {#each lines as line, position (line)}{#if position > 0},
      {/if}<button
        class="line"
        class:open={openPath === path && openLine === line}
        aria-label={t.structure.viewer.openAt(path, line)}
        title={t.structure.viewer.openAt(path, line)}
        onclick={() => app.openConformanceCode(path, lines, line)}>{line}</button
      >{/each}</span
  >
{/snippet}

{#snippet writtenAt(line: number)}
  <h3>{t.conformance.detail.written}</h3>
  <p>
    <button
      class="path file"
      class:open={openPath === RULES_PATH && openLine === line}
      title={t.structure.viewer.openAt(RULES_PATH, line)}
      onclick={() => app.openConformanceCode(RULES_PATH, [line], line)}>{RULES_PATH}:{line}</button
    >
  </p>
{/snippet}

{#snippet adrLink(reference: string)}
  {@const named = adrNamed(reference, logs)}
  {#if named}
    <button class="link adr" onclick={() => app.jumpTo(named.log, named.adr.id)}>
      <StatusMark status={statusKey(named.adr)} />
      {#if logs.length > 1}<span class="log">{logName(named.log)}</span>{/if}
      <span class="prefix">{prefixOf(named.adr)}</span>
      {named.adr.title ?? named.adr.id}
    </button>
  {:else}
    <span class="problem">{t.conformance.detail.notAnAdr(reference)}</span>
  {/if}
{/snippet}

{#snippet violationLinks(list: readonly ConformanceViolation[])}
  <ul class="links">
    {#each list as violation (violation.key)}
      <li class:accepted={violation.exception}>
        <button
          class="link"
          onclick={() => app.selectInConformance({ kind: 'violation', key: violation.key })}
          >{wordConformance(violation.said)}</button
        >
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet ruleLink(id: string)}
  {@const rule = ruleOf(id)}
  <p>
    <button class="link" onclick={() => app.selectInConformance({ kind: 'rule', id })}
      ><code>{id}</code></button
    >
  </p>
  {#if rule}
    <p>{ruleSays(rule)}</p>
    <p class="faint">{rule.why}</p>
  {/if}
{/snippet}

{#snippet acceptForm(violation: ConformanceViolation, form: NonNullable<typeof accepting>)}
  <form
    class="accept"
    onsubmit={(event) => {
      event.preventDefault()
      void app.planExceptionOfForm()
    }}
  >
    <label class="field">
      <span class="name">{t.conformance.detail.reason}</span>
      <!-- svelte-ignore a11y_autofocus -->
      <textarea
        bind:value={form.reason}
        rows="3"
        placeholder={t.conformance.detail.reasonPlaceholder}
        autofocus
      ></textarea>
    </label>
    <div class="field">
      <span class="name">{t.conformance.detail.justifiedByOptional}</span>
      {#if form.justifiedBy !== ''}
        {@const named = adrNamed(form.justifiedBy, logs)}
        <span class="chosen">
          {#if named}
            <StatusMark status={statusKey(named.adr)} />
            <span class="prefix">{prefixOf(named.adr)}</span>
            <span class="title">{named.adr.title ?? named.adr.id}</span>
          {:else}
            <code>{form.justifiedBy}</code>
          {/if}
          <button
            type="button"
            class="remove"
            aria-label={t.metadata.remove(form.justifiedBy)}
            onclick={() => (form.justifiedBy = '')}>×</button
          >
        </span>
      {:else}
        <Picker
          {candidates}
          label={t.conformance.detail.justifiedByOptional}
          placeholder={t.conformance.detail.adrPlaceholder}
          noneLeft={t.conformance.detail.noAdrLeft}
          textOf={({ id, adr }) => `${id} ${prefixOf(adr)} ${adr.title ?? ''}`}
          newestFirst
          onpick={(id) => (form.justifiedBy = id)}
        >
          {#snippet option({ adr, log })}
            <StatusMark status={statusKey(adr)} />
            {#if logs.length > 1}<span class="log">{logName(log)}</span>{/if}
            <span class="prefix">{prefixOf(adr)}</span>
            <span class="title">{adr.title ?? adr.id}</span>
          {/snippet}
        </Picker>
      {/if}
    </div>
    <div class="buttons">
      <button type="button" class="action" onclick={() => app.cancelAccepting()}>{t.cancel}</button>
      <button
        type="submit"
        class="action primary"
        disabled={form.reason.trim() === '' || form.key !== violation.key}
        >{t.conformance.detail.preview}</button
      >
    </div>
  </form>
{/snippet}

{#snippet violationDetail(violation: ConformanceViolation)}
  {@const rule = ruleOf(violation.rule)}
  <p class="kind">{t.conformance.detail.violation}</p>
  <h2>{wordConformance(violation.said)}</h2>
  <p><code>{fingerprintText(violation.fingerprint)}</code></p>
  {#if !violation.exception && accepting?.key !== violation.key}
    <div class="actions">
      <button
        class="action"
        title={t.conformance.detail.acceptHint}
        onclick={() => app.startAccepting(violation.key)}>{t.conformance.detail.accept}</button
      >
    </div>
  {/if}
  {#if accepting && accepting.key === violation.key}
    {@render acceptForm(violation, accepting)}
  {/if}

  {#if violation.exception}
    {@const exception = violation.exception}
    <h3>{t.conformance.detail.acceptedBy}</h3>
    <p>{exception.reason}</p>
    {#if exception.justifiedBy}
      <p>{@render adrLink(exception.justifiedBy.adr)}</p>
    {/if}
    <p>
      <button
        class="link"
        onclick={() => app.showInConformanceModule({ kind: 'exception', line: exception.line })}
        >{RULES_PATH}:{exception.line}</button
      >
    </p>
  {/if}

  <h3>{t.conformance.detail.rule}</h3>
  {@render ruleLink(violation.rule)}

  {#if violation.cycle}
    {@const cycle = violation.cycle}
    <h3>{t.conformance.detail.roundTrip}</h3>
    <p class="trip">
      {#each [...cycle.roundTrip, cycle.roundTrip[0]!] as member, position (position)}
        {#if position > 0}<span class="arrow" aria-hidden="true">→</span>{/if}
        <code>{member}</code>
      {/each}
    </p>
    {#if cycle.weakest}
      <h3>{t.conformance.detail.weakest}</h3>
      <p><code>{cycle.weakest.from}</code> → <code>{cycle.weakest.to}</code></p>
    {/if}
  {/if}

  {#if violation.value !== undefined && rule?.kind === 'threshold'}
    {@const metric = metricWording(rule.metric)}
    <h3>{t.conformance.detail.value}</h3>
    <p title={metric.definition}>
      {metric.long}: {metric.value(violation.value)}
    </p>
  {/if}

  {#if violation.file !== undefined && violation.line !== undefined}
    <h3>{t.conformance.detail.inCode}</h3>
    <p>
      {@render fileLink(violation.file, [violation.line])}
      {@render lineLinks(violation.file, [violation.line])}
    </p>
  {/if}

  {#if violation.uses !== undefined}
    <!-- A Rule about Libraries: each Source File that imports the Library, at its lines. -->
    <h3>{t.conformance.detail.uses}</h3>
    <ul class="dependencies">
      {#each violation.uses as use (use.file)}
        <li>
          {@render fileLink(use.file, use.lines)}
          {@render lineLinks(use.file, use.lines)}
          {#if use.typeOnly}<span class="tag">{t.structure.detail.typeOnly}</span>{/if}
          <span class="to"
            ><span class="arrow" aria-hidden="true">→</span><code>{use.library}</code></span
          >
        </li>
      {/each}
    </ul>
  {:else}
    <h3>{t.conformance.detail.imports}</h3>
    {#if violation.dependencies.length === 0}
      <p class="faint">{t.conformance.detail.noImports}</p>
    {:else}
      <ul class="dependencies">
        {#each violation.dependencies as dependency (`${dependency.from}\n${dependency.to}`)}
          <li>
            {@render fileLink(dependency.from, dependency.lines)}
            {@render lineLinks(dependency.from, dependency.lines)}
            {#if dependency.typeOnly}<span class="tag">{t.structure.detail.typeOnly}</span>{/if}
            <span class="to"
              ><span class="arrow" aria-hidden="true">→</span>{@render fileLink(
                dependency.to
              )}</span
            >
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
{/snippet}

{#snippet ruleDetail(rule: Rule)}
  {@const violations = view.violations.filter((violation) => violation.rule === rule.id)}
  {@const exceptions = view.exceptions.filter((exception) => exception.rule === rule.id)}
  <p class="kind">{t.conformance.detail.rule}</p>
  <h2>{ruleSays(rule)}</h2>
  <p><code>{rule.id}</code></p>
  <div class="actions">
    <button class="action" onclick={() => app.startRule(rule.id)}
      >{t.conformance.detail.change}</button
    >
    <button class="action" onclick={() => app.removeRule(rule.id)}
      >{t.conformance.detail.remove}</button
    >
    {#if conformance?.rule !== rule.id || conformance.show !== 'list'}
      <button class="action" onclick={() => app.showRuleViolations(rule.id)}
        >{t.conformance.detail.showViolations}</button
      >
    {/if}
  </div>

  <h3>{t.conformance.detail.why}</h3>
  <p>{rule.why}</p>

  <h3>{t.conformance.detail.kind}</h3>
  <p><code>{rule.kind}</code></p>
  <p>{@render withCode(t.conformance.kinds[rule.kind].about)}</p>

  {@render writtenAt(rule.line)}

  {#if rule.tests || rule.ignoreTypeOnly}
    <h3>{t.conformance.detail.options}</h3>
    {#if rule.tests}<p>{t.conformance.detail.testsIncluded}</p>{/if}
    {#if rule.ignoreTypeOnly}<p>{t.conformance.detail.typeOnlyIgnored}</p>{/if}
  {/if}

  <h3>{t.conformance.detail.violations}</h3>
  {#if violations.length === 0}
    <p class="faint">{view.evaluated ? t.conformance.detail.noViolations : '–'}</p>
  {:else}
    {@render violationLinks(violations)}
  {/if}

  {#if exceptions.length > 0}
    <h3>{t.conformance.detail.exceptions}</h3>
    <ul class="links">
      {#each exceptions as exception (exception.line)}
        <li>
          <button
            class="link"
            onclick={() => app.showInConformanceModule({ kind: 'exception', line: exception.line })}
            ><code>{exceptionNames(exception)}</code></button
          >
          <span class="faint">{exception.reason}</span>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet exceptionDetail(exception: ConformanceException)}
  {@const fingerprint = exception.fingerprint}
  <p class="kind">{t.conformance.detail.exception}</p>
  <h2><code>{exceptionNames(exception)}</code></h2>
  {#if fingerprint}<p><code>{fingerprintText(fingerprint)}</code></p>{/if}
  {#if fingerprint}
    <div class="actions">
      <button
        class="action"
        onclick={() =>
          app.repairConformance({ kind: 'remove-exception', line: exception.line, fingerprint })}
        >{t.conformance.detail.removeException}</button
      >
    </div>
  {/if}

  <h3>{t.conformance.detail.reason}</h3>
  <p>{exception.reason}</p>

  {#if exception.justifiedBy}
    <h3>{t.conformance.detail.justifiedBy}</h3>
    <p>{@render adrLink(exception.justifiedBy.adr)}</p>
  {/if}

  <h3>{t.conformance.detail.rule}</h3>
  {@render ruleLink(exception.rule)}

  {@render writtenAt(exception.line)}

  <h3>{t.conformance.detail.accepts}</h3>
  {#if exception.accepts.length === 0}
    <p class="faint">{t.conformance.detail.acceptsNothing}</p>
  {:else}
    {@render violationLinks(
      exception.accepts.map(violationOf).filter((violation) => violation !== undefined)
    )}
  {/if}
{/snippet}

<aside aria-label={t.conformance.detail.label}>
  {#if conformance?.form}
    <RuleForm form={conformance.form} />
  {:else if selection?.kind === 'violation' && violationOf(selection.key)}
    {@render violationDetail(violationOf(selection.key)!)}
  {:else if selection?.kind === 'rule' && ruleOf(selection.id)}
    {@render ruleDetail(ruleOf(selection.id)!)}
  {:else if selection?.kind === 'exception' && view.exceptions.some((one) => one.line === selection.line)}
    {@render exceptionDetail(view.exceptions.find((one) => one.line === selection.line)!)}
  {:else if conformance?.show === 'graph' && conformance.graphSelection}
    <p class="hint">{t.conformance.detail.breaksNothing}</p>
    <p class="hint">{t.conformance.detail.graphHint}</p>
  {:else}
    <p class="hint">
      {conformance?.show === 'graph' ? t.conformance.detail.graphHint : t.conformance.detail.hint}
    </p>
  {/if}
</aside>

<style>
  aside {
    overflow-y: auto;
    padding: 14px 18px 24px;
    background: var(--paper);
    line-height: 1.5;
  }

  h2 {
    margin-bottom: 4px;
    font-size: 15px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  h2 code {
    font-size: 14px;
  }

  h3 {
    margin: 16px 0 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  p + p {
    margin-top: 2px;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0;
    list-style: none;
  }

  .kind {
    color: var(--ink-faint);
    font-size: 11.5px;
    font-weight: 600;
  }

  .faint {
    color: var(--ink-faint);
  }

  .hint {
    margin-top: 12px;
    color: var(--ink-soft);
  }

  .problem {
    color: var(--problem);
  }

  .link {
    color: var(--focus);
    text-align: left;
  }

  .link:hover {
    text-decoration: underline;
  }

  .link.adr {
    color: var(--ink);
  }

  .link.adr :global(svg) {
    display: inline-block;
    margin-right: 4px;
    vertical-align: -1px;
  }

  .prefix,
  .log {
    color: var(--ink-soft);
  }

  .log {
    font-size: 12px;
  }

  .links li.accepted .link {
    color: var(--ink-soft);
  }

  .links li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .action {
    padding: 3px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--panel-raised);
  }

  .action:hover {
    background: var(--hover);
  }

  .action.primary {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
  }

  .action.primary:hover:not(:disabled) {
    border-color: var(--focus);
    background: var(--focus);
  }

  .action:disabled {
    opacity: 0.5;
  }

  .accept {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel-raised);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .name {
    color: var(--ink-soft);
    font-size: 12px;
    font-weight: 600;
  }

  textarea {
    padding: 4px 6px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    line-height: 1.45;
    resize: vertical;
  }

  .chosen {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    padding: 2px 4px 2px 8px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .chosen .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .remove {
    width: 20px;
    height: 20px;
    border-radius: 3px;
    color: var(--ink-faint);
  }

  .remove:hover {
    background: var(--hover);
    color: var(--ink);
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }

  .dependencies li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--line);
  }

  .path,
  code {
    font-family: var(--code);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .to {
    flex-basis: 100%;
    color: var(--ink-soft);
  }

  .file {
    color: var(--ink);
    text-align: left;
  }

  .to .file {
    color: var(--ink-soft);
  }

  .file:hover,
  .line:hover {
    color: var(--focus);
    text-decoration: underline;
  }

  .file.open,
  .line.open {
    color: var(--focus);
    font-weight: 600;
  }

  .line {
    color: var(--focus);
    font-variant-numeric: tabular-nums;
  }

  .arrow {
    margin: 0 4px 0 0;
  }

  .trip {
    line-height: 1.8;
  }

  .trip .arrow {
    margin: 0 6px;
  }

  .tag {
    padding: 0 6px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    color: var(--ink-soft);
    font-size: 11px;
  }
</style>
