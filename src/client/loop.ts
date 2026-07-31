import { DT, TABLE_H, TABLE_W } from '../sim/constants'
import { step } from '../sim/step'
import { createInitialState, type InputFrame, type SimState } from '../sim/types'
import { render } from './render'

// Clamp long gaps (hidden tab, debugger pause) so we don't spiral trying to
// catch up hundreds of ticks in one frame.
const MAX_FRAME_MS = 250

/**
 * Fixed-timestep loop: the sim advances only in whole DT ticks via an
 * accumulator; rendering happens every animation frame, interpolating
 * between the two most recent states by the accumulator remainder.
 */
export function startLoop(canvas: HTMLCanvasElement, sampleInput: () => InputFrame): void {
  const ctx = canvas.getContext('2d')!
  let prev: SimState = createInitialState()
  let curr: SimState = prev
  let acc = 0
  let last = performance.now()
  const stepMs = DT * 1000

  const frame = (now: number) => {
    acc += Math.min(now - last, MAX_FRAME_MS)
    last = now

    while (acc >= stepMs) {
      prev = curr
      curr = step(curr, sampleInput())
      acc -= stepMs
    }

    ctx.setTransform(canvas.width / TABLE_W, 0, 0, canvas.height / TABLE_H, 0, 0)
    render(ctx, prev, curr, acc / stepMs)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
