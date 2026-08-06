import { describe, expect, it } from 'vitest'
import {
  DT,
  PADDLE_MAX_SPEED,
  PADDLE_R,
  PUCK_R,
  TABLE_H,
  TABLE_W,
  WALL_RESTITUTION,
} from '../src/sim/constants'
import { sweepPuck } from '../src/sim/physics'
import { step } from '../src/sim/step'
import { createInitialState, type InputFrame, type SimState, type Vec2 } from '../src/sim/types'

/** Park both paddles bottom-right / top-right, out of the puck's way. */
function parkedState(): { state: SimState; input: InputFrame } {
  const state = createInitialState()
  const park0: Vec2 = { x: TABLE_W - PADDLE_R, y: TABLE_H - PADDLE_R }
  const park1: Vec2 = { x: TABLE_W - PADDLE_R, y: TABLE_H / 2 - PADDLE_R }
  state.paddles[0].pos = { ...park0 }
  state.paddles[1].pos = { ...park1 }
  return { state, input: { targets: [{ ...park0 }, { ...park1 }] } }
}

describe('walls', () => {
  it('reflection preserves speed up to restitution', () => {
    // Heading into the left wall, hits exactly halfway through the interval.
    const r = sweepPuck({ x: PUCK_R + 5, y: 400 }, { x: -600, y: 120 }, DT)
    expect(r.vel.x).toBeCloseTo(600 * WALL_RESTITUTION, 6)
    expect(r.vel.y).toBeCloseTo(120, 6)
    expect(r.pos.x).toBeGreaterThanOrEqual(PUCK_R)
  })

  it('a fast puck never tunnels out of the table', () => {
    const { state: start, input } = parkedState()
    // Well above the in-game speed cap, aimed at a corner.
    start.puck.vel = { x: 4321, y: 5432 }
    let state = start
    for (let i = 0; i < 600; i++) {
      state = step(state, input)
      expect(state.puck.pos.x).toBeGreaterThanOrEqual(PUCK_R - 1e-6)
      expect(state.puck.pos.x).toBeLessThanOrEqual(TABLE_W - PUCK_R + 1e-6)
      // y may briefly exceed the walls only on the way through a goal mouth.
      expect(state.puck.pos.y).toBeGreaterThanOrEqual(-3 * PUCK_R)
      expect(state.puck.pos.y).toBeLessThanOrEqual(TABLE_H + 3 * PUCK_R)
    }
  })
})

describe('paddle-puck', () => {
  it('a moving paddle transfers its velocity into the puck', () => {
    const { state: start, input } = parkedState()
    start.puck.pos = { x: TABLE_W / 2, y: 560 }
    start.puck.vel = { x: 0, y: 0 }
    // Player paddle sits below the puck and drives straight through it.
    start.paddles[0].pos = { x: TABLE_W / 2, y: 560 + PUCK_R + PADDLE_R + 60 }
    const drive: InputFrame = {
      targets: [{ x: TABLE_W / 2, y: 460 }, { ...input.targets[1] }],
    }
    let state = start
    let maxSpeed = 0
    for (let i = 0; i < 30; i++) {
      state = step(state, drive)
      maxSpeed = Math.max(maxSpeed, Math.hypot(state.puck.vel.x, state.puck.vel.y))
    }
    // A dead hit would leave the puck at paddle speed or below; velocity
    // transfer through restitution must send it off faster than the paddle.
    expect(maxSpeed).toBeGreaterThanOrEqual(PADDLE_MAX_SPEED)
  })
})

describe('goals', () => {
  it('a puck through the mouth scores, freezes play, and serves to the conceder', () => {
    const { state: start, input } = parkedState()
    start.puck.pos = { x: TABLE_W / 2, y: 120 }
    start.puck.vel = { x: 0, y: -800 }
    let state = start
    for (let i = 0; i < 30; i++) state = step(state, input)
    expect(state.score[0]).toBe(1)
    expect(state.score[1]).toBe(0)
    expect(state.freeze).toBeGreaterThan(0)
    // Player 0 scored, so player 1 serves: puck deep in the top half.
    expect(state.puck.pos).toStrictEqual({ x: TABLE_W / 2, y: TABLE_H * 0.28 })
  })

  it('the same shot beside the mouth bounces instead', () => {
    const { state: start, input } = parkedState()
    start.puck.pos = { x: 30, y: 120 }
    start.puck.vel = { x: 0, y: -800 }
    let state = start
    let bounced = false
    for (let i = 0; i < 30; i++) {
      state = step(state, input)
      if (state.puck.vel.y > 0) bounced = true
    }
    expect(bounced).toBe(true)
    expect(state.score).toStrictEqual([0, 0])
  })
})
