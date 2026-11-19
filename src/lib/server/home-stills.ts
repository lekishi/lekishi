import { chapterRelease } from "$lib/atlas/release"

const tang = "tang-mission-750-754"

// The captures come from the Tang opening and the demo World board. Keep
// the files out of public output if any of their source chapters is unapproved.
export const homeStills = {
  chapterId: chapterRelease(tang) ? tang : null,
  world: [tang, "du-huan-751-762", "stephen-ii-journey-753-754"].every(chapterRelease),
}
