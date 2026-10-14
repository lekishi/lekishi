<script lang="ts">
  import { Button, Dialog, SectionLabel } from "$lib/ui"
  import type { ChapterFacts } from "../card"
  import type { Chapter } from "../domain"
  import { reviewLabel, windowLabel } from "../labels"

  /**
   * The About sheet (RFD 5): the one place the chapter's editorial status is
   * stated in full. The card and the frame no longer repeat the review label
   * beside every event; they link here instead. Everything on it is the
   * chapter's own: the recorded decision, the review the publication recorded,
   * the coverage statement verbatim, and counts derived from the records, so
   * the sheet stays true when the content changes.
   *
   * It is a modal dialog: About is a pause, not a panel to keep open beside the
   * map. `open` is owned by the workspace, and Escape or the close button
   * report back through `onClose`.
   */
  let {
    chapter,
    name,
    decision,
    facts,
    open,
    onClose,
  }: {
    chapter: Chapter
    name: string
    decision: string
    facts: ChapterFacts
    open: boolean
    onClose: () => void
  } = $props()

  const publication = $derived(chapter.publication)
  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`
  const factRows = $derived([
    ["Events", `${facts.inWindow}${facts.coda > 0 ? ` + ${facts.coda} coda` : ""}`],
    ["Places", `${facts.places}`],
    ["Relationships", `${facts.relationships}`],
    ["Sources", `${facts.sources}`],
    ["Disputed", plural(facts.disputed, "account", "accounts")],
    ["Not on the map", `${facts.unplaced} events · ${facts.unlocatedPlaces} places`],
  ])
</script>

<Dialog
  {open}
  id="atlas-about"
  labelledby="atlas-about-title"
  onclose={onClose}
  class="w-[36rem]"
>
  <div class="flex max-h-[calc(100dvh-1.5rem)] flex-col">
    <header class="flex shrink-0 items-start gap-3 border-b border-rule px-5 pt-4 pb-3">
      <div class="min-w-0 flex-1">
        <p class="text-label font-semibold uppercase text-gold">About this chapter</p>
        <h2 id="atlas-about-title" class="mt-1 font-serif text-title text-ink">{name}</h2>
        <p class="mt-0.5 text-body-sm tabular-nums text-ink-dim">
          {windowLabel(chapter.defaultWindow)}
        </p>
      </div>
      <Button variant="icon" icon="close" size="sm" label="Close About" onclick={onClose} />
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <p id="atlas-about-decision" class="text-body-sm font-semibold text-gold-bright">
        {decision}
      </p>
      <p class="mt-1 text-body-sm text-ink-dim">
        {reviewLabel(publication.independence, publication.reviewer)}
      </p>

      <SectionLabel text="What it covers" level={3} class="mt-5 mb-1.5" />
      <p class="text-body text-ink">{publication.coverageNote}</p>

      <SectionLabel text="In the records" level={3} class="mt-5 mb-1.5" />
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm sm:grid-cols-3">
        {#each factRows as [term, value] (term)}
          <div class="min-w-0">
            <dt class="text-caption text-ink-faint">{term}</dt>
            <dd class="tabular-nums text-ink">{value}</dd>
          </div>
        {/each}
      </dl>
      <p class="mt-2 text-caption text-ink-faint">
        Events without a sourced position stay in the list and are never placed on the map.
      </p>

      <SectionLabel text="Review notes" level={3} class="mt-5 mb-1.5" />
      <p class="text-body-sm whitespace-pre-line text-ink-dim">{publication.reviewNotes}</p>
      <p class="mt-2 text-caption text-ink-faint">
        Published {publication.publishedAt} in {publication.setIds.join(", ")}.
      </p>

      <SectionLabel text="The globe" level={3} class="mt-5 mb-1.5" />
      <p class="text-body-sm text-ink-dim">
        Terrain is open elevation data, painted with Natural Earth II and shipped with the site; no
        map service is contacted. Journeys and relationship arcs are schematic.
        <a
          href="/globe/ATTRIBUTION.txt"
          class="rounded-control text-ink underline decoration-rule underline-offset-2 hover:text-gold-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
          >Full attribution</a
        >
      </p>
    </div>
  </div>
</Dialog>
