import {
  DT,
  FREEZE_TICKS,
  FRICTION_RETAIN,
  MIN_LIVE_SPEED,
  PUCK_MAX_SPEED,
  PUCK_R,
  RESCUE_SPEED,
  SERVE_DEPTH,
  STALL_TICKS,
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
 *
 * `resolveGoals` (default true, what the server runs): a puck fully across
 * a goal line scores, freezes play, and resets to centre. With false — the
 * client's predicted timeline — goals are never resolved locally: the puck
 * coasts into the goal void and parks there until the server either
 * declares the goal (epoch snap to centre) or denies it (a save the client
 * hadn't seen yet arrives as a normal correction). The server owns goals.
 */
export function step(state: SimState, input: InputFrame, resolveGoals = true): SimState {
  const puck = cloneBody(state.puck)
  const paddles: [Body, Body] = [cloneBody(state.paddles[0]), cloneBody(state.paddles[1])]
  const score: [number, number] = [state.score[0], state.score[1]]
  let freeze = state.freeze
  let stalled = state.stalled
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
    if (puck.pos.y < -PUCK_R || puck.pos.y > TABLE_H + PUCK_R) {
      if (resolveGoals) {
        scorer = puck.pos.y < 0 ? 0 : 1
        continue
      }
      // Unresolved: park in the goal void awaiting the server's word.
      const cap = 3 * PUCK_R
      if (puck.pos.y < -cap) {
        puck.pos.y = -cap
        puck.vel = { x: 0, y: 0 }
      } else if (puck.pos.y > TABLE_H + cap) {
        puck.pos.y = TABLE_H + cap
        puck.vel = { x: 0, y: 0 }
      }
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
    stalled = 0
    // Serve rule: the puck goes to the CONCEDER, deep enough in their half
    // that the scorer's clamp keeps them away — only the loser of the round
    // can strike first.
    const conceder = scorer === 0 ? 1 : 0
    puck.pos = {
      x: TABLE_W / 2,
      y: conceder === 1 ? TABLE_H * SERVE_DEPTH : TABLE_H * (1 - SERVE_DEPTH),
    }
    puck.vel = { x: 0, y: 0 }
  } else if (freeze > 0) {
    freeze--
    stalled = 0
  } else {
    // Anti-stall (see constants.ts): a puck at rest on the table — an
    // ignored serve, or dead in the solo wall-opponent's half — drifts back
    // toward centre after STALL_TICKS. Voided pucks stay in the goal mouth.
    const speed = Math.hypot(puck.vel.x, puck.vel.y)
    const onTable = puck.pos.y > PUCK_R && puck.pos.y < TABLE_H - PUCK_R
    stalled = speed < MIN_LIVE_SPEED && onTable ? stalled + 1 : 0
    if (stalled > STALL_TICKS) {
      const dx = TABLE_W / 2 - puck.pos.x
      const dy = TABLE_H / 2 - puck.pos.y
      const d = Math.hypot(dx, dy)
      if (d > 1e-6) {
        puck.vel.x = (dx / d) * RESCUE_SPEED
        puck.vel.y = (dy / d) * RESCUE_SPEED
      }
      stalled = 0
    }
  }

  return { tick: state.tick + 1, puck, paddles, score, freeze, stalled }
}
