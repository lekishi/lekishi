<script lang="ts">
  import { Button, Dialog, Icon, focusRing, transition } from "$lib/ui"
  import { CHAPTERS } from "../chapters"
  import { windowLabel } from "../labels"
  import { chapterPosition, type Position } from "../memory"
  import TimeRibbon from "./TimeRibbon.svelte"

  /**
   * The chapter switcher (RFD 5, "Chapters"): every chapter on the time ribbon,
   * then each with its window and summary. A chapter the reader has been in
   * offers "Continue" at the position they left, which is kept on this device
   * only, and says so.
   */
  let {
    open,
    current,
    onClose,
  }: {
    open: boolean
    current: string
    onClose: () => void
  } = $props()

  // Read when the dialog opens, so a position left a moment ago is offered.
  let positions: Record<string, Position | null> = $state({})

  $effect(() => {
    if (open) {
      positions = Object.fromEntries(
        CHAPTERS.map((chapter) => [chapter.id, chapterPosition(chapter.id)]),
      )
    }
  })
</script>

<Dialog
  {open}
  id="chapter-switcher"
  labelledby="chapter-switcher-title"
  placement="top"
  onclose={onClose}
  class="w-[40rem]"
>
  <div class="flex max-h-[calc(100dvh-14dvh-1.5rem)] flex-col">
    <header class="flex shrink-0 items-center gap-3 border-b border-rule px-5 pt-4 pb-3">
      <h2 id="chapter-switcher-title" class="flex-1 font-serif text-title text-ink">Chapters</h2>
      <Button variant="icon" icon="close" size="sm" label="Close chapters" onclick={onClose} />
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <TimeRibbon chapters={CHAPTERS} {current} />
      <ul class="mt-4 flex flex-col gap-3">
        {#each CHAPTERS as chapter (chapter.id)}
          {@const here = chapter.id === current}
          {@const position = positions[chapter.id] ?? null}
          <li
            class={[
              "rounded-plate border px-4 py-3",
              here ? "border-gold bg-gold-tint" : "border-rule bg-lacquer-raised",
            ]}
          >
            <div class="flex items-baseline gap-2">
              <a
                href={chapter.href}
                onclick={() => here && onClose()}
                class={[
                  "min-w-0 flex-1 rounded-control font-serif text-title-sm text-ink no-underline hover:text-gold-bright",
                  transition,
                  focusRing,
                ]}
                aria-current={here ? "page" : undefined}>{chapter.name}</a
              >
              <span class="shrink-0 text-caption text-ink-dim tabular-nums"
                >{windowLabel(chapter.window)}</span
              >
            </div>
            <p class="mt-1 line-clamp-2 text-body-sm text-ink-dim">{chapter.summary}</p>
            <p class="mt-1 text-caption text-ink-faint">{chapter.status}</p>
            {#if position && !here && position.search !== ""}
              <a
                href="{chapter.href}{position.search}"
                class={[
                  "mt-2 inline-flex items-center gap-1.5 rounded-control text-body-sm text-gold-bright no-underline hover:text-gold",
                  transition,
                  focusRing,
                ]}
              >
                Continue at <span class="font-serif">{position.label}</span>
                <Icon name="arrow-right" size={14} />
              </a>
            {/if}
          </li>
        {/each}
      </ul>
      <p class="mt-4 text-caption text-ink-faint">
        Where you left each chapter is kept on this device only.
      </p>
    </div>
  </div>
</Dialog>
