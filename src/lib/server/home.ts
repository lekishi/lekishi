import type { ChapterCard } from "$lib/atlas/chapters"
import type { Chapter } from "$lib/atlas/domain"
import type { HomeChapter } from "$lib/atlas/home"
import { reachOf } from "$lib/dev/region-timeline"
import type { RegionKey } from "$lib/historical/regions"

// Keep projections and full source records on the server. Home needs only the
// directory and the captions that resolve a saved position and its next step.
export function homeChapter(
  card: ChapterCard,
  region: RegionKey,
  stories: readonly Chapter[],
): HomeChapter {
  const { places, events } = reachOf(stories, {
    title: card.name,
    window: card.window,
    region,
  }).chapter
  return {
    ...card,
    region,
    places,
    events,
    stories: stories.map(({ storyKey, story }) => ({
      key: storyKey,
      captions: story.map((step) => step.caption),
    })),
  }
}
