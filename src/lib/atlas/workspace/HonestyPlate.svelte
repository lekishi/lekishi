<script lang="ts">
  /**
   * What the view in front of the reader is made of (RFD 1, "Honest
   * rendering"): the land is hex tiles classed from today's imagery and
   * elevation, every line is schematic, an
   * anchor names an area without asserting a site, a tinted place is one a
   * source records held, with no border between, and the campaign board's
   * hexes, towns and units mark where the story is, not who ruled or lived
   * there. The plate states only what is on screen.
   */
  let {
    lines,
    anchors,
    control = false,
  }: {
    /** A journey or an arc is drawn. */
    lines: boolean
    /** A display anchor is drawn. */
    anchors: boolean
    /** A territory snapshot tints held places. */
    control?: boolean
  } = $props()
</script>

<ul data-testid="atlas-honesty" class="flex flex-col gap-0.5 text-caption text-ink-dim">
  <li>
    The land is drawn as hex tiles classed from today's imagery and elevation, not the land of the
    period.
  </li>
  <li>
    Lit hexes, towns and units mark where the story is; they are not territories, and a town's size
    claims nothing.
  </li>
  {#if lines}
    <li>Lines are schematic: they join dated stops, not a surveyed route.</li>
  {/if}
  {#if anchors}
    <li>A diamond names an area; it asserts no site.</li>
  {/if}
  {#if control}
    <li>
      A banner in a holder's colour, not the story's gold, is a place a source records held in that
      year; no border is drawn, and other places may have been held too.
    </li>
  {/if}
</ul>
