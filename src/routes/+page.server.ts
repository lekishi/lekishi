import { loadServedStories } from "$lib/atlas/chapter-catalog"
import { CHAPTER_MANIFESTS } from "$lib/atlas/chapter-registry"
import { CHAPTERS } from "$lib/atlas/chapters"
import { TURN_ERA, worldTurn } from "$lib/dev/world-turn"
import { homeChapter } from "$lib/server/home"
import { homeStills } from "$lib/server/home-stills"
import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async () => {
  const stories = await Promise.all(CHAPTERS.map(({ id }) => loadServedStories(id)))
  const chapters = CHAPTERS.map((card, index) => {
    const manifest = CHAPTER_MANIFESTS.find(({ id }) => id === card.id)
    if (!manifest) throw new Error(`Missing manifest for ${card.id}`)
    return homeChapter(card, manifest.region, stories[index])
  })

  const year = 753
  const openingStories = stories.map(([first]) => first)
  const turns = Array.from({ length: TURN_ERA.end - TURN_ERA.start + 1 }, (_, index) => {
    const turn = TURN_ERA.start + index
    const { players } = worldTurn(openingStories, turn)
    return {
      year: turn,
      events: players.reduce((sum, player) => sum + player.events.length, 0),
      players: players.map(({ chapterId }) => chapterId),
    }
  })

  return {
    chapters,
    stills: homeStills,
    world: {
      year,
      start: TURN_ERA.start,
      end: TURN_ERA.end,
      turns: turns.map(({ year, events }) => ({ year, events })),
      players: turns.find((turn) => turn.year === year)?.players ?? [],
    },
  }
}
