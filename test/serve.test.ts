import { describe, expect, it } from 'vitest'
import {
  FREEZE_TICKS,
  PADDLE_R,
  PUCK_R,
  SERVE_DEPTH,
  STALL_TICKS,
  TABLE_H,
  TABLE_W,
} from '../src/sim/constants'
import { step } from '../src/sim/step'
import { createInitialState, type InputFrame, type Vec2 } from '../src/sim/types'

const PARK0: Vec2 = { x: TABLE_W - PADDLE_R, y: TABLE_H - PADDLE_R }
const PARK1: Vec2 = { x: TABLE_W - PADDLE_R, y: PADDLE_R }
const INPUT: InputFrame = { targets: [PARK0, PARK1] }

function parked() {
  const s = createInitialState()
  s.paddles[0].pos = { ...PARK0 }
  s.paddles[1].pos = { ...PARK1 }
  return s
}

describe('the loser serves', () => {
  it('a goal by player 1 serves in player 0 half, out of the scorer reach', () => {
    let s = parked()
    s.puck.pos = { x: TABLE_W / 2, y: TABLE_H - 120 }
    s.puck.vel = { x: 0, y: 800 } // into the bottom goal: player 1 scores
    for (let i = 0; i < 30; i++) s = step(s, INPUT)
    expect(s.score).toStrictEqual([0, 1])

    const serveY = TABLE_H * (1 - SERVE_DEPTH)
    expect(s.puck.pos).toStrictEqual({ x: TABLE_W / 2, y: serveY })
    // Geometry makes the rule: the scorer's deepest reach cannot touch it.
    const scorerReach = TABLE_H / 2 - PADDLE_R + (PADDLE_R + PUCK_R)
    expect(serveY - PUCK_R).toBeGreaterThan(scorerReach)
  })

  it('an ignored serve drifts back to centre after the stall window', () => {
    let s = parked()
    s.puck.pos = { x: TABLE_W / 2, y: TABLE_H * SERVE_DEPTH } // player 1 serve
    s.puck.vel = { x: 0, y: 0 }

    // Within the window: the serve stays exactly where it was placed.
    for (let i = 0; i < STALL_TICKS; i++) s = step(s, INPUT)
    expect(s.puck.pos.y).toBe(TABLE_H * SERVE_DEPTH)

    // Past it: the anti-stall drift releases the puck toward centre.
    for (let i = 0; i < 120; i++) s = step(s, INPUT)
    expect(s.puck.pos.y).toBeGreaterThan(TABLE_H * SERVE_DEPTH)
    expect(Math.abs(s.puck.pos.x - TABLE_W / 2)).toBeLessThan(1)
  })

  it('freeze covers the goal pause, then the serve sits untouched', () => {
    let s = parked()
    s.puck.pos = { x: TABLE_W / 2, y: 120 }
    s.puck.vel = { x: 0, y: -900 } // player 0 scores
    for (let i = 0; i < 10 + FREEZE_TICKS; i++) s = step(s, INPUT)
    expect(s.freeze).toBe(0)
    expect(s.puck.vel).toStrictEqual({ x: 0, y: 0 })
    expect(s.puck.pos.y).toBe(TABLE_H * SERVE_DEPTH)
  })
})
