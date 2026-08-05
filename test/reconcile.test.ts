import { describe, expect, it } from 'vitest'
import { DT, PUCK_MAX_SPEED, TABLE_H, TABLE_W } from '../src/sim/constants'
import { Reconciler } from '../src/client/reconcile'
import { step } from '../src/sim/step'
import { createInitialState, type Vec2 } from '../src/sim/types'

const TICK_MS = DT * 1000
// Slack per advance keeps float residue from starving a tick (see predict tests).
const TICK = TICK_MS + 0.01

describe('reconciliation', () => {
  it('generates one sequenced input per local tick and prunes acked ones', () => {
    const r = new Reconciler(0)
    const target: Vec2 = { x: 200, y: 700 }
    let now = 1000
    r.advance(now, target) // clock init, zero ticks
    let sent = 0
    for (let i = 0; i < 5; i++) {
      now += TICK
      sent += r.advance(now, target).length
    }
    expect(sent).toBe(5)
    expect(r.pendingCount()).toBe(5)
    expect(r.view()).toBeNull() // no authoritative state yet — nothing to predict from

    r.onSnapshot(createInitialState(), 3)
    expect(r.pendingCount()).toBe(2)
    expect(r.view()).not.toBeNull()
  })

  it('resimulates unacked inputs on top of the server state, bit-for-bit', () => {
    const server = createInitialState()
    server.tick = 100
    server.puck.vel = { x: 300, y: -200 }

    const t4: Vec2 = { x: 150, y: 650 }
    const t5: Vec2 = { x: 300, y: 550 }

    const r = new Reconciler(0)
    let now = 2000
    r.advance(now, t4)
    now += TICK
    r.advance(now, t4) // seq 1
    now += TICK
    r.advance(now, t5) // seq 2
    r.onSnapshot(server, 0) // nothing acked: both inputs resimulate

    // Reference: the same two ticks by hand, opponent frozen at server pos.
    const opp = { ...server.paddles[1].pos }
    let ref = step(server, { targets: [t4, opp] })
    ref = step(ref, { targets: [t5, opp] })

    expect(r.view()).toStrictEqual({ ...ref })
  })

  it('adopts an authoritative correction the local prediction never saw', () => {
    const r = new Reconciler(0)
    let now = 3000
    r.advance(now, { x: 100, y: 750 })
    r.onSnapshot(createInitialState(), 0) // puck at rest at centre
    now += TICK
    r.advance(now, { x: 100, y: 750 }) // paddle far away: prediction keeps puck at rest
    const before = r.view()!
    expect(before.puck.vel).toStrictEqual({ x: 0, y: 0 })

    // Server disagrees: the opponent struck the puck a snapshot ago.
    const struck = createInitialState()
    struck.tick = 2
    struck.puck.pos = { x: TABLE_W / 2 + 40, y: TABLE_H / 2 - 60 }
    struck.puck.vel = { x: 250, y: 900 }
    r.onSnapshot(struck, 1)

    const after = r.view()!
    const speed = Math.hypot(after.puck.vel.x, after.puck.vel.y)
    expect(speed).toBeGreaterThan(0)
    expect(speed).toBeLessThanOrEqual(PUCK_MAX_SPEED)
    // The correction is a jump — Phase 4 renders it raw, Phase 5 smooths it.
    expect(after.puck.pos).not.toStrictEqual(before.puck.pos)
  })
})
