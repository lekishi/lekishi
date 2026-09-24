import { describe, expect, it } from "vitest"
import { CHAPTER } from "./chapter-content"
import type { PlaybackState } from "./time"
import { buildScene } from "./scene"
import { advancePlayhead, createAtlasState, setPlayhead, setPlaying, setTimeWindow } from "./state"

/**
 * Playback over the reviewed chapter.
 *
 * The workspace's clock advances the playhead in fractional years while the
 * timeline displays whole years, so the classification has to follow the
 * displayed year. These cases drive the real clock rather than a round number,
 * because a fraction is exactly what the previous containment check missed: a
 * single-year instant could pass under the playhead without ever being active.
 */

const WINDOW = { start: 750, end: 760 }

function playbackAt(eventId: string, playhead: number): PlaybackState {
  // Built directly rather than through `setPlayhead`, which rounds: the point of
  // these cases is the raw fraction the clock actually produces.
  const state = {
    ...setTimeWindow(createAtlasState(CHAPTER), CHAPTER, WINDOW),
    playhead,
  }
  const scene = buildScene(state, CHAPTER)
  const event = scene.events.find((candidate) => candidate.id === eventId)

  if (event === undefined) {
    throw new Error(`${eventId} is not in the window at ${playhead}`)
  }

  return event.playback
}

describe("playback over the reviewed chapter", () => {
  it("classifies the year the timeline displays, not the clock's fraction", () => {
    const playing = setPlaying(
      setPlayhead(setTimeWindow(createAtlasState(CHAPTER), CHAPTER, WINDOW), CHAPTER, 753),
      true,
    )
    const advanced = advancePlayhead(playing, CHAPTER, 100)
    const scene = buildScene(advanced, CHAPTER)
    const playback = (eventId: string) =>
      scene.events.find((event) => event.id === eventId)?.playback

    // 100 ms at the chapter's rate is a fraction of a year, and the timeline
    // still shows 753.
    expect(advanced.playhead).toBeGreaterThan(753)
    expect(advanced.playhead).toBeLessThan(754)
    expect(Math.round(advanced.playhead)).toBe(753)

    // The 753 instant, the duration that supports 753, and the 753–754
    // occurrence window are all read at the displayed year.
    expect(playback("lks:event:tang-new-year-audience-753")).toBe("active")
    expect(playback("lks:event:return-voyage-753")).toBe("active")
    expect(playback("lks:event:kiyokawa-drift-753")).toBe("possible")
  })

  it("moves on when the displayed year moves on", () => {
    const playing = setPlaying(
      setPlayhead(setTimeWindow(createAtlasState(CHAPTER), CHAPTER, WINDOW), CHAPTER, 753),
      true,
    )
    const nextYear = advancePlayhead(advancePlayhead(playing, CHAPTER, 100), CHAPTER, 250)
    const scene = buildScene(nextYear, CHAPTER)
    const playback = (eventId: string) =>
      scene.events.find((event) => event.id === eventId)?.playback

    expect(Math.round(nextYear.playhead)).toBe(754)

    // The 753 instant is behind the playhead now; a 754 instant is active, and
    // the uncertain 753–754 span is still only possible.
    expect(playback("lks:event:tang-new-year-audience-753")).toBe("inactive")
    expect(playback("lks:event:rewards-754")).toBe("active")
    expect(playback("lks:event:kiyokawa-drift-753")).toBe("possible")
  })

  it("never classifies a fractional playhead differently from the year it displays", () => {
    // Under half a year, the timeline still shows 753: the instant and the
    // uncertain span are read there.
    for (const fraction of [0.1, 0.2, 0.4]) {
      expect(playbackAt("lks:event:tang-new-year-audience-753", 753 + fraction)).toBe("active")
      expect(playbackAt("lks:event:kiyokawa-drift-753", 753 + fraction)).toBe("possible")
    }

    // From half a year on, it shows 754: the 753 instant is behind the playhead
    // and a 754 instant is the active one.
    for (const fraction of [0.5, 0.9]) {
      expect(playbackAt("lks:event:tang-new-year-audience-753", 753 + fraction)).toBe("inactive")
      expect(playbackAt("lks:event:rewards-754", 753 + fraction)).toBe("active")
      expect(playbackAt("lks:event:kiyokawa-drift-753", 753 + fraction)).toBe("possible")
    }
  })
})
