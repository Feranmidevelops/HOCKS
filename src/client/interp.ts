import { DT } from '../sim/constants'
import type { Body, SimState, Vec2 } from '../sim/types'

/**
 * Phase 2: snapshot interpolation. Snapshots arrive at 20Hz; drawing them
 * as-is stutters. Instead we render ~100ms in the past, interpolating
 * between the two snapshots that straddle the render time — deliberately
 * trading added latency for smoothness. The delay also buys loss headroom:
 * a dropped snapshot just widens the pair we interpolate across.
 */
export const INTERP_DELAY_MS = 100

const TICK_MS = DT * 1000
// EMA factor for the server-timeline clock offset; smooths arrival jitter
// so render time advances steadily instead of twitching per snapshot.
const OFFSET_SMOOTHING = 0.1
const MAX_BUFFER_MS = 1000

interface Entry {
  t: number
  state: SimState
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const lerpVec = (a: Vec2, b: Vec2, k: number): Vec2 => ({
  x: lerp(a.x, b.x, k),
  y: lerp(a.y, b.y, k),
})
const lerpBody = (a: Body, b: Body, k: number): Body => ({
  pos: lerpVec(a.pos, b.pos, k),
  vel: lerpVec(a.vel, b.vel, k),
})

export function lerpState(a: SimState, b: SimState, k: number): SimState {
  return {
    // Discrete fields come from the earlier snapshot: at the moment being
    // depicted, the newer snapshot's score/freeze haven't happened yet.
    tick: a.tick,
    score: [a.score[0], a.score[1]],
    freeze: a.freeze,
    puck: lerpBody(a.puck, b.puck, k),
    paddles: [lerpBody(a.paddles[0], b.paddles[0], k), lerpBody(a.paddles[1], b.paddles[1], k)],
  }
}

export class SnapshotBuffer {
  private entries: Entry[] = []
  /** Server-timeline ms minus local ms, EMA-smoothed. */
  private offset: number | null = null

  constructor(private delayMs: number = INTERP_DELAY_MS) {}

  push(state: SimState, nowMs: number): void {
    const t = state.tick * TICK_MS
    const newest = this.entries[this.entries.length - 1]
    if (newest !== undefined && t <= newest.t) return // stale or duplicate
    this.entries.push({ t, state })

    const instOffset = t - nowMs
    this.offset =
      this.offset === null ? instOffset : this.offset + OFFSET_SMOOTHING * (instOffset - this.offset)

    const cutoff = t - MAX_BUFFER_MS
    while (this.entries.length > 2 && this.entries[0].t < cutoff) this.entries.shift()
  }

  reset(): void {
    this.entries = []
    this.offset = null
  }

  /** The interpolated state at (now − delay) on the server timeline. */
  sample(nowMs: number): SimState | null {
    if (this.offset === null || this.entries.length === 0) return null
    const renderT = nowMs + this.offset - this.delayMs
    const es = this.entries
    if (renderT <= es[0].t) return es[0].state
    const last = es[es.length - 1]
    // Starved (burst loss or a stall): hold the newest snapshot rather than
    // extrapolate — guessing physics is Phase 4's job, not the renderer's.
    if (renderT >= last.t) return last.state
    let i = es.length - 2
    while (es[i].t > renderT) i--
    const a = es[i]
    const b = es[i + 1]
    return lerpState(a.state, b.state, (renderT - a.t) / (b.t - a.t))
  }
}
