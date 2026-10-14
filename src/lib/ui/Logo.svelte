<script lang="ts">
  import { cutFor, markDrawing, WORDMARK } from "./brand"

  let {
    size = 24,
    wordmark = false,
    label,
    class: className,
  }: {
    /** The mark's size in CSS pixels. The drawing changes cut at 32 and 16 px. */
    size?: number
    /** Set the outlined wordmark beside the mark. */
    wordmark?: boolean
    /** An accessible name. Without one the logo is decorative and hidden. */
    label?: string
    class?: string
  } = $props()

  // Each instance needs its own mask id: a page can show the logo twice.
  const uid = $props.id()
  const mask = `logo-${uid}`
  const cut = $derived(cutFor(size))
  const drawing = $derived(markDrawing(cut))
  // The wordmark's cap height sits at about 45% of the mark, as in the header lockup.
  const wordHeight = $derived(Math.round(size * 0.56 * 10) / 10)
</script>

<!--
  Ink is the surrounding text colour, so a caller sets it with a text token; the
  playhead is the only gold. The playhead's gap is a mask, not a ring painted in
  a background colour, so the logo sits on any surface.
-->
<span
  class={["inline-flex shrink-0 items-center", className]}
  style:gap={wordmark ? `${Math.round(size * 0.4)}px` : undefined}
  role={label ? "img" : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : "true"}
  data-logo={cut}
>
  <svg width={size} height={size} viewBox="0 0 {drawing.grid} {drawing.grid}" class="block">
    <mask id={mask}>
      <rect width={drawing.grid} height={drawing.grid} fill="white" />
      {#each drawing.gaps as gap, index (index)}
        <circle cx={gap.cx} cy={gap.cy} r={gap.r} fill="black" />
      {/each}
    </mask>
    <g mask="url(#{mask})">
      {#each drawing.shapes.filter((shape) => shape.paint === "ink") as shape, index (index)}
        <svelte:element this={shape.tag} {...shape.attrs} stroke="currentColor" />
      {/each}
    </g>
    {#each drawing.shapes.filter((shape) => shape.paint === "accent") as shape, index (index)}
      <svelte:element this={shape.tag} {...shape.attrs} fill="var(--color-gold)" />
    {/each}
  </svg>
  {#if wordmark}
    <svg
      height={wordHeight}
      width={Math.round((wordHeight * WORDMARK.width) / WORDMARK.height)}
      viewBox={WORDMARK.viewBox}
      class="block"
    >
      <path d={WORDMARK.d} fill="currentColor" />
    </svg>
  {/if}
</span>
