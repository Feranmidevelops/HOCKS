import { GOAL_W, PADDLE_R, PUCK_R, TABLE_H, TABLE_W } from '../sim/constants'
import type { Body, SimState, Vec2 } from '../sim/types'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpVec = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
})

const MOUTH_L = (TABLE_W - GOAL_W) / 2
const MOUTH_R = (TABLE_W + GOAL_W) / 2

const BLUE = { hi: '#7cb1ff', mid: '#3570e6', rim: '#1b3f8f', glow: '#5b9aff' }
const RED = { hi: '#ffa38c', mid: '#ea5433', rim: '#8f2312', glow: '#ff7a5c' }

// ---------------------------------------------------------------------------
// Static table layer, pre-rendered once per canvas size and blitted per frame
// — hundreds of air holes and glow strokes are too dear to redraw at 60fps.
// ---------------------------------------------------------------------------
let cache: HTMLCanvasElement | null = null
let cacheKey = ''

function tableLayer(pxW: number, pxH: number): HTMLCanvasElement {
  const key = `${pxW}x${pxH}`
  if (cache !== null && cacheKey === key) return cache
  const layer = document.createElement('canvas')
  layer.width = pxW
  layer.height = pxH
  const g = layer.getContext('2d')!
  g.setTransform(pxW / TABLE_W, 0, 0, pxH / TABLE_H, 0, 0)

  // Playfield: lit from the centre, vignetted toward the rails.
  const surf = g.createRadialGradient(
    TABLE_W / 2, TABLE_H / 2, 60,
    TABLE_W / 2, TABLE_H / 2, TABLE_H * 0.72,
  )
  surf.addColorStop(0, '#2e74e0')
  surf.addColorStop(0.55, '#1d4da6')
  surf.addColorStop(1, '#0e2a60')
  g.fillStyle = surf
  g.fillRect(0, 0, TABLE_W, TABLE_H)

  // Air holes — the thing that makes it read as an air hockey table.
  g.fillStyle = 'rgba(255, 255, 255, 0.08)'
  for (let y = 34; y < TABLE_H - 20; y += 28) {
    for (let x = 34; x < TABLE_W - 20; x += 28) {
      g.beginPath()
      g.arc(x, y, 1.7, 0, Math.PI * 2)
      g.fill()
    }
  }

  // Markings, glowing.
  g.shadowColor = '#7fd4ff'
  g.shadowBlur = 14
  g.strokeStyle = 'rgba(185, 226, 255, 0.85)'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(12, TABLE_H / 2)
  g.lineTo(TABLE_W - 12, TABLE_H / 2)
  g.stroke()
  g.beginPath()
  g.arc(TABLE_W / 2, TABLE_H / 2, 62, 0, Math.PI * 2)
  g.stroke()
  g.beginPath()
  g.arc(TABLE_W / 2, TABLE_H / 2, 7, 0, Math.PI * 2)
  g.fillStyle = 'rgba(185, 226, 255, 0.85)'
  g.fill()

  // Goal creases in the defenders' colours.
  g.strokeStyle = 'rgba(255, 163, 140, 0.75)'
  g.shadowColor = RED.glow
  g.beginPath()
  g.arc(TABLE_W / 2, 6, 112, 0.08 * Math.PI, 0.92 * Math.PI)
  g.stroke()
  g.strokeStyle = 'rgba(124, 177, 255, 0.75)'
  g.shadowColor = BLUE.glow
  g.beginPath()
  g.arc(TABLE_W / 2, TABLE_H - 6, 112, 1.08 * Math.PI, 1.92 * Math.PI)
  g.stroke()
  g.shadowBlur = 0

  // Soft light spilling out of each goal mouth.
  const mouthGlow = (cy: number, color: string) => {
    const glow = g.createRadialGradient(TABLE_W / 2, cy, 8, TABLE_W / 2, cy, 120)
    glow.addColorStop(0, color)
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = glow
    g.fillRect(MOUTH_L - 40, cy - 120, GOAL_W + 80, 240)
  }
  mouthGlow(0, 'rgba(255, 122, 92, 0.28)')
  mouthGlow(TABLE_H, 'rgba(91, 154, 255, 0.28)')

  // Rails: dark base with a lit inner edge, split around the mouths.
  const rail = (x1: number, y1: number, x2: number, y2: number) => {
    g.strokeStyle = '#0a1229'
    g.lineWidth = 12
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(x1, y1)
    g.lineTo(x2, y2)
    g.stroke()
    g.strokeStyle = 'rgba(130, 190, 255, 0.45)'
    g.lineWidth = 2.5
    g.beginPath()
    g.moveTo(x1, y1)
    g.lineTo(x2, y2)
    g.stroke()
  }
  rail(6, 4, 6, TABLE_H - 4)
  rail(TABLE_W - 6, 4, TABLE_W - 6, TABLE_H - 4)
  rail(4, 6, MOUTH_L, 6)
  rail(MOUTH_R, 6, TABLE_W - 4, 6)
  rail(4, TABLE_H - 6, MOUTH_L, TABLE_H - 6)
  rail(MOUTH_R, TABLE_H - 6, TABLE_W - 4, TABLE_H - 6)

  // The mouths themselves: hot thresholds.
  const mouth = (cy: number, color: string) => {
    g.shadowColor = color
    g.shadowBlur = 16
    g.strokeStyle = '#fff6ee'
    g.lineWidth = 3.5
    g.beginPath()
    g.moveTo(MOUTH_L + 4, cy)
    g.lineTo(MOUTH_R - 4, cy)
    g.stroke()
    g.shadowBlur = 0
  }
  mouth(6, RED.glow)
  mouth(TABLE_H - 6, BLUE.glow)

  cache = layer
  cacheKey = key
  return layer
}

// ---------------------------------------------------------------------------
// Entities: solid, lit from the upper-left, grounded by shadows.
// ---------------------------------------------------------------------------

function shadow(g: CanvasRenderingContext2D, p: Vec2, r: number): void {
  g.beginPath()
  g.ellipse(p.x + 3, p.y + 6, r * 1.02, r * 0.82, 0, 0, Math.PI * 2)
  g.fillStyle = 'rgba(3, 10, 28, 0.45)'
  g.fill()
}

function mallet(g: CanvasRenderingContext2D, p: Vec2, c: typeof BLUE): void {
  shadow(g, p, PADDLE_R)
  const base = g.createRadialGradient(
    p.x - PADDLE_R * 0.35, p.y - PADDLE_R * 0.4, PADDLE_R * 0.15,
    p.x, p.y, PADDLE_R,
  )
  base.addColorStop(0, c.hi)
  base.addColorStop(0.6, c.mid)
  base.addColorStop(1, c.rim)
  g.beginPath()
  g.arc(p.x, p.y, PADDLE_R, 0, Math.PI * 2)
  g.fillStyle = base
  g.fill()
  g.lineWidth = 2.5
  g.strokeStyle = c.rim
  g.stroke()

  // The knob.
  const knobR = PADDLE_R * 0.48
  const knob = g.createRadialGradient(
    p.x - knobR * 0.4, p.y - knobR * 0.5, knobR * 0.15,
    p.x, p.y, knobR,
  )
  knob.addColorStop(0, '#ffffff')
  knob.addColorStop(0.35, c.hi)
  knob.addColorStop(1, c.mid)
  g.beginPath()
  g.arc(p.x, p.y, knobR, 0, Math.PI * 2)
  g.fillStyle = knob
  g.fill()
  g.strokeStyle = c.rim
  g.lineWidth = 1.5
  g.stroke()
}

function puck(g: CanvasRenderingContext2D, b: Body, alphaPos: Vec2): void {
  const speed = Math.hypot(b.vel.x, b.vel.y)
  shadow(g, alphaPos, PUCK_R)
  if (speed > 250) {
    g.shadowColor = '#ffc14d'
    g.shadowBlur = Math.min(26, 8 + speed / 90)
  }
  const body = g.createRadialGradient(
    alphaPos.x - PUCK_R * 0.4, alphaPos.y - PUCK_R * 0.45, PUCK_R * 0.1,
    alphaPos.x, alphaPos.y, PUCK_R,
  )
  body.addColorStop(0, '#ffe08a')
  body.addColorStop(0.45, '#ffb02e')
  body.addColorStop(1, '#c56a00')
  g.beginPath()
  g.arc(alphaPos.x, alphaPos.y, PUCK_R, 0, Math.PI * 2)
  g.fillStyle = body
  g.fill()
  g.shadowBlur = 0
  g.lineWidth = 2
  g.strokeStyle = '#8a4a00'
  g.stroke()
  g.beginPath()
  g.arc(alphaPos.x, alphaPos.y, PUCK_R * 0.55, 0, Math.PI * 2)
  g.strokeStyle = 'rgba(255, 246, 220, 0.5)'
  g.lineWidth = 1.5
  g.stroke()
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
  ctx.drawImage(tableLayer(ctx.canvas.width, ctx.canvas.height), 0, 0, TABLE_W, TABLE_H)

  // Score, under the pieces.
  ctx.textAlign = 'center'
  ctx.font = 'bold 34px system-ui, sans-serif'
  ctx.shadowColor = 'rgba(127, 212, 255, 0.8)'
  ctx.shadowBlur = 10
  ctx.fillStyle = 'rgba(235, 245, 255, 0.92)'
  ctx.fillText(String(curr.score[1]), TABLE_W / 2, TABLE_H / 2 - 84)
  ctx.fillText(String(curr.score[0]), TABLE_W / 2, TABLE_H / 2 + 108)
  ctx.shadowBlur = 0

  mallet(ctx, lerpVec(prev.paddles[1].pos, curr.paddles[1].pos, alpha), RED)
  mallet(ctx, lerpVec(prev.paddles[0].pos, curr.paddles[0].pos, alpha), BLUE)
  puck(ctx, curr.puck, lerpVec(prev.puck.pos, curr.puck.pos, alpha))

  if (curr.freeze > 0) {
    ctx.font = 'bold 54px system-ui, sans-serif'
    ctx.shadowColor = '#ffc14d'
    ctx.shadowBlur = 22
    ctx.fillStyle = '#fff3d6'
    ctx.fillText('GOAL!', TABLE_W / 2, TABLE_H / 2 - 150)
    ctx.shadowBlur = 0
  }
}
