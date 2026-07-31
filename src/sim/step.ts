import {
  DT,
  FREEZE_TICKS,
  FRICTION_RETAIN,
  MIN_LIVE_SPEED,
  PUCK_MAX_SPEED,
  PUCK_R,
  RESCUE_SPEED,
  SUBSTEPS,
  TABLE_H,
  TABLE_W,
} from './constants'
import { clampPuckToTable, collidePaddlePuck, movePaddle, sweepPuck } from './physics'
import type { Body, InputFrame, SimState } from './types'

const cloneBody = (b: Body): Body => ({
  pos: { x: b.pos.x, y: b.pos.y },
  vel: { x: b.vel.x, y: b.vel.y },
})

/**
 * Advance the simulation by exactly one fixed tick. Pure: never mutates
 * `state` or `input`, reads no clocks, uses no randomness — the same
 * (state, input) always returns the same next state.
 */
export function step(state: SimState, input: InputFrame): SimState {
  const puck = cloneBody(state.puck)
  const paddles: [Body, Body] = [cloneBody(state.paddles[0]), cloneBody(state.paddles[1])]
  const score: [number, number] = [state.score[0], state.score[1]]
  let freeze = state.freeze
  let scorer: 0 | 1 | null = null

  const dtSub = DT / SUBSTEPS
  const frictionSub = Math.pow(FRICTION_RETAIN, dtSub)

  for (let s = 0; s < SUBSTEPS; s++) {
    movePaddle(paddles[0], input.targets[0], dtSub, 0)
    movePaddle(paddles[1], input.targets[1], dtSub, 1)

    // Between a goal and the next serve the puck is dead; paddles still move.
    if (freeze > 0 || scorer !== null) continue

    const swept = sweepPuck(puck.pos, puck.vel, dtSub)
    puck.pos = swept.pos
    puck.vel = swept.vel

    // Fully across a goal line = goal. The top hole is player 0's target.
    if (puck.pos.y < -PUCK_R) {
      scorer = 0
      continue
    }
    if (puck.pos.y > TABLE_H + PUCK_R) {
      scorer = 1
      continue
    }

    for (const paddle of paddles) {
      if (collidePaddlePuck(puck, paddle)) clampPuckToTable(puck)
    }

    puck.vel.x *= frictionSub
    puck.vel.y *= frictionSub
    const speed = Math.hypot(puck.vel.x, puck.vel.y)
    if (speed > PUCK_MAX_SPEED) {
      const k = PUCK_MAX_SPEED / speed
      puck.vel.x *= k
      puck.vel.y *= k
    }
  }

  if (scorer !== null) {
    score[scorer]++
    freeze = FREEZE_TICKS
    puck.pos = { x: TABLE_W / 2, y: TABLE_H / 2 }
    puck.vel = { x: 0, y: 0 }
  } else if (freeze > 0) {
    freeze--
  } else {
    // Phase 0 anti-soft-lock (see constants.ts): a stalled puck in the
    // unreachable far half drifts back toward the player's side.
    const speed = Math.hypot(puck.vel.x, puck.vel.y)
    if (speed < MIN_LIVE_SPEED && puck.pos.y < TABLE_H / 2 - PUCK_R) {
      const dx = TABLE_W / 2 - puck.pos.x
      const dy = TABLE_H * 0.75 - puck.pos.y
      const d = Math.hypot(dx, dy)
      puck.vel.x = (dx / d) * RESCUE_SPEED
      puck.vel.y = (dy / d) * RESCUE_SPEED
    }
  }

  return { tick: state.tick + 1, puck, paddles, score, freeze }
}
