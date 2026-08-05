import { describe, expect, it } from 'vitest'
import { DT, PADDLE_MAX_SPEED, PADDLE_R, TABLE_H, TABLE_W } from '../src/sim/constants'
import { OwnPaddlePredictor } from '../src/client/predict'
import { step } from '../src/sim/step'
import { createInitialState, type InputFrame, type Vec2 } from '../src/sim/types'

const TICK_MS = DT * 1000
const PARK: Vec2 = { x: TABLE_W - PADDLE_R, y: PADDLE_R }

describe('own-paddle prediction', () => {
  it('matches the authoritative sim bit-for-bit over a target script', () => {
    // Three targets, three ticks each — the prediction is the server code,
    // so the trajectories must be identical down to the float bits.
    const targets: Vec2[] = [
      { x: 100, y: 700 },
      { x: 380, y: 500 },
      { x: 225, y: 780 },
    ]

    let ref = createInitialState()
    const pred = new OwnPaddlePredictor(0)
    let now = 1000
    pred.advance(now, targets[0]) // initializes the clock, runs zero ticks

    for (const target of targets) {
      const input: InputFrame = { targets: [target, PARK] }
      for (let i = 0; i < 3; i++) {
        ref = step(ref, input)
        // Tiny slack keeps float residue in the accumulator from starving a
        // tick across a target change, which would misalign the two runs.
        now += TICK_MS + 0.01
        pred.advance(now, target)
      }
    }

    expect(pred.current()).toStrictEqual(ref.paddles[0])
  })

  it('interpolates the view between local ticks', () => {
    const pred = new OwnPaddlePredictor(0)
    const start = pred.current().pos
    const target: Vec2 = { x: start.x, y: start.y - 200 }
    pred.advance(2000, target)
    pred.advance(2000 + 1.5 * TICK_MS, target) // one whole tick + half a tick over

    const afterOneTick = pred.current().pos
    const v = pred.view().pos
    expect(v.y).toBeCloseTo((start.y + afterOneTick.y) / 2, 6)
    // One tick toward the target at max speed: moved PADDLE_MAX_SPEED * DT.
    expect(start.y - afterOneTick.y).toBeCloseTo(PADDLE_MAX_SPEED * DT, 6)
  })

  it('clamps to the player half exactly like the server', () => {
    const pred = new OwnPaddlePredictor(0)
    // Demand a position deep in the opponent half; the sim clamp must win.
    let now = 3000
    for (let i = 0; i < 120; i++) {
      now += TICK_MS
      pred.advance(now, { x: TABLE_W / 2, y: 0 })
    }
    expect(pred.current().pos.y).toBe(TABLE_H / 2 + PADDLE_R)
  })
})
