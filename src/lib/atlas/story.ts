import type { Chapter, StoryStep } from "./domain"

/**
 * Story navigation.
 *
 * The chapter's published story is its own presentation order, so the atlas
 * follows that order rather than composing one. These helpers are pure: they
 * answer which step is the chapter's next or previous openable event, so the
 * workspace can offer explicit "Next in story" jumps without inventing a
 * chronology — an uncertain occurrence keeps its span, and a step the atlas
 * cannot open is never treated as an event.
 */

/** The story steps the atlas can open as events, in the story's own order. */
export function openableSteps(chapter: Chapter): StoryStep[] {
  return chapter.story.filter((step) => step.kind === "event")
}

/** Where an event sits in the story's openable order, or -1 when it is not a step. */
export function storyIndex(chapter: Chapter, eventId: string | null): number {
  if (eventId === null) {
    return -1
  }

  return openableSteps(chapter).findIndex((step) => step.recordId === eventId)
}

/** The next openable step after an event, or null at the story's end. */
export function nextStoryStep(chapter: Chapter, eventId: string | null): StoryStep | null {
  const index = storyIndex(chapter, eventId)

  if (index === -1) {
    return null
  }

  return openableSteps(chapter)[index + 1] ?? null
}

/** The openable step before an event, or null at the story's start. */
export function previousStoryStep(chapter: Chapter, eventId: string | null): StoryStep | null {
  const index = storyIndex(chapter, eventId)

  if (index <= 0) {
    return null
  }

  return openableSteps(chapter)[index - 1] ?? null
}

/**
 * The caption of the story step that carries an event, or null when the event is
 * not a step. The caption is the story's own text, so a surface can show where in
 * the story the reader is without paraphrasing it.
 */
export function storyCaption(chapter: Chapter, eventId: string | null): string | null {
  const index = storyIndex(chapter, eventId)

  return index === -1 ? null : (openableSteps(chapter)[index]?.caption ?? null)
}
