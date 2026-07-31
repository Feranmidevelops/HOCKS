import { describe, expect, it } from 'vitest'
import { NetSim } from '../src/server/netsim'

/** Deterministic PRNG (mulberry32) so the jitter/loss draws are stable. */
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('network conditions simulator', () => {
  it('passthrough config delivers immediately', () => {
    const sim = new NetSim({ latencyMs: 0, jitterMs: 0, lossPct: 0 }, mulberry32(1))
    expect(sim.plan(1000)).toBe(1000)
    expect(sim.plan(1016)).toBe(1016)
  })

  it('adds at least the configured latency and never reorders (TCP semantics)', () => {
    const sim = new NetSim({ latencyMs: 100, jitterMs: 80, lossPct: 0 }, mulberry32(42))
    let prev = -Infinity
    for (let i = 0; i < 500; i++) {
      const now = i * 10
      const at = sim.plan(now)
      expect(at).not.toBeNull()
      expect(at!).toBeGreaterThanOrEqual(now + 100)
      expect(at!).toBeLessThanOrEqual(Math.max(now + 180, prev))
      expect(at!).toBeGreaterThanOrEqual(prev) // order preserved
      prev = at!
    }
  })

  it('drops roughly the configured fraction of messages', () => {
    const sim = new NetSim({ latencyMs: 0, jitterMs: 0, lossPct: 30 }, mulberry32(7))
    let dropped = 0
    const n = 10_000
    for (let i = 0; i < n; i++) {
      if (sim.plan(i) === null) dropped++
    }
    expect(dropped / n).toBeGreaterThan(0.27)
    expect(dropped / n).toBeLessThan(0.33)
  })
})
