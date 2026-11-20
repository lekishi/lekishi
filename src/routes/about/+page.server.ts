import { loadServedStories } from "$lib/atlas/chapter-catalog"
import { SERVED_CHAPTERS } from "$lib/atlas/chapter-registry"

export async function load() {
  const stories = await Promise.all(SERVED_CHAPTERS.map(({ id }) => loadServedStories(id)))
  const appearances = new Map<string, number>()
  for (const chapter of stories) {
    // A place can occur in more than one story within the same chapter.
    const places = new Set(chapter.flatMap((story) => story.places.map(({ id }) => id)))
    for (const id of places) appearances.set(id, (appearances.get(id) ?? 0) + 1)
  }
  return {
    chapters: SERVED_CHAPTERS.length,
    sharedPlaces: [...appearances.values()].filter((count) => count > 1).length,
  }
}
