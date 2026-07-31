import type { NetSimConfig } from '../protocol'

export const PASSTHROUGH: NetSimConfig = { latencyMs: 0, jitterMs: 0, lossPct: 0 }

/**
 * Network conditions simulator for one direction of one connection.
 * Every message passes through here so bad conditions can be summoned on
 * demand: fixed added latency, uniform jitter on top, and percentage loss.
 *
 * Delivery order is never allowed to invert (a later message can't beat an
 * earlier one) because WebSocket rides TCP — jitter delays messages, it
 * doesn't reorder them. Loss is applied at the app layer; on real TCP,
 * packet loss shows up as delay spikes instead, which Phase 7's measured
 * numbers will make visible.
 */
export class NetSim {
  private lastDeliverAt = 0

  constructor(
    private cfg: NetSimConfig = { ...PASSTHROUGH },
    private rng: () => number = Math.random,
    private clock: () => number = () => performance.now(),
  ) {}

  setConfig(cfg: NetSimConfig): void {
    this.cfg = cfg
  }

  /** When a message sent at `nowMs` gets delivered — or null if dropped. */
  plan(nowMs: number): number | null {
    const { latencyMs, jitterMs, lossPct } = this.cfg
    if (lossPct > 0 && this.rng() * 100 < lossPct) return null
    if (latencyMs <= 0 && jitterMs <= 0) return Math.max(nowMs, this.lastDeliverAt)
    const deliverAt = Math.max(nowMs + latencyMs + this.rng() * jitterMs, this.lastDeliverAt)
    this.lastDeliverAt = deliverAt
    return deliverAt
  }

  /** Deliver through the simulated conditions (possibly never). */
  send(deliver: () => void): void {
    const nowMs = this.clock()
    const at = this.plan(nowMs)
    if (at === null) return
    if (at <= nowMs) deliver()
    else setTimeout(deliver, at - nowMs)
  }
}
