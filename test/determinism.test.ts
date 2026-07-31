import { describe, expect, it } from 'vitest'
import { TABLE_H, TABLE_W } from '../src/sim/constants'
import { hashState } from '../src/sim/hash'
import { step } from '../src/sim/step'
import { createInitialState, type InputFrame, type SimState } from '../src/sim/types'

const TICKS = 3600 // one minute of play

/** Deterministic PRNG (mulberry32) so the "recorded" input script is stable. */
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A scripted minute of play. The first second drives the player's paddle
 * straight into the resting puck so contact is guaranteed; after that both
 * paddles dart to pseudo-random spots in their halves.
 */
function recordInputScript(): InputFrame[] {
  const rand = mulberry32(0x48434b53) // "HCKS"
  const frames: InputFrame[] = []
  let t0 = { x: TABLE_W / 2, y: TABLE_H / 2 }
  let t1 = { x: TABLE_W / 2, y: 80 }
  for (let i = 0; i < TICKS; i++) {
    if (i >= 60 && i % 12 === 0) {
      t0 = { x: rand() * TABLE_W, y: TABLE_H / 2 + rand() * (TABLE_H / 2) }
    }
    if (i >= 60 && i % 17 === 0) {
      t1 = { x: rand() * TABLE_W, y: rand() * (TABLE_H / 2) }
    }
    frames.push({ targets: [{ ...t0 }, { ...t1 }] })
  }
  return frames
}

function deepFreeze<T>(obj: T): T {
  Object.freeze(obj)
  for (const value of Object.values(obj as object)) {
    if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
      deepFreeze(value)
    }
  }
  return obj
}

/** Run the whole script, hashing every 60th state to localize divergence. */
function run(script: InputFrame[], freezeStates: boolean): { hashes: string[]; final: SimState } {
  let state = createInitialState()
  const hashes: string[] = []
  for (let i = 0; i < script.length; i++) {
    if (freezeStates) deepFreeze(state)
    state = step(state, script[i])
    if ((i + 1) % 60 === 0) hashes.push(hashState(state))
  }
  return { hashes, final: state }
}

describe('determinism', () => {
  const script = recordInputScript()

  it('two runs over the same input script produce identical state hashes', () => {
    const a = run(script, false)
    const b = run(script, false)
    expect(a.hashes.length).toBe(TICKS / 60)
    expect(b.hashes).toStrictEqual(a.hashes)
  })

  it('the scripted play actually plays (puck gets struck)', () => {
    const { final } = run(script, false)
    expect(final.tick).toBe(TICKS)
    const scoreSum = final.score[0] + final.score[1]
    const puckMoved =
      final.puck.pos.x !== TABLE_W / 2 ||
      final.puck.pos.y !== TABLE_H / 2 ||
      final.puck.vel.x !== 0 ||
      final.puck.vel.y !== 0
    expect(scoreSum > 0 || puckMoved).toBe(true)
  })

  it('step() never mutates its input state or input frame', () => {
    // Frozen objects throw on write under strict mode (ES modules), so a run
    // over fully frozen states completing at all proves purity — and it must
    // also match the unfrozen run bit for bit.
    const frozenScript = script.map((f) => deepFreeze(structuredClone(f)))
    const a = run(script, false)
    const b = run(frozenScript, true)
    expect(b.hashes).toStrictEqual(a.hashes)
  })
})
