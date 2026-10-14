/**
 * Framing the camera into the clear zone, and pacing what it reports.
 *
 * The workspace's chrome covers the edges of the scene (RFD 5, "Scene safe
 * area"), so a flight that centres a place on the canvas can land it under a
 * rail. The view shifts the projection's principal point instead: the camera
 * still looks straight at its target, but the target is drawn at the centre
 * of the clear zone. Every flight, the home view and camera following then
 * frame into the clear zone without knowing about it. Pure, so it is tested
 * without a camera.
 */

export type Insets = {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

/** The least of each dimension the clear zone keeps, however wide the chrome reports itself. */
const MIN_CLEAR_FRACTION = 0.3

function clampPair(a: number, b: number, size: number): [number, number] {
  const near = Math.max(0, Number.isFinite(a) ? a : 0)
  const far = Math.max(0, Number.isFinite(b) ? b : 0)
  const allowed = size * (1 - MIN_CLEAR_FRACTION)

  if (near + far <= allowed) {
    return [near, far]
  }

  // Scale both down together, so the clear zone keeps its side of the screen.
  const scale = allowed / (near + far)
  return [near * scale, far * scale]
}

/**
 * The view offset that draws the camera's axis at the clear zone's centre,
 * for `PerspectiveCamera.setViewOffset(width, height, x, y, width, height)`.
 * Insets wider than the canvas are scaled down so the clear zone keeps at
 * least 30 % of each dimension.
 */
export function principalOffset(
  width: number,
  height: number,
  insets: Insets,
): { readonly x: number; readonly y: number } {
  const [left, right] = clampPair(insets.left, insets.right, width)
  const [top, bottom] = clampPair(insets.top, insets.bottom, height)
  return { x: (right - left) / 2, y: (bottom - top) / 2 }
}

/**
 * Paces the camera reports for the minimap: at most one per `intervalMs`
 * while the camera moves, and always one when it comes to rest, so the last
 * report is where the camera settled.
 */
export class ViewThrottle {
  private last = -Infinity
  private pending = false

  constructor(private readonly intervalMs: number) {}

  /** Called once per animation frame; true when the view should be reported now. */
  frame(now: number, moved: boolean): boolean {
    if (moved) {
      if (now - this.last >= this.intervalMs) {
        this.last = now
        this.pending = false
        return true
      }

      this.pending = true
      return false
    }

    if (this.pending) {
      this.pending = false
      this.last = now
      return true
    }

    return false
  }
}
