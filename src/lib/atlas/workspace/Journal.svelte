<script lang="ts">
  import { Icon, focusRing, transition } from "$lib/ui"
  import type { StoryStep } from "../domain"

  /**
   * The journal: the chapter's story in its own order (RFD 1's journal). Every
   * step is a jump, including the steps that narrate a relationship rather than
   * an event; those select nothing and move time to the relationship's date.
   * Story order is presentation order, not a claim about sequence or cause, so
   * the steps are numbered as the story numbers them and nothing is re-sorted.
   *
   * The current step is marked with gold and `aria-current`, and is kept in
   * view as the story moves.
   */
  let {
    steps,
    current,
    onJump,
  }: {
    steps: readonly StoryStep[]
    /** The index of the step the reader is at, or null. */
    current: number | null
    onJump: (index: number) => void
  } = $props()

  let list: HTMLOListElement | undefined = $state()

  $effect(() => {
    const index = current
    if (index === null || list === undefined) return
    const item = list.querySelector<HTMLElement>(`[data-step="${index}"]`)
    // `scrollIntoView` is missing in the component tests' DOM.
    item?.scrollIntoView?.({ block: "nearest" })
  })
</script>

<ol bind:this={list} class="flex list-none flex-col gap-0.5" data-testid="atlas-journal">
  {#each steps as step, index (step.recordId + index)}
    <li data-step={index}>
      <button
        type="button"
        data-testid="atlas-story-step"
        data-record-id={step.recordId}
        aria-current={current === index ? "step" : undefined}
        onclick={() => onJump(index)}
        class={[
          "flex w-full cursor-pointer items-baseline gap-2.5 rounded-plate px-2 py-1.5 text-left",
          transition,
          focusRing,
          current === index
            ? "bg-gold-tint text-ink"
            : "text-ink-dim hover:bg-lacquer-raised hover:text-ink",
        ]}
      >
        <span
          class={[
            "w-6 shrink-0 text-right text-caption tabular-nums",
            current === index ? "font-semibold text-gold-bright" : "text-ink-dim",
          ]}>{index + 1}</span
        >
        <span
          class={[
            "min-w-0 flex-1 font-serif text-body-sm",
            step.kind === "summary" && "italic",
            current === index && "font-semibold",
          ]}
        >
          {step.caption}
        </span>
        {#if step.kind === "summary"}
          <Icon
            name="transmission"
            size={12}
            class="shrink-0 self-center text-ink-dim"
            label="Relationship"
          />
        {/if}
      </button>
    </li>
  {/each}
</ol>
