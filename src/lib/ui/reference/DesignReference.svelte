<script lang="ts">
  import stylesheet from "../../../app.css?raw"
  import {
    Badge,
    BADGES,
    Button,
    CitationLine,
    DateLine,
    EmptyState,
    Field,
    Icon,
    ICONS,
    NameForm,
    Orb,
    Plate,
    SectionLabel,
    Sheet,
    Tabs,
    type BadgeKind,
    type Detent,
    type IconName,
  } from "$lib/ui"
  import { composite, contrast, contrastGrade, parseTokens } from "./tokens"

  /**
   * The living reference for RFD 5's design system, served at `/dev/design` in
   * development and on pull-request previews only. It renders what
   * `src/app.css` and `$lib/ui` define, so it is the specification rather than
   * a description of one: the tokens are parsed from the stylesheet, and every
   * primitive is the real component in its states.
   *
   * The sample content is real chapter content (the Tang mission's landfall at
   * 秋妻屋浦, 鑒眞, the 東征傳), so the type and the primitives are judged on
   * the names and dates they will carry, not on placeholder Latin.
   */
  const tokens = parseTokens(stylesheet)
  const color = (name: string) => tokens.colors.find((token) => token.name === name)?.value ?? ""
  const lacquer = color("lacquer")

  const SURFACES = new Set(["abyss", "lacquer", "lacquer-glass", "lacquer-raised", "frame", "rule"])

  type Group = {
    readonly title: string
    readonly note: string
    readonly match: (name: string) => boolean
  }
  const GROUPS: readonly Group[] = [
    {
      title: "Surfaces and lines",
      note: "Ink's contrast on each surface.",
      match: (name) => SURFACES.has(name),
    },
    {
      title: "Text",
      note: "Contrast on lacquer.",
      match: (name) => name.startsWith("ink"),
    },
    {
      title: "The current thing",
      note: "Selection, playhead, primary action, focus. Never decoration.",
      match: (name) => name.startsWith("gold") || name === "on-gold",
    },
    {
      title: "Errors",
      note: "The renderer failed. Never a historical state.",
      match: (name) => name === "danger",
    },
  ]

  /** The figure under a swatch: what this colour's legibility depends on. */
  // A translucent surface is measured as it lands on lacquer; the gold tint
  // carries gold-bright text (a selected row), not ink.
  function legibility(name: string, value: string): string {
    const flat = composite(value, lacquer) ?? lacquer
    const [ratio, against] = SURFACES.has(name)
      ? [contrast(color("ink"), flat), "ink on it"]
      : name === "gold-tint"
        ? [contrast(color("gold-bright"), flat), "gold-bright on it"]
        : name === "on-gold"
          ? [contrast(value, color("gold")), "on gold"]
          : [contrast(value, lacquer), "on lacquer"]
    if (ratio === null) return "—"
    return `${ratio.toFixed(1)}:1 ${against} · ${contrastGrade(ratio)}`
  }

  /**
   * RFD 1's evidence grammar: each form's colour token with the cue that is
   * not colour. The marks drawn here are the same patterns the globe's
   * overlays take.
   */
  const EVIDENCE: readonly {
    token: string
    badge: BadgeKind
    cue: string
    meaning: string
    mark: "ring" | "halo" | "line"
    dash?: string
  }[] = [
    {
      token: "evidence-attested",
      badge: "attested",
      cue: "Solid ring marker",
      meaning: "Attested site",
      mark: "ring",
    },
    {
      token: "evidence-identified",
      badge: "identified",
      cue: "Soft halo; its size is the precision",
      meaning: "Identified locality",
      mark: "halo",
    },
    {
      token: "evidence-schematic",
      badge: "schematic",
      cue: "Long dash 8 6",
      meaning: "Journey through dated stops",
      mark: "line",
      dash: "8 6",
    },
    {
      token: "evidence-overland",
      badge: "overland",
      cue: "Dot 2 4",
      meaning: "Overland leg through dated stops",
      mark: "line",
      dash: "2 4",
    },
    {
      token: "evidence-reconstructed",
      badge: "reconstructed",
      cue: "Dash-dot 10 4 2 4, citation beside it",
      meaning: "Route from scholarship",
      mark: "line",
      dash: "10 4 2 4",
    },
  ]

  const RELATIONSHIPS: readonly {
    token: string
    icon: IconName | null
    cue: string
    meaning: string
    style: "solid" | "double" | "chevrons" | "beads" | "dashed"
  }[] = [
    {
      token: "rel-transmission",
      icon: "transmission",
      cue: "Arc, solid",
      meaning: "Learning, religion, texts",
      style: "solid",
    },
    {
      token: "rel-diplomacy",
      icon: "diplomacy",
      cue: "Arc, double line",
      meaning: "Embassy, alliance, agreement",
      style: "double",
    },
    {
      token: "rel-conflict",
      icon: null,
      cue: "Arc, chevrons",
      meaning: "Campaign, battle",
      style: "chevrons",
    },
    {
      token: "rel-trade",
      icon: null,
      cue: "Arc, beaded",
      meaning: "Exchange, network",
      style: "beads",
    },
    {
      token: "rel-institution",
      icon: null,
      cue: "Arc, dashed",
      meaning: "Institutional change",
      style: "dashed",
    },
  ]

  const STATES: readonly { kind: BadgeKind; meaning: string }[] = [
    { kind: "active", meaning: "The record spans the playhead." },
    { kind: "possible", meaning: "Uncertain at the playhead: a hollow marker at 55 % opacity." },
    { kind: "disputed", meaning: "The sources disagree: a split marker and the word." },
    { kind: "outside", meaning: "Excluded by the window, said in words, dimmed." },
    { kind: "coda", meaning: "Presented after the chapter's main story." },
  ]

  /** The type scale's specimen lines, in the roles RFD 5 gives each step. */
  const SPECIMEN: Record<string, { text: string; lang?: string; font: string; role: string }> = {
    label: {
      text: "Sources",
      font: "font-sans font-semibold uppercase",
      role: "Section labels, Latin only",
    },
    caption: {
      text: "Akimeya no ura · Hepburn, editorial",
      font: "font-sans",
      role: "Metadata, romanization",
    },
    "body-sm": {
      text: "The passage names 薩摩國阿多郡秋妻屋浦 as the landing place.",
      font: "font-sans",
      role: "Rows, card details; the CJK minimum",
    },
    body: {
      text: "鑒眞, the Yangzhou precept master whom the envoys invited at 延光寺 in 天寶十二載 (753), sailed with the returning embassy.",
      font: "font-serif",
      role: "Narrative and descriptions",
    },
    "title-sm": {
      text: "The second ship's landfall at 秋妻屋浦",
      font: "font-serif font-semibold",
      role: "Event titles in rows and the card header",
    },
    title: {
      text: "秋妻屋浦",
      lang: "ja",
      font: "font-serif font-semibold",
      role: "Card title, place title",
    },
    display: {
      text: "Tang mission 750–754",
      font: "font-display font-semibold",
      role: "Chapter title",
    },
  }

  // Tailwind finds classes by scanning the source, so a class assembled from a
  // token name would never be generated; each step names its class in full.
  const TEXT_CLASS: Record<string, string> = {
    label: "text-label",
    caption: "text-caption",
    "body-sm": "text-body-sm",
    body: "text-body",
    "title-sm": "text-title-sm",
    title: "text-title",
    display: "text-display",
  }
  const FONT_CLASS: Record<string, string> = {
    display: "font-display",
    serif: "font-serif",
    sans: "font-sans",
  }

  const SECTIONS = [
    ["colour", "Colour"],
    ["evidence", "Evidence"],
    ["type", "Typography"],
    ["shape", "Shape and depth"],
    ["motion", "Motion and focus"],
    ["components", "Components"],
    ["icons", "Icons"],
  ] as const

  // Interactive demos: each primitive is driven exactly as a screen would.
  const LAYERS: readonly { icon: IconName; label: string }[] = [
    { icon: "journeys", label: "Journeys" },
    { icon: "transmission", label: "Transmission" },
    { icon: "diplomacy", label: "Diplomacy" },
    { icon: "territory", label: "Territory" },
    { icon: "sources", label: "Sources" },
  ]
  let layers = $state<Record<string, boolean | "mixed">>({
    Journeys: true,
    Transmission: "mixed",
    Diplomacy: false,
    Territory: false,
    Sources: true,
  })
  let tab = $state("events")
  let query = $state("鑒眞")
  let detent = $state<Detent>("peek")
  let quoteOpen = $state(false)
  let busy = $state(false)

  function pretend() {
    busy = true
    setTimeout(() => (busy = false), 1200)
  }
</script>

{#snippet sectionHeading(id: string, title: string, intro: string)}
  <header class="flex flex-col gap-1 border-b border-rule pb-3">
    <h2 {id} class="scroll-mt-6 font-serif text-title font-semibold">{title}</h2>
    <p class="max-w-prose text-body-sm text-ink-dim">{intro}</p>
  </header>
{/snippet}

{#snippet scene()}
  <!-- A stand-in for the globe: the plates must read over a busy scene. -->
  <div
    aria-hidden="true"
    class="absolute inset-0 bg-abyss"
    style="background-image: radial-gradient(circle at 30% 40%, var(--color-lacquer-raised), transparent 55%), radial-gradient(circle at 75% 70%, var(--color-gold-tint), transparent 40%), repeating-linear-gradient(115deg, transparent 0 18px, var(--color-rule) 18px 19px);"
  ></div>
{/snippet}

{#snippet arc(style: string, token: string)}
  <svg
    width="88"
    height="32"
    viewBox="0 0 88 32"
    aria-hidden="true"
    class="shrink-0"
    style="color: var(--color-{token})"
  >
    {#if style === "double"}
      <path d="M4 28 Q44 -2 84 28" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M4 22 Q44 -8 84 22" fill="none" stroke="currentColor" stroke-width="1.5" />
    {:else if style === "beads"}
      <path
        d="M4 28 Q44 0 84 28"
        fill="none"
        stroke="currentColor"
        stroke-width="4"
        stroke-linecap="round"
        stroke-dasharray="0.1 8"
      />
    {:else}
      <path
        d="M4 28 Q44 0 84 28"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-dasharray={style === "dashed" ? "6 4" : undefined}
      />
      {#if style === "chevrons"}
        <path
          d="M24 14l5 2-3 4M42 9l5 2-3 4M60 12l5 2-3 4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        />
      {/if}
    {/if}
  </svg>
{/snippet}

{#snippet mark(kind: string, token: string, dash?: string)}
  <svg
    width="88"
    height="32"
    viewBox="0 0 88 32"
    aria-hidden="true"
    class="shrink-0"
    style="color: var(--color-{token})"
  >
    {#if kind === "ring"}
      <circle cx="44" cy="16" r="8" fill="none" stroke="currentColor" stroke-width="3" />
    {:else if kind === "halo"}
      <circle cx="44" cy="16" r="14" fill="currentColor" opacity="0.18" />
      <circle cx="44" cy="16" r="4" fill="currentColor" />
    {:else}
      <path
        d="M4 16 H84"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-dasharray={dash}
      />
    {/if}
  </svg>
{/snippet}

<div class="min-h-dvh bg-abyss font-sans text-ink" data-dev-page="design">
  <header class="border-b border-rule bg-lacquer">
    <div class="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 lg:px-8">
      <p class="text-label font-semibold uppercase text-gold">
        <a
          href="/dev"
          class="rounded-control hover:text-gold-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
          >Lekishi · dev</a
        > · RFD 5
      </p>
      <h1 class="font-display text-display font-semibold">Design system</h1>
      <p class="max-w-prose text-body text-ink-dim">
        Every token and primitive, in its states, rendered from the stylesheet and the components
        themselves. This page is built in development and on pull-request previews only. The working
        rules are in <code class="text-ink">docs/design-system.md</code>; the decisions are in RFD
        5.
      </p>
    </div>
  </header>

  <div class="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[11rem_minmax(0,1fr)] lg:px-8">
    <nav aria-label="Sections" class="lg:sticky lg:top-6 lg:self-start">
      <ul class="flex flex-wrap gap-x-4 gap-y-1 lg:flex-col">
        {#each SECTIONS as [id, title] (id)}
          <li>
            <a
              href="#{id}"
              class="rounded-control text-body-sm text-ink-dim hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
            >
              {title}
            </a>
          </li>
        {/each}
      </ul>
    </nav>

    <main class="flex min-w-0 flex-col gap-14">
      <!-- Colour -->
      <section aria-labelledby="colour" class="flex flex-col gap-6">
        {@render sectionHeading(
          "colour",
          "Colour",
          "One material and one accent. Gold is reserved for what is current. Tailwind's own palette is off-limits; the guard test fails on it.",
        )}
        {#each GROUPS as group (group.title)}
          <div class="flex flex-col gap-3">
            <SectionLabel text={group.title} level={3} />
            <p class="-mt-2 text-caption text-ink-faint">{group.note}</p>
            <ul class="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3">
              {#each tokens.colors.filter((token) => group.match(token.name)) as token (token.name)}
                <li
                  class="overflow-hidden rounded-plate border border-rule bg-lacquer"
                  data-token={token.name}
                >
                  <div
                    class="relative h-16 border-b border-rule"
                    style="background: var(--color-{token.name})"
                  >
                    {#if !SURFACES.has(token.name) && token.name !== "on-gold" && token.name !== "gold-tint"}
                      <span
                        class="absolute inset-x-0 bottom-0 bg-lacquer px-2 py-0.5 font-serif text-body-sm"
                        style="color: var(--color-{token.name})"
                        lang="ja">Aa 鑒眞 753</span
                      >
                    {/if}
                  </div>
                  <div class="flex flex-col gap-0.5 px-2.5 py-2">
                    <span class="text-body-sm font-semibold">{token.name}</span>
                    <span class="text-caption break-all text-ink-faint tabular-nums"
                      >{token.value}</span
                    >
                    <span class="text-caption text-ink-dim tabular-nums"
                      >{legibility(token.name, token.value)}</span
                    >
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </section>

      <!-- Evidence -->
      <section aria-labelledby="evidence" class="flex flex-col gap-6">
        {@render sectionHeading(
          "evidence",
          "Evidence and relationships",
          "The only colours the map and the interface share. Each travels with a cue that is not colour, and the badge draws the same glyph as the mark.",
        )}
        <div class="flex flex-col gap-3">
          <SectionLabel text="Evidence forms" level={3} />
          <ul
            class="flex flex-col divide-y divide-rule rounded-plate border border-rule bg-lacquer"
          >
            {#each EVIDENCE as row (row.token)}
              <li class="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                {@render mark(row.mark, row.token, row.dash)}
                <Badge kind={row.badge} />
                <span class="min-w-40 flex-1 text-body-sm">{row.meaning}</span>
                <span class="text-caption text-ink-faint">{row.cue} · {row.token}</span>
              </li>
            {/each}
          </ul>
        </div>
        <div class="flex flex-col gap-3">
          <SectionLabel text="Relationships" level={3} />
          <ul
            class="flex flex-col divide-y divide-rule rounded-plate border border-rule bg-lacquer"
          >
            {#each RELATIONSHIPS as row (row.token)}
              <li class="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                {@render arc(row.style, row.token)}
                <span class="flex min-w-40 flex-1 items-center gap-2 text-body-sm">
                  {#if row.icon}<Icon name={row.icon} size={16} class="text-ink-dim" />{/if}
                  {row.meaning}
                </span>
                <span class="text-caption text-ink-faint">{row.cue} · {row.token}</span>
              </li>
            {/each}
          </ul>
        </div>
        <div class="flex flex-col gap-3">
          <SectionLabel text="States" level={3} />
          <p class="-mt-2 text-caption text-ink-faint">
            States modify whatever mark they apply to; they have no hue of their own.
          </p>
          <ul
            class="flex flex-col divide-y divide-rule rounded-plate border border-rule bg-lacquer"
          >
            {#each STATES as row (row.kind)}
              <li class="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                <span class="w-40 shrink-0"><Badge kind={row.kind} /></span>
                <span class="min-w-40 flex-1 text-body-sm text-ink-dim">{row.meaning}</span>
              </li>
            {/each}
          </ul>
        </div>
      </section>

      <!-- Typography -->
      <section aria-labelledby="type" class="flex flex-col gap-6">
        {@render sectionHeading(
          "type",
          "Typography",
          "Seven steps and a floor: nothing below 12 px except the Latin caps label, and no CJK below 13 px. The faces are self-hosted in a later step; until then each family falls back to a system face.",
        )}
        <ul class="flex flex-col divide-y divide-rule rounded-plate border border-rule bg-lacquer">
          {#each [...tokens.text].reverse() as step (step.name)}
            {@const sample = SPECIMEN[step.name]}
            <li class="grid gap-x-6 gap-y-1 px-4 py-3 md:grid-cols-[10rem_minmax(0,1fr)]">
              <div class="flex flex-col">
                <span class="text-body-sm font-semibold">text-{step.name}</span>
                <span class="text-caption text-ink-faint tabular-nums">
                  {step.value} / {step.lineHeight ?? "—"}{step.tracking
                    ? ` · ${step.tracking}`
                    : ""}
                </span>
                {#if sample}<span class="text-caption text-ink-dim">{sample.role}</span>{/if}
              </div>
              {#if sample}
                <p
                  lang={sample.lang}
                  class={["min-w-0 break-words", TEXT_CLASS[step.name], sample.font]}
                >
                  {sample.text}
                </p>
              {/if}
            </li>
          {/each}
        </ul>
        <ul class="grid gap-3 md:grid-cols-3">
          {#each tokens.fonts as font (font.name)}
            <li class="flex flex-col gap-1 rounded-plate border border-rule bg-lacquer px-3 py-3">
              <span class="text-label font-semibold uppercase text-ink-dim">font-{font.name}</span>
              <span class={["text-title-sm", FONT_CLASS[font.name]]}
                >Tang mission <span lang="ja">鑒眞</span> 753</span
              >
              <span class="text-caption break-words text-ink-faint">{font.value}</span>
            </li>
          {/each}
        </ul>
      </section>

      <!-- Shape and depth -->
      <section aria-labelledby="shape" class="flex flex-col gap-6">
        {@render sectionHeading(
          "shape",
          "Shape, space and depth",
          "Three radii, two depths, and a fixed z-order ladder. Space uses Tailwind's 4 px base at steps 1, 2, 3, 4, 6, 8 and 12.",
        )}
        <div class="flex flex-wrap gap-4">
          {#each [["control", "rounded-control", "Buttons, inputs, badges"], ["plate", "rounded-plate", "Plates, the card, rows"], ["full", "rounded-full", "Orbs, the dial, medallions"]] as [name, cls, use] (name)}
            <div class="flex w-44 flex-col gap-2">
              <div class={["size-16 border-2 border-gold bg-gold-tint", cls]}></div>
              <span class="text-body-sm font-semibold">{cls}</span>
              <span class="text-caption text-ink-faint">
                {tokens.radii.find((radius) => radius.name === name)?.value ?? "9999px"} · {use}
              </span>
            </div>
          {/each}
        </div>
        <div
          class="relative grid min-h-64 gap-4 overflow-hidden rounded-plate border border-rule p-4 md:grid-cols-2"
        >
          {@render scene()}
          <Plate title="Glass plate" level={3} class="relative self-start">
            <p class="text-body-sm text-ink-dim">
              Chrome over the scene: lacquer at 86 % with blur, the gold hairline, the plate shadow.
            </p>
          </Plate>
          <Plate tone="solid" title="Solid sheet" level={3} class="relative self-end">
            <p class="text-body-sm text-ink-dim">
              Sheets and the card when nothing should show through: lacquer, a rule line, the sheet
              shadow.
            </p>
          </Plate>
        </div>
        <ol class="flex flex-wrap gap-2" aria-label="Z-order ladder">
          {#each tokens.layers as layer (layer.name)}
            <li
              class="flex items-baseline gap-1.5 rounded-control border border-rule bg-lacquer px-2 py-1 text-caption"
            >
              <span class="font-semibold tabular-nums text-gold">{layer.value}</span>
              <span class="text-ink-dim">{layer.name}</span>
            </li>
          {/each}
        </ol>
      </section>

      <!-- Motion and focus -->
      <section aria-labelledby="motion" class="flex flex-col gap-6">
        {@render sectionHeading(
          "motion",
          "Motion and focus",
          "One easing and three durations. Under reduced motion the durations drop to zero and playback still advances, because time is content. One focus ring on every control.",
        )}
        <ul class="flex flex-col gap-3">
          {#each tokens.motion as duration (duration.name)}
            <li class="group flex flex-wrap items-center gap-4">
              <span class="w-40 text-body-sm"
                ><span class="font-semibold">{duration.name}</span>
                <span class="text-ink-faint tabular-nums">{duration.value}</span></span
              >
              <span
                class="relative h-6 w-56 rounded-full border border-rule bg-lacquer"
                aria-hidden="true"
              >
                <span
                  class="absolute top-0.5 left-0.5 size-4.5 rounded-full bg-gold transition-transform ease-ui group-hover:translate-x-[12.5rem]"
                  style="transition-duration: var(--motion-{duration.name})"
                ></span>
              </span>
              <span class="text-caption text-ink-faint">Hover the row</span>
            </li>
          {/each}
        </ul>
        <p class="text-caption text-ink-faint">
          Easing: {tokens.easing.map((ease) => `ease-${ease.name} ${ease.value}`).join(", ")}
        </p>
        <div class="flex flex-wrap items-center gap-6">
          <span
            class="inline-flex h-9 items-center rounded-control border border-frame bg-lacquer-glass px-3 text-body-sm font-semibold outline-2 outline-offset-2 outline-gold-bright"
          >
            Focus on lacquer
          </span>
          <span
            class="inline-flex h-9 items-center rounded-control bg-gold px-3 text-body-sm font-semibold text-on-gold outline-2 outline-offset-2 outline-ink"
          >
            Focus on gold
          </span>
          <span class="text-caption text-ink-faint"
            >Shown on <code>:focus-visible</code> only; tab through this page to see it live.</span
          >
        </div>
      </section>

      <!-- Components -->
      <section aria-labelledby="components" class="flex flex-col gap-6">
        {@render sectionHeading(
          "components",
          "Components",
          "The primitives in $lib/ui, in their states. Atlas screens compose these; they take a variant or tone, never a class that changes their look.",
        )}

        <Plate tone="solid" title="Button" level={3}>
          <div class="flex flex-col gap-4">
            {#each ["primary", "secondary", "ghost"] as const as variant (variant)}
              <div class="flex flex-wrap items-center gap-3">
                <span class="w-24 text-caption text-ink-faint">{variant}</span>
                <Button {variant} icon={variant === "primary" ? "play" : undefined}
                  >Begin the story</Button
                >
                <Button {variant} disabled>Disabled</Button>
                <Button {variant} busy>Saving</Button>
              </div>
            {/each}
            <div class="flex flex-wrap items-center gap-3">
              <span class="w-24 text-caption text-ink-faint">icon</span>
              <Button variant="icon" icon="step-back" label="Previous event" />
              <Button variant="icon" icon="play" label="Play" />
              <Button variant="icon" icon="step-forward" label="Next event" />
              <Button variant="icon" icon="close" label="Close" size="sm" />
              <Button variant="icon" icon="search" label="Search" disabled />
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <span class="w-24 text-caption text-ink-faint">link, busy</span>
              <Button href="#components" variant="secondary" icon="link"
                >A link that looks like a button</Button
              >
              <Button variant="secondary" {busy} onclick={pretend}
                >{busy ? "Working" : "Press to go busy"}</Button
              >
            </div>
          </div>
        </Plate>

        <Plate tone="solid" title="Orb" level={3}>
          <div class="flex flex-col gap-4">
            <div class="flex flex-wrap items-start gap-4">
              {#each LAYERS as layer (layer.label)}
                <Orb
                  icon={layer.icon}
                  label={layer.label}
                  showLabel
                  pressed={layers[layer.label]}
                  onchange={(next) => (layers[layer.label] = next)}
                />
              {/each}
              <Orb icon="territory" label="Unavailable" showLabel disabled />
            </div>
            <p class="text-caption text-ink-faint">
              Off is the hairline, on is a heavier ring with a tint, mixed is a dashed ring. Press
              them.
            </p>
          </div>
        </Plate>

        <Plate tone="solid" title="Badge" level={3}>
          <div class="flex flex-wrap gap-2">
            {#each Object.keys(BADGES) as BadgeKind[] as kind (kind)}
              <Badge {kind} />
            {/each}
          </div>
        </Plate>

        <div class="grid gap-6 md:grid-cols-2">
          <Plate tone="solid" title="Tabs" level={3}>
            <Tabs
              label="Chapter exploration"
              idPrefix="reference-tabs"
              tabs={[
                { id: "events", label: "Events", count: 24 },
                { id: "story", label: "Story", count: 37 },
                { id: "sources", label: "Sources", count: 11 },
              ]}
              bind:selected={tab}
            >
              {#snippet children(id)}
                <p class="text-body-sm text-ink-dim">
                  {id === "events"
                    ? "The window's 24 events, 750–754."
                    : id === "story"
                      ? "The 37 steps of the Tang mission's story."
                      : "The chapter's 11 sources, with their terms."}
                  Use the arrow keys, Home and End.
                </p>
              {/snippet}
            </Tabs>
          </Plate>

          <Plate tone="solid" title="Field" level={3}>
            <div class="flex flex-col gap-4">
              <Field
                label="Search every chapter"
                bind:value={query}
                hint="A name in any script, a place, a year"
              />
              <Field label="Search the chapter" placeholder="A name, a place, a year" hideLabel />
            </div>
          </Plate>
        </div>

        <div class="grid gap-6 md:grid-cols-2">
          <Plate tone="solid" title="NameForm and DateLine" level={3}>
            <div class="flex flex-col gap-4">
              <NameForm
                name="秋妻屋浦"
                lang="ja"
                romanization="Akimeya no ura"
                modern="坊津 (a modern scholarly proposal)"
                modernLang="ja"
                size="title"
              />
              <NameForm name="鑒眞" lang="lzh" romanization="Jianzhen" />
              <DateLine year="753" calendar="天寶十二載" day="十二月廿日" precision="to the day" />
              <DateLine
                year="754"
                calendar="天平勝寶六年"
                precision="to the year"
                calendarLang="ja"
              />
            </div>
          </Plate>

          <Plate tone="solid" title="CitationLine" level={3}>
            <div class="flex flex-col gap-2">
              <CitationLine
                source="唐大和上東征傳 (Tōdaiwajō tōseiden)"
                sourceLang="lzh"
                locator="the landfall entry"
                terms="public domain"
                onopen={() => (quoteOpen = !quoteOpen)}
              />
              {#if quoteOpen}
                <blockquote lang="lzh" class="border-l-2 border-gold pl-3 font-serif text-body-sm">
                  廿日乙酉午時，第二舟著薩摩國阿多郡秋妻屋浦
                </blockquote>
              {/if}
              <CitationLine
                source="日本歴史地名大系「阿多郡」"
                sourceLang="ja"
                terms="citation only"
              />
            </div>
          </Plate>
        </div>

        <Plate tone="solid" title="EmptyState" level={3}>
          <div class="grid gap-4 md:grid-cols-2">
            <EmptyState kind="uncovered" />
            <EmptyState kind="filtered">
              {#snippet action()}
                <Button variant="ghost" size="sm" icon="close">Clear the search</Button>
              {/snippet}
            </EmptyState>
          </div>
        </Plate>

        <Plate tone="solid" title="Sheet" level={3}>
          <div class="flex flex-col gap-4">
            <p class="text-caption text-ink-faint">
              A side panel at desktop; on phones a bottom sheet with peek, half and full detents.
              Its handle steps through them.
            </p>
            <div class="flex flex-wrap gap-4">
              <div
                class="relative h-[32rem] w-[390px] max-w-full overflow-hidden rounded-plate border border-rule"
              >
                {@render scene()}
                <div
                  class="absolute inset-x-0 bottom-0 flex flex-col justify-end"
                  style="height: 32rem"
                >
                  <Sheet title="Explore" placement="bottom" bind:detent class="max-h-[30rem]">
                    <div class="flex flex-col gap-2">
                      <p class="text-caption text-ink-faint">Detent: {detent}</p>
                      <DateLine year="753" calendar="天寶十二載" day="十二月廿日" />
                      <p class="font-serif text-title-sm">The second ship's landfall at 秋妻屋浦</p>
                    </div>
                  </Sheet>
                </div>
              </div>
              <div
                class="relative h-[32rem] w-80 max-w-full overflow-hidden rounded-plate border border-rule p-3"
              >
                {@render scene()}
                <Sheet title="About this chapter" onclose={() => {}} class="relative">
                  <p class="text-body-sm text-ink-dim">
                    Editorial status, coverage and review independence, stated once.
                  </p>
                </Sheet>
              </div>
            </div>
          </div>
        </Plate>
      </section>

      <!-- Icons -->
      <section aria-labelledby="icons" class="flex flex-col gap-6">
        {@render sectionHeading(
          "icons",
          "Icons",
          "One inline SVG set on a 24 px grid with a 2 px stroke. Decorative unless given a label.",
        )}
        <ul class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
          {#each Object.keys(ICONS) as IconName[] as name (name)}
            <li
              class="flex items-center gap-2 rounded-control border border-rule bg-lacquer px-2 py-2"
            >
              <Icon {name} size={20} class="text-ink" />
              <span class="truncate text-caption text-ink-dim">{name}</span>
            </li>
          {/each}
        </ul>
      </section>
    </main>
  </div>
</div>
