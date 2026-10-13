/**
 * Class lists the primitives share. They live here, not in CSS, because
 * `@apply` is not used: reuse comes from components and from these strings.
 *
 * One focus ring for every interactive element (RFD 5, "Focus"): 2 px
 * `gold-bright` with a 2 px offset, shown on `:focus-visible` only. On a gold
 * fill the ring switches to `ink` so it stays visible against the fill.
 */
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"

export const focusRingOnGold =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"

/** The interface's one transition: colour and opacity over the fast duration. */
export const transition =
  "transition-[color,background-color,border-color,opacity] duration-(--motion-fast) ease-ui"
