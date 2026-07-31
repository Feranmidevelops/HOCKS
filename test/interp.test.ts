import { describe, expect, it } from 'vitest'
import { DT } from '../src/sim/constants'
import { SnapshotBuffer } from '../src/client/interp'
import { createInitialState, type SimState } from '../src/sim/types'

const TICK_MS = DT * 1000
const DELAY = 100

function snap(tick: number, puckX: number): SimState {
  const s = createInitialState()
  s.tick = tick
  s.puck.pos.x = puckX
  return s
}

/** Feed snapshots at a perfectly steady 20Hz cadence starting at local t0. */
function steadyBuffer(t0: number, ticks: number[], xs: number[]): SnapshotBuffer {
  const buf = new SnapshotBuffer(DELAY)
  ticks.forEach((tick, i) => buf.push(snap(tick, xs[i]), t0 + tick * TICK_MS))
  return buf
}

describe('snapshot interpolation', () => {
  it('returns null before any snapshot arrives', () => {
    expect(new SnapshotBuffer(DELAY).sample(1234)).toBeNull()
  })

  it('renders exactly delayMs behind the newest server time', () => {
    // Ticks 0..12 every 3 ticks (50ms). Newest server time = 200ms.
    const buf = steadyBuffer(5000, [0, 3, 6, 9, 12], [100, 110, 120, 130, 140])
    // Local clock when tick 12 arrived was 5000 + 200; sample right then:
    // renderT = 200 - 100 = 100 → exactly the tick-6 snapshot.
    const s = buf.sample(5200)!
    expect(s.puck.pos.x).toBeCloseTo(120, 6)
  })

  it('interpolates midway between the two straddling snapshots', () => {
    const buf = steadyBuffer(5000, [0, 3, 6, 9, 12], [100, 110, 120, 130, 140])
    // renderT = 125ms → halfway between tick 6 (100ms) and tick 9 (150ms).
    const s = buf.sample(5225)!
    expect(s.puck.pos.x).toBeCloseTo(125, 6)
  })

  it('holds the newest snapshot when starved instead of extrapolating', () => {
    const buf = steadyBuffer(5000, [0, 3, 6], [100, 110, 120])
    const s = buf.sample(99999)!
    expect(s.puck.pos.x).toBe(120)
  })

  it('ignores stale or duplicate snapshots', () => {
    const buf = new SnapshotBuffer(DELAY)
    buf.push(snap(6, 120), 5100)
    buf.push(snap(3, 110), 5110) // late arrival of an older snapshot
    buf.push(snap(6, 999), 5120) // duplicate tick
    const s = buf.sample(99999)!
    expect(s.puck.pos.x).toBe(120)
  })

  it('takes discrete fields (score, freeze) from the earlier snapshot', () => {
    const a = snap(3, 100)
    const b = snap(6, 120)
    b.score = [1, 0]
    b.freeze = 45
    const buf = new SnapshotBuffer(DELAY)
    buf.push(a, 5050)
    buf.push(b, 5100)
    // renderT lands between the two snapshots.
    const s = buf.sample(5175)!
    expect(s.puck.pos.x).toBeGreaterThan(100)
    expect(s.puck.pos.x).toBeLessThan(120)
    expect(s.score).toStrictEqual([0, 0])
    expect(s.freeze).toBe(0)
  })

  it('reset clears everything (reconnect path)', () => {
    const buf = steadyBuffer(5000, [0, 3, 6], [100, 110, 120])
    buf.reset()
    expect(buf.sample(5200)).toBeNull()
  })
})
