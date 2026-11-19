import { loadServedStories } from "$lib/atlas/chapter-catalog"
import { CHAPTER_MANIFESTS } from "$lib/atlas/chapter-registry"
import { placeCatalogue, type PlaceCatalogue } from "./catalogue"

/** Prerender from the public catalogue. Never import member drafts here. */
export async function loadPlaces(): Promise<PlaceCatalogue> {
  return placeCatalogue(
    await Promise.all(
      CHAPTER_MANIFESTS.filter((chapter) => chapter.served).map(async (chapter) => ({
        title: chapter.title,
        region: chapter.region,
        stories: await loadServedStories(chapter.id),
      })),
    ),
  )
}
