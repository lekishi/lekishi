import { QIN_CHAPTER, TANG_CHAPTER } from "./chapter-registry"
import type { ChapterOverlays } from "./overlays"

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

const NO_OVERLAYS: ChapterOverlays = {
  journeys: [],
  actorAnchors: {},
  endAnchors: {},
  dioramas: [],
}

/**
 * The served chapters' overlays.
 *
 * Tang: 鑒眞's travel to Japan is a published relationship (`jianzhen-travel`,
 * 753–754), and its stops are the chapter's own events for him and for the
 * second ship he sailed on, at their published places. 大伴古麻呂's stops are
 * the events that name him as a participant. The two courts stand for the two
 * states. The transmission to 東大寺 starts at 揚州, where the chapter's events
 * place 鑒眞 before the voyage.
 *
 * Qin: 韓非's embassy runs from 新鄭 to 雲陽, the two events that name him. 新鄭
 * (Han's capital) stands for 韓, and 雲陽, where Qin held 韓非, stands for 秦;
 * the chapter publishes no place for Qin's capital, and the map says the ends
 * are schematic.
 */
export const CHAPTER_OVERLAYS: Readonly<Record<string, ChapterOverlays>> = {
  [TANG_CHAPTER]: {
    journeys: [
      {
        id: "jianzhen-voyage",
        label: "鑒眞's voyage to Japan, 753–754",
        relationshipId: "lks:relationship:jianzhen-travel",
        stops: [
          { eventId: "lks:event:longxing-departure-753", vessel: "party" },
          { eventId: "lks:event:return-voyage-753", vessel: "ship" },
          { eventId: "lks:event:ajinawa-arrival-753", vessel: "ship" },
          { eventId: "lks:event:yaku-arrival-753", vessel: "ship" },
          { eventId: "lks:event:yaku-departure-753", vessel: "ship" },
          { eventId: "lks:event:akimeya-landfall-753", vessel: "ship" },
          { eventId: "lks:event:dazaifu-entry-753", vessel: "party" },
          { eventId: "lks:event:naniwa-754", vessel: "party" },
          { eventId: "lks:event:todaiji-installation-754", vessel: "party" },
        ],
      },
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

/** A chapter's overlay definitions; a chapter without any draws places only. */
export function overlayDefinitions(chapterId: string): ChapterOverlays {
  return CHAPTER_OVERLAYS[chapterId] ?? NO_OVERLAYS
}
