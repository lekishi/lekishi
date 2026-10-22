<script lang="ts" module>
  import type { IconName } from "./Icon.svelte"

  /**
   * Every badge kind with its glyph and default word. The evidence kinds are
   * RFD 1's visual forms; the rest are states that modify a record (at the
   * playhead, possible, disputed, tradition, outside the window, coda). Each pairs a glyph
   * with a word, so no kind is told apart by its hue alone.
   */
  export const BADGES = {
    attested: { icon: "attested", text: "attested" },
    identified: { icon: "identified", text: "identified" },
    schematic: { icon: "schematic", text: "schematic" },
    overland: { icon: "overland", text: "overland" },
    reconstructed: { icon: "reconstructed", text: "reconstructed" },
    anchor: { icon: "anchor", text: "label anchor" },
    unlocated: { icon: "outside", text: "location not identified" },
    active: { icon: "playhead", text: "at the playhead" },
    possible: { icon: "possible", text: "possible" },
    disputed: { icon: "disputed", text: "disputed account" },
    tradition: { icon: "tradition", text: "tradition" },
    outside: { icon: "outside", text: "outside the window" },
    coda: { icon: "coda", text: "coda" },
  } as const satisfies Record<string, { icon: IconName; text: string }>

  export type BadgeKind = keyof typeof BADGES
</script>

<script lang="ts">
  import Icon from "./Icon.svelte"

  /**
   * One badge per evidence and state token (RFD 5, `Badge`). It replaces the
   * hand-written pills in the event rows and draws the same glyph the globe's
   * marker uses, so a badge in the card looks like the mark on the map.
   */
  let {
    kind,
    text,
    class: className,
  }: {
    kind: BadgeKind
    /** Overrides the default word when a surface needs a fuller one. */
    text?: string
    class?: string
  } = $props()
</script>

<span
  data-badge={kind}
  class={[
    "inline-flex shrink-0 items-center gap-1 rounded-control border px-1.5 py-px text-caption font-semibold whitespace-nowrap",
    kind === "attested" && "border-current text-evidence-attested",
    kind === "identified" && "border-current text-evidence-identified",
    kind === "schematic" && "border-dashed border-current text-evidence-schematic",
    kind === "overland" && "border-dotted border-current text-evidence-overland",
    kind === "reconstructed" && "border-dashed border-current text-evidence-reconstructed",
    kind === "anchor" && "border-dashed border-ink-dim text-ink-dim",
    kind === "unlocated" && "border-dashed border-rule text-ink-dim",
    kind === "active" && "border-gold bg-gold-tint text-gold-bright",
    kind === "possible" && "border-dashed border-ink-faint text-ink-dim",
    kind === "disputed" && "border-ink-dim text-ink",
    kind === "tradition" && "border-dotted border-ink-dim text-ink",
    (kind === "outside" || kind === "coda") && "border-rule text-ink-faint",
    className,
  ]}
>
  <Icon name={BADGES[kind].icon} size={12} />
  <span>{text ?? BADGES[kind].text}</span>
</span>
