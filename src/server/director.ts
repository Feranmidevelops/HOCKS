export type GameMode = 'idle' | 'solo' | 'versus' | 'paused' | 'over'

export const WIN_SCORE_DEFAULT = 7
export const PAUSE_TIMEOUT_MS = 30_000

export interface Transition {
  /** Mode changed — broadcast the new game message. */
  changed: boolean
  /** Start a fresh game (score/puck/paddles), KEEPING the tick counter —
   * client snapshot buffers reject non-increasing ticks by design. */
  reset: boolean
}

const NONE: Transition = { changed: false, reset: false }

/**
 * Phase 6: the unhappy-path state machine. Pure logic, no sockets, no
 * timers — the server feeds it joins/leaves/rematches/ticks and applies
 * the transitions it returns.
 *
 *   idle ── join ──▶ solo ── join ──▶ versus ── score reaches WIN ──▶ over
 *                     ▲                │  ▲                            │
 *                     │       mid-rally drop  rejoin (state intact)    │
 *                     │                ▼  │                            │
 *   pause timeout ── paused ───────────┘  └── all seated ready ────────┘
 *                                              (rematch: fresh game)
 */
export class GameDirector {
  mode: GameMode = 'idle'
  winner: 0 | 1 | null = null
  private seated: [boolean, boolean] = [false, false]
  private ready: [boolean, boolean] = [false, false]
  private pauseDeadline: number | null = null

  constructor(readonly winScore: number = WIN_SCORE_DEFAULT) {}

  private bothSeated(): boolean {
    return this.seated[0] && this.seated[1]
  }

  private go(mode: GameMode, reset: boolean): Transition {
    const changed = mode !== this.mode
    this.mode = mode
    this.ready = [false, false]
    if (mode !== 'over') this.winner = null
    if (mode !== 'paused') this.pauseDeadline = null
    return { changed, reset }
  }

  join(idx: 0 | 1): Transition {
    this.seated[idx] = true
    switch (this.mode) {
      case 'idle':
        return this.go('solo', true)
      case 'solo':
        // A challenger arrived: fair fresh start.
        return this.go('versus', true)
      case 'paused':
        // Reconnect mid-rally: resume exactly where the game stopped.
        return this.go('versus', false)
      case 'over':
        // Someone joined a finished game: start a fresh one.
        return this.go(this.bothSeated() ? 'versus' : 'solo', true)
      default:
        return NONE
    }
  }

  leave(idx: 0 | 1, nowMs: number): Transition {
    this.seated[idx] = false
    this.ready[idx] = false
    if (!this.seated[0] && !this.seated[1]) return this.go('idle', true)
    if (this.mode === 'versus') {
      // Opponent dropped mid-rally: hold the game for them.
      const t = this.go('paused', false)
      this.pauseDeadline = nowMs + PAUSE_TIMEOUT_MS
      return t
    }
    if (this.mode === 'over') return this.go('solo', true)
    return NONE
  }

  /** Call periodically: expires the pause when the opponent isn't coming back. */
  poll(nowMs: number): Transition {
    if (this.mode === 'paused' && this.pauseDeadline !== null && nowMs >= this.pauseDeadline) {
      return this.go('solo', true)
    }
    return NONE
  }

  rematch(idx: 0 | 1): Transition {
    if (this.mode !== 'over' || !this.seated[idx]) return NONE
    this.ready[idx] = true
    const allReady =
      (!this.seated[0] || this.ready[0]) && (!this.seated[1] || this.ready[1])
    if (allReady) return this.go(this.bothSeated() ? 'versus' : 'solo', true)
    return NONE
  }

  /** The sim only advances in live modes. */
  shouldStep(): boolean {
    return this.mode === 'solo' || this.mode === 'versus'
  }

  /** Detect a finished game after a tick. The server owns goals AND wins. */
  afterStep(score: [number, number]): Transition {
    if (!this.shouldStep()) return NONE
    const winner = score[0] >= this.winScore ? 0 : score[1] >= this.winScore ? 1 : null
    if (winner === null) return NONE
    const t = this.go('over', false)
    this.winner = winner
    return t
  }
}
