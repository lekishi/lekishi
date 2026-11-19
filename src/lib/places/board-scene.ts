import type { GeoPoint } from "$lib/atlas/domain"
import { STORY_TINT, type AtlasScene, type SceneBoard, type ScenePlace } from "$lib/atlas/scene"
import type { PlaceEntry } from "./catalogue"

export function placesBoard(points: readonly GeoPoint[]): SceneBoard {
  return { lit: points.map((point) => ({ ...point, player: STORY_TINT })), remembered: [] }
}

export function placesScene(
  entries: readonly PlaceEntry[],
  selected: PlaceEntry | null,
  chapterId: string | null,
  board: SceneBoard,
  camera: Pick<AtlasScene, "homeView" | "homeToken" | "cameraFocus" | "cameraTarget" | "safeArea">,
): AtlasScene {
  const places = entries.flatMap(({ id, place, chapters }): ScenePlace[] => {
    if (place.position === null) return []
    const on = id === selected?.id
    return [
      {
        id,
        position: place.position,
        label: place.label,
        mark:
          place.placement === "display-anchor"
            ? "anchor"
            : place.precision === "site"
              ? "attested"
              : "identified",
        precision: place.precision,
        playback: "inactive",
        tone: "definite",
        selected: on,
        disputed: false,
        tradition: false,
        control: null,
        eventCount: chapters.length,
        banner: {
          tint: STORY_TINT,
          active: chapterId !== null && chapters.some((chapter) => chapter.id === chapterId),
          unit: null,
        },
      },
    ]
  })

  return {
    chapterId: "places",
    timeWindow: { start: 0, end: 0 },
    playhead: 0,
    playing: false,
    events: [],
    places,
    journeys: [],
    arcs: [],
    territories: [],
    selectedEventId: null,
    selectedPlaceId: selected?.id ?? null,
    selectionOutsideWindow: false,
    cameraFollow: "manual",
    ...camera,
    board,
  }
}
