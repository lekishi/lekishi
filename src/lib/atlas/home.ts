import type { ChapterCard } from "./chapters"
import type { Position } from "./memory"
import type { RegionKey } from "$lib/historical/regions"

export type HomeChapter = ChapterCard & {
  region: RegionKey
  places: number
  events: number
  /** Opening story first, as in the chapter's URL contract. */
  stories: { key: string; captions: string[] }[]
}

export function savedStop(chapter: HomeChapter, position: Position) {
  const query = new URLSearchParams(position.search)
  const storyKey = query.get("story")
  const story =
    storyKey === null ? chapter.stories[0] : chapter.stories.find((s) => s.key === storyKey)
  const value = query.get("step") ?? ""
  const step = /^\d+$/.test(value) ? Number(value) : 0
  const total = story?.captions.length ?? 0
  // Keep the same selection precedence as the chapter route. A stale or
  // empty query still opens as saved, but does not claim progress in a story.
  if (query.get("event")?.trim()) return { label: `Event · ${position.label}` }
  if (query.get("place")?.trim()) return { label: `Place · ${position.label}` }
  if (!story || step < 1 || step > total) return { label: position.label }
  return {
    label: `Step ${step} of ${total} · ${story.captions[step - 1]}`,
    step,
    total,
    next: story.captions[step],
  }
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

export function openedAgo(at: number, now: number): string {
  const days = Math.max(0, Math.floor((now - at) / 86_400_000))
  if (days < 7) return relative.format(-days, "day")
  if (days < 30) return relative.format(-Math.floor(days / 7), "week")
  if (days < 365) return relative.format(-Math.floor(days / 30), "month")
  return relative.format(-Math.floor(days / 365), "year")
}
