import { TABLE_H, TABLE_W } from './constants'

export interface Vec2 {
  x: number
  y: number
}

export interface Body {
  pos: Vec2
  vel: Vec2
}

export interface SimState {
  tick: number
  puck: Body
  /** paddles[0] defends the bottom goal (the player), paddles[1] the top. */
  paddles: [Body, Body]
  /** score[i] = goals scored by player i. */
  score: [number, number]
  /** Ticks until the puck is live again after a goal. */
  freeze: number
}

/** Everything the sim needs to advance one tick. */
export interface InputFrame {
  /** Desired paddle position per player, in table coordinates. */
  targets: [Vec2, Vec2]
}

export function createInitialState(): SimState {
  return {
    tick: 0,
    puck: { pos: { x: TABLE_W / 2, y: TABLE_H / 2 }, vel: { x: 0, y: 0 } },
    paddles: [
      { pos: { x: TABLE_W / 2, y: TABLE_H - 80 }, vel: { x: 0, y: 0 } },
      { pos: { x: TABLE_W / 2, y: 80 }, vel: { x: 0, y: 0 } },
    ],
    score: [0, 0],
    freeze: 0,
  }
}
