/**
 * Phase 7: the numbers behind the debug overlay. Everything the netcode
 * phases were tuned around, measured live: RTT, snapshot arrival cadence
 * and jitter, resimulated ticks per reconciliation, correction magnitudes,
 * and wire traffic. Pure collector — every method takes explicit times, so
 * it is fully unit-testable.
 */

const GAP_WINDOW = 60 // snapshot inter-arrival gaps kept (≈3s at 20Hz)
const TRAFFIC_WINDOW_MS = 2000
const CORRECTION_WINDOW_MS = 5000
const CORRECTION_EMA = 0.1

export interface StatsReport {
  rttMs: number | null
  /** Mean snapshot inter-arrival gap (expected: 50ms at 20Hz). */
  snapGapMeanMs: number | null
  /** Mean absolute deviation of the gaps — the felt jitter. */
  snapJitterMs: number | null
  bytesInPerSec: number
  bytesOutPerSec: number
  /** Unacked inputs replayed at the last reconciliation ≈ RTT in ticks. */
  resimTicks: number
  correctionAvg: number
  correctionMax: number
}

interface Sample {
  t: number
  v: number
}

export class Stats {
  private rtt: number | null = null
  private lastSnapAt: number | null = null
  private gaps: number[] = []
  private trafficIn: Sample[] = []
  private trafficOut: Sample[] = []
  private corrections: Sample[] = []
  private correctionEma = 0
  private resimTicks = 0

  pong(rttMs: number): void {
    this.rtt = rttMs
  }

  snapshotArrived(nowMs: number): void {
    if (this.lastSnapAt !== null) {
      this.gaps.push(nowMs - this.lastSnapAt)
      if (this.gaps.length > GAP_WINDOW) this.gaps.shift()
    }
    this.lastSnapAt = nowMs
  }

  bytes(dir: 'in' | 'out', count: number, nowMs: number): void {
    const log = dir === 'in' ? this.trafficIn : this.trafficOut
    log.push({ t: nowMs, v: count })
  }

  correction(magnitude: number, resimTicks: number, nowMs: number): void {
    this.resimTicks = resimTicks
    this.corrections.push({ t: nowMs, v: magnitude })
    this.correctionEma += CORRECTION_EMA * (magnitude - this.correctionEma)
  }

  report(nowMs: number): StatsReport {
    const rate = (log: Sample[]): number => {
      const cutoff = nowMs - TRAFFIC_WINDOW_MS
      while (log.length > 0 && log[0].t < cutoff) log.shift()
      let sum = 0
      for (const s of log) sum += s.v
      return (sum * 1000) / TRAFFIC_WINDOW_MS
    }

    let gapMean: number | null = null
    let jitter: number | null = null
    if (this.gaps.length >= 2) {
      let sum = 0
      for (const g of this.gaps) sum += g
      gapMean = sum / this.gaps.length
      let dev = 0
      for (const g of this.gaps) dev += Math.abs(g - gapMean)
      jitter = dev / this.gaps.length
    }

    const cutoff = nowMs - CORRECTION_WINDOW_MS
    while (this.corrections.length > 0 && this.corrections[0].t < cutoff) this.corrections.shift()
    let max = 0
    for (const c of this.corrections) if (c.v > max) max = c.v

    return {
      rttMs: this.rtt,
      snapGapMeanMs: gapMean,
      snapJitterMs: jitter,
      bytesInPerSec: rate(this.trafficIn),
      bytesOutPerSec: rate(this.trafficOut),
      resimTicks: this.resimTicks,
      correctionAvg: this.correctionEma,
      correctionMax: max,
    }
  }
}
