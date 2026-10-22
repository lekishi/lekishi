<script lang="ts">
  import { SectionLabel, focusRing, transition } from "$lib/ui"
  import type { StoryOption } from "../domain"
  import { windowLabel } from "../labels"

  /**
   * The chapter's stories, above the journal, when it has more than one
   * (rfd/0002/CHAPTER_STORIES.adoc). Each row is a story's title and the
   * window it opens on; choosing one opens it at its start, in its own window.
   * The story the reader is in is marked as the journal marks its step, with
   * gold and `aria-current`.
   */
  let {
    stories,
    current,
    onStory,
  }: {
    stories: readonly StoryOption[]
    /** The key of the story the reader is in. */
    current: string
    onStory: (key: string) => void
  } = $props()
</script>

<nav aria-label="Stories in this chapter" class="mb-2 shrink-0 border-b border-rule pb-2">
  <SectionLabel text="Stories" count={stories.length} level={3} class="mb-1 px-2" />
  <ul class="flex list-none flex-col gap-0.5" data-testid="atlas-stories">
    {#each stories as story (story.key)}
      <li>
        <button
          type="button"
          data-testid="atlas-story-option"
          data-story={story.key}
          aria-current={story.key === current ? "true" : undefined}
          onclick={() => onStory(story.key)}
          class={[
            "flex w-full cursor-pointer items-baseline gap-2.5 rounded-plate px-2 py-1.5 text-left",
            transition,
            focusRing,
            story.key === current
              ? "bg-gold-tint text-ink"
              : "text-ink-dim hover:bg-lacquer-raised hover:text-ink",
          ]}
        >
          <span
            class={[
              "min-w-0 flex-1 truncate font-serif text-body-sm",
              story.key === current && "font-semibold",
            ]}>{story.title}</span
          >
          <span class="shrink-0 text-caption tabular-nums text-ink-dim"
            >{windowLabel(story.window)}</span
          >
        </button>
      </li>
    {/each}
  </ul>
</nav>
