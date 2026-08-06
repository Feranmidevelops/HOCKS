import { describe, expect, it } from 'vitest'
import { Stats } from '../src/client/stats'

describe('overlay stats', () => {
  it('measures snapshot cadence and jitter', () => {
    const s = new Stats()
    // Arrivals at 50, 50, 60, 40ms gaps → mean 50, MAD (0+0+10+10)/4 = 5.
    let t = 1000
    s.snapshotArrived(t)
    for (const gap of [50, 50, 60, 40]) {
      t += gap
      s.snapshotArrived(t)
    }
    const r = s.report(t)
    expect(r.snapGapMeanMs).toBeCloseTo(50, 6)
    expect(r.snapJitterMs).toBeCloseTo(5, 6)
  })

  it('computes traffic rates over the rolling window', () => {
    const s = new Stats()
    // 500 bytes in per 100ms for 2s → 5000 B/s.
    for (let t = 0; t < 2000; t += 100) s.bytes('in', 500, t)
    s.bytes('out', 100, 1900)
    const r = s.report(2000)
    expect(r.bytesInPerSec).toBeCloseTo(5000, 0)
    expect(r.bytesOutPerSec).toBeCloseTo(50, 0)
    // Old samples age out of the window.
    const later = s.report(5000)
    expect(later.bytesInPerSec).toBe(0)
  })

  it('tracks correction magnitude average and windowed max', () => {
    const s = new Stats()
    s.correction(10, 18, 1000)
    s.correction(67, 20, 1500)
    let r = s.report(1600)
    expect(r.correctionMax).toBe(67)
    expect(r.resimTicks).toBe(20)
    expect(r.correctionAvg).toBeGreaterThan(0)
    // The 67u spike falls out of the 5s window.
    r = s.report(7000)
    expect(r.correctionMax).toBe(0)
  })

  it('reports null cadence before two snapshots and last known rtt', () => {
    const s = new Stats()
    expect(s.report(0).snapGapMeanMs).toBeNull()
    expect(s.report(0).rttMs).toBeNull()
    s.pong(302)
    expect(s.report(0).rttMs).toBe(302)
  })
})
