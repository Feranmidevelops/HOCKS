import type { Vec2 } from '../sim/types'

/**
 * Phase 5: reconciliation corrections rendered as blends, not teleports.
 *
 * When the reconciler adopts an authoritative correction, the difference
 * between what we showed and what is true becomes an error offset. The sim
 * state corrects instantly (physics never lies); only the DISPLAY carries
 * the offset, and it decays to zero over ~150ms. Velocity error is tracked
 * too and integrated into the position error — so the displayed puck keeps
 * a ghost of its old momentum and curves onto the corrected path instead of
 * kinking sideways, which reads as wrong even when the numbers are right.
 *
 * Thresholds, chosen by feel and written down (the roadmap's ask):
 * - SNAP_AT = 140u ≈ a third of the table width / 10 puck radii. Beyond
 *   that the puck isn't slightly off, it's somewhere else (missed goal,
 *   post-freeze reset) — easing would show it gliding through paddles and
 *   walls, worse than an honest teleport.
 * - POS_TAU 80ms / VEL_TAU 60ms: ~85% of the error is gone by 150ms,
 *   inside the roadmap's 100–200ms window. Velocity decays faster than
 *   position so the ghost momentum can't overshoot the blend.
 */
export const SNAP_AT = 140
export const POS_TAU_MS = 80
export const VEL_TAU_MS = 60
// Below one table unit (≈ one on-screen pixel) the offset is invisible.
const DONE_POS = 1
const DONE_VEL = 5

export class ErrorSmoother {
  private posErr: Vec2 = { x: 0, y: 0 }
  private velErr: Vec2 = { x: 0, y: 0 }

  /** Fold a new correction (old display − new truth) into the offset. */
  addCorrection(posDelta: Vec2, velDelta: Vec2): void {
    this.posErr.x += posDelta.x
    this.posErr.y += posDelta.y
    this.velErr.x += velDelta.x
    this.velErr.y += velDelta.y
    // Too large to ease: accept the teleport rather than glide through geometry.
    if (Math.hypot(this.posErr.x, this.posErr.y) > SNAP_AT) this.reset()
  }

  /** Decay the offset by real elapsed display time. */
  advance(dtMs: number): void {
    if (this.posErr.x === 0 && this.posErr.y === 0 && this.velErr.x === 0 && this.velErr.y === 0) {
      return
    }
    const dt = dtMs / 1000
    // Ghost momentum: old trajectory bleeds into the position offset.
    this.posErr.x += this.velErr.x * dt
    this.posErr.y += this.velErr.y * dt
    const pk = Math.exp(-dtMs / POS_TAU_MS)
    const vk = Math.exp(-dtMs / VEL_TAU_MS)
    this.posErr.x *= pk
    this.posErr.y *= pk
    this.velErr.x *= vk
    this.velErr.y *= vk
    if (
      Math.hypot(this.posErr.x, this.posErr.y) < DONE_POS &&
      Math.hypot(this.velErr.x, this.velErr.y) < DONE_VEL
    ) {
      this.reset()
    }
  }

  reset(): void {
    this.posErr = { x: 0, y: 0 }
    this.velErr = { x: 0, y: 0 }
  }

  /** What the renderer adds to the true position this frame. */
  offset(): Vec2 {
    return { x: this.posErr.x, y: this.posErr.y }
  }

  magnitude(): number {
    return Math.hypot(this.posErr.x, this.posErr.y)
  }
}
