/**
 * Label placement for the globe's markers: which labels to show so none
 * overprints another.
 *
 * Several of a chapter's events can share one place (ten of the Tang chapter's
 * sit at 平城宮), and their labels used to stack illegibly. Labels are placed
 * greedily in priority order, the selected event first, then events at the
 * playhead, then the rest in scene order, and a label that would overlap one
 * already placed is hidden. The marker stays, so every placed event can still
 * be seen and picked; only the text is withheld. Pure, so it is testable
 * without a renderer.
 */

export type LabelBox = {
  readonly id: string
  /** Higher places first. */
  readonly priority: number
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** The ids of the labels to show, given each candidate's screen box. */
export function placeLabels(candidates: readonly LabelBox[], gap = 2): Set<string> {
  return new Set(placeLabelBoxes(candidates, gap).keys())
}

/**
 * The box each shown label was placed in, by id. A label may offer several
 * boxes under one id, in order of preference (a line's caption can sit at
 * more than one point along it): the first that fits is used.
 */
export function placeLabelBoxes(candidates: readonly LabelBox[], gap = 2): Map<string, LabelBox> {
  const ordered = candidates
    .map((box, index) => ({ box, index }))
    .sort((a, b) => b.box.priority - a.box.priority || a.index - b.index)
  const placed: LabelBox[] = []
  const shown = new Map<string, LabelBox>()

  for (const { box } of ordered) {
    if (shown.has(box.id)) continue

    const overlaps = placed.some(
      (other) =>
        box.left < other.left + other.width + gap &&
        other.left < box.left + box.width + gap &&
        box.top < other.top + other.height + gap &&
        other.top < box.top + box.height + gap,
    )

    if (!overlaps) {
      placed.push(box)
      shown.set(box.id, box)
    }
  }

  return shown
}
