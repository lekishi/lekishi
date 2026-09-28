<script lang="ts">
  import { localSceneFor, localSceneNotice, type SceneShape } from "../scene-illustration"
  import type { HistoricalEvent, Place } from "../domain"

  /**
   * The illustrated-local treatment's surface.
   *
   * It draws one restrained vignette for the selected event, beside the event's
   * details: the kind comes from the record's published event types, and every
   * card states in words that the drawing is a generic vignette for that kind
   * rather than a reconstruction of the place. The card is part of the
   * treatment comparison (RFD 1's illustrated local-detail option), so it is
   * mounted only where the comparison asks for it and never on a reader surface.
   *
   * The SVG is decorative: it carries no text, no coordinate, and no shape
   * derived from one, so a screen reader reads the card's words instead of the
   * drawing.
   */
  let {
    event,
    places,
  }: {
    event: HistoricalEvent
    places: readonly Place[]
  } = $props()

  const scene = $derived(localSceneFor(event, places))

  const TONE_FILL: Readonly<Record<SceneShape["tone"], string>> = {
    far: "#173040",
    near: "#24505f",
    accent: "#f59e0b",
  }

  /** The silhouette for one shape, in the scene model's 100 x 40 view box. */
  function shapePath(shape: SceneShape): string {
    const { x, y, width: w, height: h } = shape

    switch (shape.shape) {
      case "band":
        // A land or water silhouette: a straight base with a gently arched top.
        return `M ${x} ${y + h} L ${x} ${y} Q ${x + w / 2} ${y + h * 0.18} ${x + w} ${y} L ${x + w} ${y + h} Z`
      case "roof":
        return `M ${x} ${y} L ${x} ${y - h * 0.5} L ${x + w / 2} ${y - h} L ${x + w} ${y - h * 0.5} L ${x + w} ${y} Z`
      case "hall":
        return `M ${x} ${y} L ${x} ${y - h * 0.6} L ${x + w / 2} ${y - h} L ${x + w} ${y - h * 0.6} L ${x + w} ${y} Z`
      case "gate":
        return [
          `M ${x} ${y} L ${x} ${y - h} L ${x + w * 0.2} ${y - h} L ${x + w * 0.2} ${y} Z`,
          `M ${x + w * 0.8} ${y} L ${x + w * 0.8} ${y - h} L ${x + w} ${y - h} L ${x + w} ${y} Z`,
          `M ${x - w * 0.08} ${y - h} L ${x + w * 1.08} ${y - h} L ${x + w * 1.08} ${y - h * 0.76} L ${x - w * 0.08} ${y - h * 0.76} Z`,
        ].join(" ")
      case "tree":
        return [
          `M ${x + w / 2} ${y - h} L ${x} ${y - h * 0.32} L ${x + w} ${y - h * 0.32} Z`,
          `M ${x + w * 0.42} ${y} L ${x + w * 0.42} ${y - h * 0.34} L ${x + w * 0.58} ${y - h * 0.34} L ${x + w * 0.58} ${y} Z`,
        ].join(" ")
      case "banner":
        return [
          `M ${x + w * 0.44} ${y} L ${x + w * 0.44} ${y - h} L ${x + w * 0.56} ${y - h} L ${x + w * 0.56} ${y} Z`,
          `M ${x + w * 0.56} ${y - h} L ${x + w} ${y - h * 0.68} L ${x + w * 0.56} ${y - h * 0.36} Z`,
        ].join(" ")
      case "marker":
        return `M ${x + w / 2} ${y - h} L ${x + w} ${y - h * 0.5} L ${x + w / 2} ${y} L ${x} ${y - h * 0.5} Z`
    }
  }
</script>

{#if scene}
  <!--
    The treatment's own surface: the place the record names, the restrained
    vignette for the event's published kind, and the two statements that keep the
    drawing from reading as evidence.
  -->
  <section
    id="atlas-local-scene"
    data-testid="atlas-local-scene"
    aria-label="Illustrative local scene"
    class="pointer-events-auto shrink-0 rounded-2xl border border-amber-300/40 bg-slate-950/95 px-3 py-2.5"
  >
    <p class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-300">
      Local scene · illustrative
    </p>
    <p class="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-slate-100">
      <span>{scene.placeLabel}</span>
      <!--
        The record's own event types, verbatim: the card classifies nothing
        itself. A narrowing of the atlas's own (a `journey` called a voyage)
        would be a historical claim the record does not publish.
      -->
      <span class="text-[0.65rem] font-medium tracking-[0.14em] text-slate-500">
        {scene.eventTypes.join(" · ")}
      </span>
    </p>

    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      class="mt-1.5 h-10 w-full rounded-lg bg-slate-900/80 sm:h-16 lg:h-20"
      data-testid="atlas-local-scene-drawing"
    >
      {#each scene.shapes as shape, index (index)}
        <path d={shapePath(shape)} fill={TONE_FILL[shape.tone]} />
      {/each}
    </svg>

    <p
      class="mt-1.5 text-[0.65rem] leading-snug text-slate-400"
      data-testid="atlas-local-scene-notice"
    >
      {localSceneNotice(scene)}
    </p>

    {#if scene.positionNote}
      <!-- The record's own words: the illustration never supplies a location. -->
      <p class="mt-1 text-[0.65rem] leading-snug text-slate-500">
        {scene.positionNote}
      </p>
    {/if}
  </section>
{/if}
