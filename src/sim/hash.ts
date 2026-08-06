import type { SimState } from './types'

/**
 * FNV-1a over the exact float bits of every state field in a fixed order.
 * Two states hash equal iff they are bit-identical — precisely the property
 * the determinism test asserts.
 */
export function hashState(s: SimState): string {
  const fields = [
    s.tick,
    s.puck.pos.x,
    s.puck.pos.y,
    s.puck.vel.x,
    s.puck.vel.y,
    s.paddles[0].pos.x,
    s.paddles[0].pos.y,
    s.paddles[0].vel.x,
    s.paddles[0].vel.y,
    s.paddles[1].pos.x,
    s.paddles[1].pos.y,
    s.paddles[1].vel.x,
    s.paddles[1].vel.y,
    s.score[0],
    s.score[1],
    s.freeze,
    s.stalled,
  ]

  const view = new DataView(new ArrayBuffer(8))
  let h = 0x811c9dc5
  for (const n of fields) {
    view.setFloat64(0, n)
    for (let i = 0; i < 8; i++) {
      h ^= view.getUint8(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
  }
  return h.toString(16).padStart(8, '0')
}
