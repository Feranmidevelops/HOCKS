import { DT, SUBSTEPS } from '../sim/constants'
import { movePaddle } from '../sim/physics'
import { createInitialState } from '../sim/types'
import type { Body, Vec2 } from '../sim/types'

const TICK_MS = DT * 1000
const MAX_FRAME_MS = 250

const cloneBody = (b: Body): Body => ({
  pos: { x: b.pos.x, y: b.pos.y },
  vel: { x: b.vel.x, y: b.vel.y },
})

/**
 * Phase 3: client-side prediction for the player's own paddle.
 *
 * The paddle is kinematic and driven only by our own pointer — the one input
 * we know instantly and perfectly — so we run the exact server movement code
 * (movePaddle, same substep count) on a local fixed-timestep loop and render
 * the result immediately. No reconciliation: barring a lost input (which
 * latest-wins self-heals within a tick), the server computes this same
 * trajectory half an RTT later. The shared puck is the hard case — its
 * motion depends on the opponent's inputs, which we don't have — and that
 * is Phase 4's problem, not this class's.
 */
export class OwnPaddlePredictor {
  private prev: Body
  private curr: Body
  private acc = 0
  private last: number | null = null

  constructor(readonly player: 0 | 1) {
    const start = createInitialState().paddles[player]
    this.prev = cloneBody(start)
    this.curr = cloneBody(start)
  }

  /** Advance whole local ticks up to `nowMs`, steering toward `target` (table space). */
  advance(nowMs: number, target: Vec2): void {
    if (this.last === null) this.last = nowMs
    this.acc = Math.min(this.acc + (nowMs - this.last), MAX_FRAME_MS)
    this.last = nowMs
    const dtSub = DT / SUBSTEPS
    while (this.acc >= TICK_MS) {
      this.prev = this.curr
      const next = cloneBody(this.curr)
      for (let s = 0; s < SUBSTEPS; s++) movePaddle(next, target, dtSub, this.player)
      this.curr = next
      this.acc -= TICK_MS
    }
  }

  /** Body for display: interpolated by the accumulator remainder, same as any fixed-timestep renderer. */
  view(): Body {
    const k = this.acc / TICK_MS
    return {
      pos: {
        x: this.prev.pos.x + (this.curr.pos.x - this.prev.pos.x) * k,
        y: this.prev.pos.y + (this.curr.pos.y - this.prev.pos.y) * k,
      },
      vel: { x: this.curr.vel.x, y: this.curr.vel.y },
    }
  }

  /** The state at the last completed tick — what the server will compute. */
  current(): Body {
    return cloneBody(this.curr)
  }
}
