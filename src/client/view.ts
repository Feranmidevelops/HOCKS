import { TABLE_H, TABLE_W } from '../sim/constants'
import type { Body, SimState, Vec2 } from '../sim/types'

/**
 * Both players want their own goal at the bottom of their screen, but table
 * coordinates put player 1's goal at the top. These transforms rotate the
 * world 180° for player 1 — state for display, pointer input back to table
 * space — so the renderer can keep assuming "index 0 defends the bottom".
 */

const flipVec = (v: Vec2): Vec2 => ({ x: TABLE_W - v.x, y: TABLE_H - v.y })
const flipBody = (b: Body): Body => ({
  pos: flipVec(b.pos),
  vel: { x: -b.vel.x, y: -b.vel.y },
})

export function toViewState(s: SimState, player: 0 | 1): SimState {
  if (player === 0) return s
  return {
    tick: s.tick,
    puck: flipBody(s.puck),
    paddles: [flipBody(s.paddles[1]), flipBody(s.paddles[0])],
    score: [s.score[1], s.score[0]],
    freeze: s.freeze,
    stalled: s.stalled,
  }
}

export function toTableCoords(target: Vec2, player: 0 | 1): Vec2 {
  return player === 0 ? { ...target } : flipVec(target)
}
