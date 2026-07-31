import { TABLE_H, TABLE_W } from '../sim/constants'
import type { Vec2 } from '../sim/types'

/**
 * Track the pointer in view coordinates (table units, own goal at the
 * bottom). The caller maps view → table space per player and decides when
 * to sample; the sim owns all clamping.
 */
export function trackPointer(canvas: HTMLCanvasElement): () => Vec2 {
  // Until the pointer moves, the paddle holds its starting spot.
  const p: Vec2 = { x: TABLE_W / 2, y: TABLE_H - 80 }

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect()
    p.x = ((e.clientX - rect.left) / rect.width) * TABLE_W
    p.y = ((e.clientY - rect.top) / rect.height) * TABLE_H
  })
  canvas.addEventListener('pointerdown', (e) => canvas.setPointerCapture(e.pointerId))

  return () => ({ x: p.x, y: p.y })
}
