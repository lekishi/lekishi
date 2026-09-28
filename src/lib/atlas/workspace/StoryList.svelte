<script lang="ts">
  import type { StoryStep } from "../domain"

  /**
   * The chapter's story, in the chapter's own order.
   *
   * The published story is the chapter's presentation order, so the navigator
   * follows it rather than a chronology: a step that the atlas can open is a jump
   * (it selects the event and moves the window and playhead to its time), and a
   * step whose record has no event surface — a relationship, for example — is kept
   * in place as a summary step. The order is not a claim that one step caused the
   * next, and an uncertain occurrence keeps its span when it is opened.
   */
  let {
    steps,
    currentRecordId,
    onJump,
  }: {
    steps: readonly StoryStep[]
    /** The story step the selected event belongs to, or null. */
    currentRecordId: string | null
    onJump: (eventId: string) => void
  } = $props()
</script>

<div class="flex min-h-0 flex-1 flex-col gap-2">
  <ol
    class="flex min-h-0 flex-1 list-none flex-col gap-1 overflow-y-auto pr-1"
    data-testid="atlas-story"
  >
    {#each steps as step, index (step.recordId)}
      <li>
        {#if step.kind === "event"}
          <button
            type="button"
            data-testid="atlas-story-step"
            data-record-id={step.recordId}
            aria-current={step.recordId === currentRecordId ? "true" : undefined}
            onclick={() => onJump(step.recordId)}
            class={[
              "w-full rounded-lg border px-3 py-2 text-left transition",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300",
              step.recordId === currentRecordId
                ? "border-amber-300/80 bg-amber-300/10"
                : "border-slate-700/70 bg-slate-900/60 hover:border-slate-500 hover:bg-slate-800/70",
            ]}
          >
            <span class="flex flex-wrap items-baseline gap-x-2">
              <span class="text-[0.65rem] font-semibold tabular-nums text-slate-500">
                {index + 1}
              </span>
              <span class="text-sm text-slate-100">{step.caption}</span>
            </span>
          </button>
        {:else}
          <!--
            A summary step is the story's own caption for a published record the
            atlas has no event surface for. It stays in the sequence so the reader
            reads the chapter's order, and it is not a button: there is nothing to
            open.
          -->
          <div
            data-testid="atlas-story-summary-step"
            data-record-id={step.recordId}
            class="w-full rounded-lg border border-dashed border-slate-700/70 px-3 py-2"
          >
            <span class="flex flex-wrap items-baseline gap-x-2">
              <span class="text-[0.65rem] font-semibold tabular-nums text-slate-500">
                {index + 1}
              </span>
              <span class="text-sm text-slate-400">{step.caption}</span>
              <span
                class="rounded-full border border-slate-600 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400"
              >
                summary step
              </span>
            </span>
          </div>
        {/if}
      </li>
    {/each}
  </ol>
</div>
