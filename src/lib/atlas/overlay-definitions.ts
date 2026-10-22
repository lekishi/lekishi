import { QIN_CHAPTER, TANG_CHAPTER } from "./chapter-registry"
import { curatedJourney, type ChapterOverlays, type CuratedJourney } from "./overlays"

/**
 * Where each chapter's overlays are defined (see `overlays.ts` for what a
 * journey, an arc anchor and a diorama mean).
 *
 * The definitions name a chapter's own records, so they are chapter content and
 * travel with it: the projection attaches them to the chapter, and the browser
 * receives them in the chapter's page data, never in a shared script. Only the
 * projection imports this module, and the projection runs on the server (while
 * prerendering, and in the Pages worker for a member's draft). A chapter a
 * production build leaves out must not be named by any public file (RFD 6), and
 * `scripts/check-static-build.mjs` fails the build if one is; importing this
 * table from browser code would put every chapter's id in a script.
 */

/** A chapter's overlays as written here, with its hand-written journeys. */
type CuratedOverlays = Omit<ChapterOverlays, "journeys"> & {
  readonly journeys: readonly CuratedJourney[]
}

const NO_OVERLAYS: CuratedOverlays = {
  journeys: [],
  actorAnchors: {},
  endAnchors: {},
  dioramas: [],
}

/**
 * The served chapters' overlays.
 *
 * Journeys with a published record are not written here: the
 * projection draws them from the chapter's journey records, as the 753 return
 * voyages are. What remains is curation in code, uncited and unapproved, until
 * each journey is authored as a record (RFD 2, "Decided: the journey record").
 *
 * Tang: 大伴古麻呂's stops are the events that name him as a participant. The two courts stand for the two
 * states. The transmission to 東大寺 starts at 揚州, where the chapter's events
 * place 鑒眞 before the voyage.
 *
 * Qin: 韓非's embassy runs from 新鄭 to 雲陽, the two events that name him. 新鄭
 * (Han's capital) stands for 韓, and 雲陽, where Qin held 韓非, stands for 秦;
 * the chapter publishes no place for Qin's capital, and the map says the ends
 * are schematic.
 */
export const CHAPTER_OVERLAYS: Readonly<Record<string, CuratedOverlays>> = {
  [TANG_CHAPTER]: {
    journeys: [
      {
        id: "komaro-embassy",
        label: "大伴古麻呂's embassy, 752–754",
        relationshipId: "lks:relationship:japan-tang-embassy",
        stops: [
          { eventId: "lks:event:sekito-752", vessel: "party" },
          { eventId: "lks:event:tang-new-year-audience-753", vessel: "party" },
          { eventId: "lks:event:yangzhou-invitation-753", vessel: "party" },
          { eventId: "lks:event:return-report-754", vessel: "party" },
        ],
      },
    ],
    actorAnchors: {
      "lks:actor:japan-state": "lks:place:heijo-palace",
      "lks:actor:tang-dynasty": "lks:place:hanyuan-hall",
    },
    endAnchors: {
      "lks:relationship:jianzhen-transmission": { from: "lks:place:yangzhou" },
    },
    dioramas: [
      {
        id: "akimeya",
        placeId: "lks:place:akimeya",
        url: "/dioramas/akimeya.json",
        showBelowMeters: 220_000,
      },
    ],
  },
  [QIN_CHAPTER]: {
    journeys: [
      {
        id: "hanfei-embassy",
        label: "韓非's embassy to Qin, 233 BCE",
        relationshipId: null,
        stops: [
          { eventId: "lks:event:han-submission-233", vessel: "party" },
          { eventId: "lks:event:hanfei-death-233", vessel: "party" },
        ],
      },
    ],
    actorAnchors: {
      "lks:actor:han-state": "lks:place:xinzheng",
      "lks:actor:qin-state": "lks:place:yunyang",
    },
    endAnchors: {},
    dioramas: [],
  },
}

/** A chapter's hand-written overlays; a chapter without any draws places only. */
export function overlayDefinitions(chapterId: string): ChapterOverlays {
  const overlays = CHAPTER_OVERLAYS[chapterId] ?? NO_OVERLAYS

  return { ...overlays, journeys: overlays.journeys.map(curatedJourney) }
}
