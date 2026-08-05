import { describe, expect, it } from 'vitest'
import { DT, PADDLE_R, PUCK_R, TABLE_H, TABLE_W } from '../src/sim/constants'
import { Reconciler } from '../src/client/reconcile'
import { step } from '../src/sim/step'
import { createInitialState, type InputFrame, type Vec2 } from '../src/sim/types'

const TICK_MS = DT * 1000
const TICK = TICK_MS + 0.01
const PARK: Vec2 = { x: TABLE_W - PADDLE_R, y: TABLE_H - PADDLE_R }
const PARK_TOP: Vec2 = { x: TABLE_W - PADDLE_R, y: PADDLE_R }

describe('contested goals: the server owns them', () => {
  it('an unresolved goal voids the puck without scoring or resetting', () => {
    let s = createInitialState()
    s.paddles[0].pos = { ...PARK }
    s.paddles[1].pos = { ...PARK_TOP }
    s.puck.pos = { x: TABLE_W / 2, y: 120 }
    s.puck.vel = { x: 0, y: -900 }
    const input: InputFrame = { targets: [PARK, PARK_TOP] }

    for (let i = 0; i < 120; i++) s = step(s, input, false)

    expect(s.score).toStrictEqual([0, 0])
    expect(s.freeze).toBe(0)
    // Parked in the goal void, not rescued back onto the table.
    expect(s.puck.pos.y).toBe(-3 * PUCK_R)
    expect(s.puck.vel).toStrictEqual({ x: 0, y: 0 })
  })

  it('the predicted timeline never scores; the server word arrives as an epoch', () => {
    const r = new Reconciler(0)
    let now = 4000
    r.advance(now, PARK)
    const base = createInitialState()
    base.paddles[1].pos = { ...PARK_TOP } // goalie out of the shot's path
    base.puck.pos = { x: TABLE_W / 2, y: 100 }
    base.puck.vel = { x: 0, y: -1200 }
    r.onSnapshot(base, 0)

    // Predict half a second: locally the puck flies through the mouth.
    for (let i = 0; i < 30; i++) {
      now += TICK
      r.advance(now, PARK)
    }
    const predicted = r.view()!
    expect(predicted.score).toStrictEqual([0, 0]) // never predicted
    expect(predicted.puck.pos.y).toBeLessThan(0) // voided, awaiting the word

    // The server declares it: score, freeze, centre reset — an epoch change,
    // so the display snaps honestly with no lingering smoothing offset.
    const confirmed = createInitialState()
    confirmed.tick = 30
    confirmed.score = [1, 0]
    confirmed.freeze = 45
    r.onSnapshot(confirmed, 999)

    const after = r.view()!
    expect(after.score).toStrictEqual([1, 0])
    expect(after.puck.pos).toStrictEqual({ x: TABLE_W / 2, y: TABLE_H / 2 })
    expect(r.correctionError()).toBe(0)
  })
})
