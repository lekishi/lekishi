<script lang="ts">
  /**
   * What the view in front of the reader is made of (RFD 1, "Honest
   * rendering"): the terrain is real elevation, every line is schematic, an
   * anchor names an area without asserting a site, and the close-up diorama is
   * an illustration. The plate states only what is on screen, so a reader who
   * zooms into the diorama is told it is a drawing at the moment it appears.
   */
  let {
    lines,
    anchors,
    diorama,
  }: {
    /** A journey or an arc is drawn. */
    lines: boolean
    /** A display anchor is drawn. */
    anchors: boolean
    /** The diorama in view, by its place's name, or null. */
    diorama: string | null
  } = $props()
</script>

<ul data-testid="atlas-honesty" class="flex flex-col gap-0.5 text-caption text-ink-dim">
  <li>Terrain is real elevation, exaggerated for legibility.</li>
  {#if lines}
    <li>Lines are schematic: they join dated stops, not a surveyed route.</li>
  {/if}
  {#if anchors}
    <li>A diamond names an area; it asserts no site.</li>
  {/if}
  {#if diorama}
    <li class="text-gold-bright">
      The close-up at <span lang="ja" class="font-serif">{diorama}</span> is an illustrated diorama, not
      a survey.
    </li>
  {/if}
</ul>
