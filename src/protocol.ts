import type { SimState, Vec2 } from './sim/types'

/**
 * Wire protocol between client and server. Shared by both sides — the
 * client imports this through Vite, the server through tsx. Plain JSON;
 * the full state is ~24 numbers, so bandwidth has nothing to teach here.
 */

export interface NetSimConfig {
  /** One-way added latency, ms. Applied to both directions (RTT = 2x). */
  latencyMs: number
  /** Uniform random extra delay on top of latency, ms. */
  jitterMs: number
  /** Chance each message is silently dropped, percent. */
  lossPct: number
}

export type ClientMsg =
  | { type: 'input'; target: Vec2 }
  | { type: 'netsim'; config: NetSimConfig }

export type ServerMsg =
  | { type: 'welcome'; playerIndex: 0 | 1 }
  | { type: 'snapshot'; state: SimState }
  | { type: 'full' }
