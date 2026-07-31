import { GOAL_W, PADDLE_R, PUCK_R, TABLE_H, TABLE_W } from '../sim/constants'
import type { SimState, Vec2 } from '../sim/types'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpVec = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
})

const WALL = '#2e3850'
const MOUTH_L = (TABLE_W - GOAL_W) / 2
const MOUTH_R = (TABLE_W + GOAL_W) / 2

function circle(ctx: CanvasRenderingContext2D, p: Vec2, r: number, fill: string) {
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
}

/**
 * Draw the interpolated view between the two most recent sim states.
 * Reads states only — no physics, no writes.
 */
export function render(
  ctx: CanvasRenderingContext2D,
  prev: SimState,
  curr: SimState,
  alpha: number,
): void {
  // Table
  ctx.fillStyle = '#141924'
  ctx.fillRect(0, 0, TABLE_W, TABLE_H)

  // Centre line + circle
  ctx.strokeStyle = '#232c40'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, TABLE_H / 2)
  ctx.lineTo(TABLE_W, TABLE_H / 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(TABLE_W / 2, TABLE_H / 2, 60, 0, Math.PI * 2)
  ctx.stroke()

  // Walls, with gaps for the goal mouths
  ctx.strokeStyle = WALL
  ctx.lineWidth = 8
  ctx.beginPath()
  // left + right
  ctx.moveTo(4, 0)
  ctx.lineTo(4, TABLE_H)
  ctx.moveTo(TABLE_W - 4, 0)
  ctx.lineTo(TABLE_W - 4, TABLE_H)
  // top, split around the mouth
  ctx.moveTo(0, 4)
  ctx.lineTo(MOUTH_L, 4)
  ctx.moveTo(MOUTH_R, 4)
  ctx.lineTo(TABLE_W, 4)
  // bottom, split around the mouth
  ctx.moveTo(0, TABLE_H - 4)
  ctx.lineTo(MOUTH_L, TABLE_H - 4)
  ctx.moveTo(MOUTH_R, TABLE_H - 4)
  ctx.lineTo(TABLE_W, TABLE_H - 4)
  ctx.stroke()

  // Goal mouths
  ctx.strokeStyle = '#4a5878'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(MOUTH_L, 4)
  ctx.lineTo(MOUTH_R, 4)
  ctx.moveTo(MOUTH_L, TABLE_H - 4)
  ctx.lineTo(MOUTH_R, TABLE_H - 4)
  ctx.stroke()

  // Bodies, interpolated
  circle(ctx, lerpVec(prev.paddles[1].pos, curr.paddles[1].pos, alpha), PADDLE_R, '#f7735f')
  circle(ctx, lerpVec(prev.paddles[0].pos, curr.paddles[0].pos, alpha), PADDLE_R, '#4f8ef7')
  circle(ctx, lerpVec(prev.puck.pos, curr.puck.pos, alpha), PUCK_R, '#e8e6e3')

  // Score: you (bottom) vs the wall (top)
  ctx.fillStyle = '#8b96ad'
  ctx.font = 'bold 28px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(String(curr.score[1]), TABLE_W / 2, TABLE_H / 2 - 78)
  ctx.fillText(String(curr.score[0]), TABLE_W / 2, TABLE_H / 2 + 98)

  if (curr.freeze > 0) {
    ctx.fillStyle = '#e8e6e3'
    ctx.font = 'bold 48px system-ui, sans-serif'
    ctx.fillText('GOAL!', TABLE_W / 2, TABLE_H / 2 - 140)
  }
}
