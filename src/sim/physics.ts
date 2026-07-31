import {
  GOAL_W,
  PADDLE_MAX_SPEED,
  PADDLE_R,
  PADDLE_RESTITUTION,
  PUCK_R,
  TABLE_H,
  TABLE_W,
  WALL_RESTITUTION,
} from './constants'
import type { Body, Vec2 } from './types'

// The goal mouth, shrunk by the puck radius: the puck only fits through the
// hole if its centre crosses inside this range.
export const MOUTH_LEFT = (TABLE_W - GOAL_W) / 2 + PUCK_R
export const MOUTH_RIGHT = (TABLE_W + GOAL_W) / 2 - PUCK_R

// A puck can't physically hit more walls than this in one substep; the bound
// keeps the sweep loop finite no matter what.
const MAX_BOUNCES = 8

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

export interface SweepResult {
  pos: Vec2
  vel: Vec2
}

/**
 * Advance the puck by `dt` with swept (continuous) wall collision: solve the
 * exact time of impact against each wall plane, advance to it, reflect, and
 * spend the remaining time — so a fast puck can never tunnel through a wall.
 * Crossing a wall plane inside the goal mouth passes through instead of
 * reflecting; the goal-line check lives in step().
 */
export function sweepPuck(startPos: Vec2, startVel: Vec2, dt: number): SweepResult {
  const pos = { x: startPos.x, y: startPos.y }
  const vel = { x: startVel.x, y: startVel.y }
  let remaining = dt

  for (let bounce = 0; bounce < MAX_BOUNCES && remaining > 0; bounce++) {
    let tHit = remaining
    let hitAxis: 'x' | 'y' | null = null
    let hitPlane = 0

    const candidates = [
      { axis: 'x' as const, at: PUCK_R, approaching: vel.x < 0 && pos.x > PUCK_R },
      { axis: 'x' as const, at: TABLE_W - PUCK_R, approaching: vel.x > 0 && pos.x < TABLE_W - PUCK_R },
      { axis: 'y' as const, at: PUCK_R, approaching: vel.y < 0 && pos.y > PUCK_R },
      { axis: 'y' as const, at: TABLE_H - PUCK_R, approaching: vel.y > 0 && pos.y < TABLE_H - PUCK_R },
    ]
    for (const c of candidates) {
      if (!c.approaching) continue
      const t = c.axis === 'x' ? (c.at - pos.x) / vel.x : (c.at - pos.y) / vel.y
      if (t >= 0 && t < tHit) {
        tHit = t
        hitAxis = c.axis
        hitPlane = c.at
      }
    }

    pos.x += vel.x * tHit
    pos.y += vel.y * tHit
    remaining -= tHit
    if (hitAxis === null) break

    if (hitAxis === 'y' && pos.x >= MOUTH_LEFT && pos.x <= MOUTH_RIGHT) {
      // Inside the goal mouth: there is no wall here. Nudge just past the
      // plane so float noise can't re-detect it, and keep flying.
      pos.y = hitPlane === PUCK_R ? PUCK_R - 1e-7 : TABLE_H - PUCK_R + 1e-7
      continue
    }

    // Snap onto the plane and reflect the normal component.
    if (hitAxis === 'x') {
      pos.x = hitPlane
      vel.x = -vel.x * WALL_RESTITUTION
    } else {
      pos.y = hitPlane
      vel.y = -vel.y * WALL_RESTITUTION
    }
  }

  return { pos, vel }
}

/**
 * Resolve paddle-puck contact in place. The paddle is kinematic (infinite
 * mass): the puck is pushed to the paddle's surface and its velocity is
 * reflected in the paddle's frame — which is what carries the paddle's own
 * velocity into the hit. Returns true if contact was resolved.
 */
export function collidePaddlePuck(puck: Body, paddle: Body): boolean {
  const dx = puck.pos.x - paddle.pos.x
  const dy = puck.pos.y - paddle.pos.y
  const minDist = PUCK_R + PADDLE_R
  const d2 = dx * dx + dy * dy
  if (d2 >= minDist * minDist) return false

  const dist = Math.sqrt(d2)
  // Deterministic fallback normal for the degenerate exactly-centred overlap.
  const nx = dist > 1e-9 ? dx / dist : 0
  const ny = dist > 1e-9 ? dy / dist : -1

  puck.pos.x = paddle.pos.x + nx * minDist
  puck.pos.y = paddle.pos.y + ny * minDist

  const rvx = puck.vel.x - paddle.vel.x
  const rvy = puck.vel.y - paddle.vel.y
  const vn = rvx * nx + rvy * ny
  if (vn < 0) {
    const j = -(1 + PADDLE_RESTITUTION) * vn
    puck.vel.x += j * nx
    puck.vel.y += j * ny
  }
  return true
}

/**
 * A paddle shoving the puck can leave it overlapping a wall, where the sweep
 * (which only sees approaching planes) would let it escape. Clamp it back
 * inside and reflect the outward velocity — except through the goal mouth,
 * which is a real hole.
 */
export function clampPuckToTable(puck: Body): void {
  if (puck.pos.x < PUCK_R) {
    puck.pos.x = PUCK_R
    if (puck.vel.x < 0) puck.vel.x = -puck.vel.x * WALL_RESTITUTION
  } else if (puck.pos.x > TABLE_W - PUCK_R) {
    puck.pos.x = TABLE_W - PUCK_R
    if (puck.vel.x > 0) puck.vel.x = -puck.vel.x * WALL_RESTITUTION
  }

  const inMouth = puck.pos.x >= MOUTH_LEFT && puck.pos.x <= MOUTH_RIGHT
  if (inMouth) return
  if (puck.pos.y < PUCK_R) {
    puck.pos.y = PUCK_R
    if (puck.vel.y < 0) puck.vel.y = -puck.vel.y * WALL_RESTITUTION
  } else if (puck.pos.y > TABLE_H - PUCK_R) {
    puck.pos.y = TABLE_H - PUCK_R
    if (puck.vel.y > 0) puck.vel.y = -puck.vel.y * WALL_RESTITUTION
  }
}

/**
 * Move a paddle toward its target at up to PADDLE_MAX_SPEED, clamped to the
 * player's half. Velocity is derived from actual displacement so collision
 * response sees how fast the paddle was really moving.
 */
export function movePaddle(paddle: Body, target: Vec2, dt: number, player: 0 | 1): void {
  const minY = player === 0 ? TABLE_H / 2 + PADDLE_R : PADDLE_R
  const maxY = player === 0 ? TABLE_H - PADDLE_R : TABLE_H / 2 - PADDLE_R
  const tx = clamp(target.x, PADDLE_R, TABLE_W - PADDLE_R)
  const ty = clamp(target.y, minY, maxY)

  const dx = tx - paddle.pos.x
  const dy = ty - paddle.pos.y
  const dist = Math.hypot(dx, dy)
  const maxMove = PADDLE_MAX_SPEED * dt

  let nx = tx
  let ny = ty
  if (dist > maxMove) {
    nx = paddle.pos.x + (dx / dist) * maxMove
    ny = paddle.pos.y + (dy / dist) * maxMove
  }
  paddle.vel.x = (nx - paddle.pos.x) / dt
  paddle.vel.y = (ny - paddle.pos.y) / dt
  paddle.pos.x = nx
  paddle.pos.y = ny
}
