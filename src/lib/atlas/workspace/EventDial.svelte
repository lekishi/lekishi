<script lang="ts">
  import { Icon, focusRing, focusRingOnGold, handled, transition } from "$lib/ui"

  /**
   * The event dial (RFD 5, bottom region): play and step through the window,
   * and hold the camera on the selection. The ring around the play button is
   * the playhead's progress through the window, so the reader sees how much of
   * the window is left without reading the strip.
   *
   * Stepping walks event boundaries and never changes the window (RFD 1); the
   * next event the playhead will reach is named beside the dial, so a press of
   * "step forward" is never a surprise. Following is off until the reader asks
   * for it, and any drag or wheel on the globe turns it off again: the button
   * states which, in words as well as in its pressed state.
   */
  let {
    playing,
    progress,
    nextLabel,
    following,
    canFollow,
    compact = false,
    onTogglePlay,
    onStep,
    onToggleFollow,
  }: {
    playing: boolean
    /** The playhead's position through the window, 0 to 1. */
    progress: number
    /** "Next: 鑒眞 lands at 秋妻屋浦 · 753", or null when nothing is ahead. */
    nextLabel: string | null
    following: boolean
    /** There is a placed selection to follow. */
    canFollow: boolean
    compact?: boolean
    onTogglePlay: () => void
    onStep: (direction: 1 | -1) => void
    onToggleFollow: () => void
  } = $props()

  // The ring's circumference at r = 21 in a 48-unit box.
  const CIRCUMFERENCE = 2 * Math.PI * 21
  const offset = $derived(CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress))))

  const stepClass = [
    "inline-flex size-9 cursor-pointer items-center justify-center rounded-full border border-frame bg-lacquer-glass text-ink-dim hover:bg-lacquer-raised hover:text-ink",
    transition,
    focusRing,
  ]
</script>

<div
  role="group"
  aria-label="Playback"
  data-testid="atlas-dial"
  class={[
    "pointer-events-auto flex min-w-0 items-center gap-2",
    handled,
    !compact &&
      "rounded-plate border border-frame bg-lacquer-glass px-2 py-1.5 shadow-plate backdrop-blur-md",
  ]}
>
  <button
    type="button"
    id="atlas-step-back"
    class={stepClass}
    aria-label="Step back to the previous event"
    title="Previous event"
    onclick={() => onStep(-1)}
  >
    <Icon name="step-back" size={16} />
  </button>

  <span class="relative inline-flex size-12 shrink-0 items-center justify-center">
    <svg viewBox="0 0 48 48" class="absolute inset-0 size-12 -rotate-90" aria-hidden="true">
      <circle cx="24" cy="24" r="21" fill="none" class="stroke-rule" stroke-width="2" />
      <circle
        cx="24"
        cy="24"
        r="21"
        fill="none"
        class="stroke-gold-bright transition-[stroke-dashoffset] duration-(--motion-base) ease-ui"
        stroke-width="2"
        stroke-linecap="round"
        stroke-dasharray={CIRCUMFERENCE}
        stroke-dashoffset={offset}
      />
    </svg>
    <button
      type="button"
      id="atlas-play-toggle"
      aria-pressed={playing}
      aria-label={playing ? "Pause" : "Play through the window"}
      title={playing ? "Pause" : "Play"}
      onclick={onTogglePlay}
      class={[
        "relative inline-flex size-10 cursor-pointer items-center justify-center rounded-full bg-gold text-on-gold hover:bg-gold-bright",
        transition,
        focusRingOnGold,
      ]}
    >
      <Icon name={playing ? "pause" : "play"} size={18} />
    </button>
  </span>

  <button
    type="button"
    id="atlas-step-forward"
    class={stepClass}
    aria-label="Step forward to the next event"
    title="Next event"
    onclick={() => onStep(1)}
  >
    <Icon name="step-forward" size={16} />
  </button>

  {#if !compact}
    <p class="hidden min-w-0 max-w-56 truncate px-1 text-caption text-ink-dim xl:block">
      {nextLabel ?? "The end of the window"}
    </p>
  {/if}

  <button
    type="button"
    id="atlas-follow-toggle"
    disabled={!canFollow}
    aria-pressed={following}
    title={canFollow
      ? following
        ? "Following the selection. Drag the globe to stop."
        : "Hold the camera on the selection"
      : "Select a placed event or place to follow it"}
    onclick={onToggleFollow}
    class={[
      "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-caption font-semibold disabled:cursor-not-allowed disabled:opacity-50",
      transition,
      focusRing,
      following
        ? "border-gold bg-gold-tint text-gold-bright"
        : "border-frame bg-lacquer-glass text-ink-dim hover:bg-lacquer-raised hover:text-ink",
    ]}
  >
    <Icon name="follow" size={14} />
    <span class={compact ? "sr-only" : ""}>{following ? "Following" : "Follow"}</span>
  </button>
</div>
