<script lang="ts">
  import { isRuleId, METRICS, RULE_KIND_NAMES } from '@adr-tool/conformance'
  import { metricWording, missingOf, numberOf, type RuleForm } from '../lib/conformance'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import { codeSpans } from '../lib/wording'
  import ChipInput from './ChipInput.svelte'

  // A Rule as it is written in the window: a new one, or one of the file changed. Every kind
  // has its keys; the preview shows what is written, which touches the Rule's own lines and
  // nothing else (ADR-0002), and `conformance` refuses with a sentence what it cannot write so.
  let { form }: { form: RuleForm } = $props()

  const words = $derived(t.conformance.form)
  const suggestions = $derived((app.active?.repository.components ?? []).map(({ id }) => id))
  const missing = $derived(missingOf(form))
  const idInvalid = $derived(form.id.trim() !== '' && !isRuleId(form.id.trim()))
  const maxInvalid = $derived(Number.isNaN(numberOf(form.max)))
  const minInvalid = $derived(Number.isNaN(numberOf(form.min)))
  const dependency = $derived(form.kind === 'must-not-depend' || form.kind === 'may-only-depend')

  /** What a key the form lacks is called on the form. */
  const LABELS: Record<string, () => string> = {
    id: () => words.id,
    why: () => words.why,
    from: () => words.from,
    to: () => words.to,
    layers: () => words.layers,
    among: () => words.components,
    inside: () => words.components,
    max: () => `${words.max} / ${words.min}`,
    min: () => words.min,
    of: () => words.of,
    library: () => words.libraries,
    'only-in': () => words.components,
    'not-in': () => words.components
  }
  // The Libraries the code uses, to choose from.
  const libraries = $derived(
    [...new Set((app.active?.outline.known?.libraries ?? []).flatMap((one) => one.imports))].sort()
  )

  function onsubmit(event: SubmitEvent): void {
    event.preventDefault()
    if (missing.length === 0 && !idInvalid) void app.planRuleOfForm()
  }
</script>

{#snippet withCode(text: string)}
  {#each codeSpans(text) as part, position (position)}{#if part.code}<code>{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

<form
  class="rule"
  aria-label={form.original === undefined ? words.newTitle : words.changeTitle}
  {onsubmit}
>
  <p class="kind">{t.conformance.detail.rule}</p>
  <h2>{form.original === undefined ? words.newTitle : words.changeTitle}</h2>
  {#if form.original !== undefined}<p><code>{form.original}</code></p>{/if}

  <label class="field">
    <span class="name">{words.id}</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="code"
      bind:value={form.id}
      aria-invalid={idInvalid}
      spellcheck="false"
      autocomplete="off"
      autofocus={form.original === undefined}
    />
    <span class="note" class:problem={idInvalid}>{words.idHint}</span>
  </label>

  <label class="field">
    <span class="name">{words.why}</span>
    <textarea bind:value={form.why} rows="3" placeholder={words.whyPlaceholder}></textarea>
  </label>

  <label class="field">
    <span class="name">{words.kind}</span>
    <select bind:value={form.kind}>
      {#each RULE_KIND_NAMES as kind (kind)}
        <option value={kind}>{t.conformance.kinds[kind].name}</option>
      {/each}
    </select>
    <span class="note">{@render withCode(t.conformance.kinds[form.kind].about)}</span>
  </label>

  {#if dependency}
    <div class="field">
      <span class="name">{words.from}</span>
      <ChipInput
        bind:items={form.from}
        {suggestions}
        label={words.from}
        placeholder={words.patternPlaceholder}
      />
      <span class="note">{words.fromAbout}</span>
    </div>
    <div class="field">
      <span class="name">{form.kind === 'may-only-depend' ? words.allowed : words.to}</span>
      <ChipInput
        bind:items={form.to}
        {suggestions}
        label={form.kind === 'may-only-depend' ? words.allowed : words.to}
        placeholder={words.patternPlaceholder}
      />
      <span class="note"
        >{form.kind === 'may-only-depend' ? words.allowedAbout : words.toAbout}</span
      >
    </div>
  {:else if form.kind === 'layers'}
    <fieldset class="field">
      <legend class="name">{words.layers}</legend>
      <!-- Each layer is the form's own list, which the chips change in place. -->
      {#each form.layers as layer, position (position)}
        <div class="layer">
          <span class="note">{words.layer(position + 1)}</span>
          <div class="chips">
            <ChipInput
              items={layer}
              {suggestions}
              label={words.layer(position + 1)}
              placeholder={words.patternPlaceholder}
            />
          </div>
          {#if form.layers.length > 2}
            <button
              type="button"
              class="remove"
              aria-label={words.removeLayer(position + 1)}
              title={words.removeLayer(position + 1)}
              onclick={() => form.layers.splice(position, 1)}>×</button
            >
          {/if}
        </div>
      {/each}
      <button type="button" class="action" onclick={() => form.layers.push([])}
        >{words.addLayer}</button
      >
    </fieldset>
    <label class="check">
      <input type="checkbox" bind:checked={form.strict} />
      {words.strict}
    </label>
  {:else if form.kind === 'no-cycles'}
    <fieldset class="field">
      <legend class="name">{words.scope}</legend>
      <label class="check">
        <input type="radio" value="among" bind:group={form.scope} />
        {words.among}
      </label>
      <label class="check">
        <input type="radio" value="inside" bind:group={form.scope} />
        {words.inside}
      </label>
    </fieldset>
    <div class="field">
      <span class="name">{words.components}</span>
      <ChipInput
        bind:items={form.components}
        {suggestions}
        label={words.components}
        placeholder={words.patternPlaceholder}
      />
    </div>
  {:else if form.kind === 'library'}
    <div class="field">
      <span class="name">{words.libraries}</span>
      <ChipInput
        bind:items={form.libraries}
        suggestions={libraries}
        label={words.libraries}
        placeholder={words.libraryPlaceholder}
      />
      <span class="note">{@render withCode(words.librariesAbout)}</span>
    </div>
    <fieldset class="field">
      <legend class="name">{words.libraryScope}</legend>
      <label class="check">
        <input type="radio" value="only-in" bind:group={form.libraryScope} />
        {words.onlyIn}
      </label>
      <label class="check">
        <input type="radio" value="not-in" bind:group={form.libraryScope} />
        {words.notIn}
      </label>
    </fieldset>
    <div class="field">
      <span class="name">{words.components}</span>
      <ChipInput
        bind:items={form.components}
        {suggestions}
        label={words.components}
        placeholder={words.patternPlaceholder}
      />
    </div>
  {:else}
    <label class="field">
      <span class="name">{words.metric}</span>
      <select bind:value={form.metric}>
        {#each METRICS as metric (metric)}
          <option value={metric}>{metricWording(metric).long}</option>
        {/each}
      </select>
      <span class="note">{metricWording(form.metric).definition}</span>
    </label>
    <div class="limits">
      <label class="field">
        <span class="name">{words.max}</span>
        <input bind:value={form.max} inputmode="decimal" aria-invalid={maxInvalid} />
        {#if maxInvalid}<span class="note problem">{words.notANumber}</span>{/if}
      </label>
      <label class="field">
        <span class="name">{words.min}</span>
        <input bind:value={form.min} inputmode="decimal" aria-invalid={minInvalid} />
        {#if minInvalid}<span class="note problem">{words.notANumber}</span>{/if}
      </label>
    </div>
    <div class="field">
      <span class="name">{words.of}</span>
      <ChipInput
        bind:items={form.of}
        {suggestions}
        label={words.of}
        placeholder={words.patternPlaceholder}
      />
    </div>
  {/if}
  <p class="note">{@render withCode(words.patterns)}</p>

  <h3>{t.conformance.detail.options}</h3>
  <label class="check">
    <input type="checkbox" bind:checked={form.tests} />
    {words.tests}
  </label>
  {#if form.kind !== 'threshold'}
    <label class="check">
      <input type="checkbox" bind:checked={form.ignoreTypeOnly} />
      {words.ignoreTypeOnly}
    </label>
  {/if}

  {#if missing.length > 0}
    <p class="note missing">
      {words.missing([...new Set(missing.map((key) => LABELS[key]?.() ?? key))])}
    </p>
  {/if}
  <div class="buttons">
    <button type="button" class="action" onclick={() => app.cancelRule()}>{t.cancel}</button>
    <button type="submit" class="action primary" disabled={missing.length > 0 || idInvalid}
      >{words.preview}</button
    >
  </div>
</form>

<style>
  .rule {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .kind {
    color: var(--ink-faint);
    font-size: 11.5px;
    font-weight: 600;
  }

  h2 {
    margin-bottom: 4px;
    font-size: 15px;
    font-weight: 600;
  }

  h3 {
    margin: 14px 0 2px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 8px 0 0;
    padding: 0;
    border: 0;
  }

  .name {
    padding: 0;
    color: var(--ink-soft);
    font-size: 12px;
    font-weight: 600;
  }

  input:not([type]),
  input[inputmode],
  textarea,
  select {
    padding: 4px 6px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  textarea {
    resize: vertical;
    line-height: 1.45;
  }

  input.code,
  code {
    font-family: var(--code);
    font-size: 12px;
  }

  [aria-invalid='true'] {
    border-color: var(--problem);
  }

  .note {
    color: var(--ink-faint);
    font-size: 12px;
    line-height: 1.45;
  }

  .note.problem,
  .missing {
    color: var(--problem);
  }

  .missing {
    margin-top: 10px;
  }

  .layer {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }

  .remove {
    width: 22px;
    height: 22px;
    border-radius: 3px;
    color: var(--ink-faint);
  }

  .remove:hover {
    background: var(--hover);
    color: var(--ink);
  }

  .limits {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
  }

  .action {
    align-self: flex-start;
    margin-top: 8px;
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

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 6px;
  }
</style>
