import { DT } from '../sim/constants'
import { step } from '../sim/step'
import type { InputFrame, SimState, Vec2 } from '../sim/types'
import { lerpState } from './interp'

const TICK_MS = DT * 1000
const MAX_FRAME_MS = 250

export interface PendingInput {
  seq: number
  target: Vec2
}

/**
 * Phase 4: prediction + reconciliation for the whole local view — most
 * importantly the shared puck.
 *
 * Every local tick: tag the input with a sequence number, keep it in the
 * unacked buffer, apply it to the predicted state immediately. On every
 * snapshot: reset to the server's authoritative state, drop inputs the ack
 * covers, and resimulate the remaining unacked inputs to get back to
 * present.
 *
 * During prediction and resimulation the opponent is frozen at their last
 * known position — their future inputs are the one thing we cannot know.
 * That's why puck misprediction is guaranteed, and concentrated exactly at
 * the moment the opponent strikes: the correction arrives one RTT later as
 * a visible jump. Phase 4 shows that jump raw; smoothing it without lying
 * about physics is Phase 5.
 */
export class Reconciler {
  private pending: PendingInput[] = []
  private nextSeq = 1
  private prev: SimState | null = null
  private curr: SimState | null = null
  private acc = 0
  private last: number | null = null

  constructor(readonly player: 0 | 1) {}

  /** Advance whole local ticks up to `nowMs`; returns one input per tick to send. */
  advance(nowMs: number, target: Vec2): PendingInput[] {
    if (this.last === null) this.last = nowMs
    this.acc = Math.min(this.acc + (nowMs - this.last), MAX_FRAME_MS)
    this.last = nowMs
    const sent: PendingInput[] = []
    while (this.acc >= TICK_MS) {
      sent.push(this.tickOnce(target))
      this.acc -= TICK_MS
    }
    return sent
  }

  private tickOnce(target: Vec2): PendingInput {
    const input: PendingInput = { seq: this.nextSeq++, target: { x: target.x, y: target.y } }
    this.pending.push(input)
    if (this.curr !== null) {
      this.prev = this.curr
      this.curr = step(this.curr, this.frameFor(input.target, this.curr))
    }
    return input
  }

  /** Own input as given; opponent frozen at their last known position. */
  private frameFor(ownTarget: Vec2, base: SimState): InputFrame {
    const opp = base.paddles[this.player === 0 ? 1 : 0].pos
    const oppTarget = { x: opp.x, y: opp.y }
    return this.player === 0
      ? { targets: [ownTarget, oppTarget] }
      : { targets: [oppTarget, ownTarget] }
  }

  /** Reset to authority, drop acked inputs, resimulate the rest. */
  onSnapshot(state: SimState, ack: number): void {
    this.pending = this.pending.filter((p) => p.seq > ack)
    let s = state
    for (const p of this.pending) s = step(s, this.frameFor(p.target, s))
    // Snap both display states: corrections render raw in Phase 4.
    this.prev = s
    this.curr = s
  }

  /** Predicted state for display, interpolated between local ticks. */
  view(): SimState | null {
    if (this.prev === null || this.curr === null) return null
    return lerpState(this.prev, this.curr, this.acc / TICK_MS)
  }

  pendingCount(): number {
    return this.pending.length
  }
}
