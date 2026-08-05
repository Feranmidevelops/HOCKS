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
  /** seq increments per client tick; the server acks the last one applied. */
  | { type: 'input'; seq: number; target: Vec2 }
  | { type: 'netsim'; config: NetSimConfig }
  /** Valid while the game is over: this seat wants to play again. */
  | { type: 'rematch' }

/** What the room is currently doing. The server owns this, like goals. */
export type LiveGameMode = 'solo' | 'versus' | 'paused' | 'over'

export type ServerMsg =
  | { type: 'welcome'; playerIndex: 0 | 1 }
  /**
   * ack = highest input seq of THIS receiver that the state reflects.
   * Snapshots are personalized per seat for exactly this field: it is what
   * lets the client drop confirmed inputs and resimulate only the rest.
   */
  | { type: 'snapshot'; state: SimState; ack: number }
  /** Broadcast on every mode transition and to every fresh joiner. */
  | { type: 'game'; mode: LiveGameMode; winner: 0 | 1 | null }
  | { type: 'full' }
