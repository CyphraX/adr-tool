<script lang="ts">
  import { onFile } from '../lib/review'
  import { reviewing } from '../lib/reviewing.svelte'
  import { app } from '../lib/state.svelte'
  import { t } from '../lib/strings'
  import AnnotationList from './AnnotationList.svelte'
  import CodeViewer from './CodeViewer.svelte'
  import RepositoryProblems from './RepositoryProblems.svelte'
  import ReviewPicker from './ReviewPicker.svelte'

  // The middle of Review (docs/plan-vision.md, part 9): the Annotations the sidebar leaves; a
  // Source File in the code viewer, with its Annotations beside their lines, to annotate lines
  // or attach an Annotation to them again; the Source Files to pick one from; or the Problems
  // of the repository.
  const review = $derived(app.active?.review)
  const annotations = $derived(review?.known?.annotations ?? [])
  const attaching = $derived(review?.attaching)
</script>

{#if review?.problems}
  <RepositoryProblems />
{:else if review?.code}
  {@const code = review.code}
  <CodeViewer
    {code}
    back={{ label: t.annotations.backToList, go: () => reviewing.closeCode() }}
    annotations={onFile(annotations, code.path)}
    selected={review.selectedId}
    onannotation={(id) => reviewing.select(id)}
    attaching={attaching === undefined
      ? undefined
      : {
          id: attaching,
          attach: (lines) => void reviewing.attach(attaching, { path: code.path, ...lines }),
          cancel: () => reviewing.cancelAttaching()
        }}
  />
{:else if review?.picking}
  <ReviewPicker />
{:else}
  <AnnotationList />
{/if}
