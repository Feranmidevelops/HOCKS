import { TABLE_H, TABLE_W } from '../sim/constants'
import type { InputFrame, Vec2 } from '../sim/types'

/** Where the "wall opponent" parks in Phase 0: in front of the top goal. */
const OPPONENT_PARK: Vec2 = { x: TABLE_W / 2, y: 80 }

/**
 * Track the pointer in table coordinates and expose a sampler the fixed-tick
 * loop calls once per tick. The sim owns all clamping; raw coords go in.
 */
export function createInput(canvas: HTMLCanvasElement): () => InputFrame {
  // Until the pointer moves, the paddle holds its starting spot.
  const target: Vec2 = { x: TABLE_W / 2, y: TABLE_H - 80 }

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect()
    target.x = ((e.clientX - rect.left) / rect.width) * TABLE_W
    target.y = ((e.clientY - rect.top) / rect.height) * TABLE_H
  })
  canvas.addEventListener('pointerdown', (e) => canvas.setPointerCapture(e.pointerId))

  return () => ({
    targets: [{ x: target.x, y: target.y }, { ...OPPONENT_PARK }],
  })
}
