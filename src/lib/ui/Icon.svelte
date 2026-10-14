<script lang="ts" module>
  /**
   * The one inline SVG set (RFD 5, `Icon`): utility glyphs and the bespoke layer
   * and evidence glyphs. No icon font and no external sprite, so the set works
   * in the prerendered HTML before any script runs.
   */
  export const ICONS = {
    play: "M8 5l11 7-11 7z",
    pause: "M7 5h4v14H7zM13 5h4v14h-4z",
    "step-back": "M18 6l-8 6 8 6zM6 6v12",
    "step-forward": "M6 6l8 6-8 6zM18 6v12",
    close: "M6 6l12 12M18 6L6 18",
    search: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM16 16l4 4",
    "chevron-left": "M15 6l-6 6 6 6",
    "chevron-right": "M9 6l6 6-6 6",
    "chevron-up": "M6 15l6-6 6 6",
    "chevron-down": "M6 9l6 6 6-6",
    list: "M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01",
    link: "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1",
    journeys: "M4 15h16l-2.5 4.5h-11zM12 4v10M12 5l6 7h-6M12 6l-5 6h5",
    transmission: "M4 18C6 9 18 9 20 18M17 15l3 3 1-4",
    diplomacy:
      "M7 9a3 3 0 1 0 0-.01M17 9a3 3 0 1 0 0-.01M3 19c0-3 2-5 4-5s4 2 4 5M13 19c0-3 2-5 4-5s4 2 4 5",
    territory: "M5 6l7-3 7 3v7c0 4-3 6-7 8-4-2-7-4-7-8z",
    sources: "M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z",
    attested: "M12 5a7 7 0 1 1 0 14 7 7 0 0 1 0-14z",
    identified: "M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z",
    possible: "M12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12z",
    disputed: "M12 5a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM12 5v14",
    outside: "M4 12h4M16 12h4M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
    schematic: "M3 12h4M10 12h4M17 12h4",
    overland: "M4 12h.01M9 12h.01M14 12h.01M19 12h.01",
    reconstructed: "M2 12h7M12 12h.01M15 12h7",
    playhead: "M12 9v11M8 4h8l-4 5z",
    coda: "M4 12h11M15 7l5 5-5 5",
    anchor: "M12 6l6 6-6 6-6-6z",
    conflict: "M5 5l14 14M19 5L5 19M5 9V5h4M19 9V5h-4",
    trade: "M12 8a4 2 0 1 0 0 .01M8 8v8c0 1 2 2 4 2s4-1 4-2V8M8 12c0 1 2 2 4 2s4-1 4-2",
    institution: "M4 20h16M5 10h14M12 4l8 6H4zM7 10v8M12 10v8M17 10v8",
    ship: "M3 15h18l-3 4H6zM12 4v10M12 5l6 8h-6M12 7l-4 6h4",
    party:
      "M9 5a2 2 0 1 0 0 .01M8 21l1-6-2-3 1-4h2l3 3 2 1M9 15l3 6M15 5a2 2 0 1 0 0 .01M15 8l2 4-1 4 1 5",
    home: "M4 11l8-7 8 7M6 10v10h12V10",
    about: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 11v6M12 7.5h.01",
    globe: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
    follow: "M12 4v3M12 17v3M4 12h3M17 12h3M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
    "arrow-right": "M5 12h14M13 6l6 6-6 6",
    calendar: "M4 7h16v13H4zM4 11h16M8 4v4M16 4v4",
  } as const

  export type IconName = keyof typeof ICONS
</script>

<script lang="ts">
  let {
    name,
    size = 16,
    label,
    class: className,
  }: {
    name: IconName
    size?: number
    /** An accessible name. Without one the glyph is decorative and hidden. */
    label?: string
    class?: string
  } = $props()
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class={["inline-block shrink-0", className]}
  role={label ? "img" : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : "true"}
  data-icon={name}
>
  <path d={ICONS[name]} />
</svg>
