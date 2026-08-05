import { describe, expect, it } from 'vitest'
import { ErrorSmoother, SNAP_AT } from '../src/client/smooth'

const FRAME = 16.67

function run(s: ErrorSmoother, ms: number): void {
  for (let t = 0; t < ms; t += FRAME) s.advance(FRAME)
}

describe('error smoothing', () => {
  it('eases a small correction to nothing within the 100-200ms window', () => {
    const s = new ErrorSmoother()
    s.addCorrection({ x: 60, y: 0 }, { x: 100, y: 0 })
    expect(s.magnitude()).toBeCloseTo(60, 6)

    run(s, 100)
    expect(s.magnitude()).toBeLessThan(30) // mostly gone already
    run(s, 300)
    expect(s.magnitude()).toBe(0) // fully released
  })

  it('snaps instead of easing when the error is too large to be honest', () => {
    const s = new ErrorSmoother()
    s.addCorrection({ x: SNAP_AT + 30, y: 0 }, { x: 0, y: 0 })
    expect(s.magnitude()).toBe(0)
  })

  it('stacks overlapping corrections', () => {
    const s = new ErrorSmoother()
    s.addCorrection({ x: 30, y: 0 }, { x: 0, y: 0 })
    s.addCorrection({ x: 0, y: 40 }, { x: 0, y: 0 })
    expect(s.magnitude()).toBeCloseTo(50, 6)
  })

  it('keeps ghost momentum: a velocity-only error bulges then returns to zero', () => {
    const s = new ErrorSmoother()
    s.addCorrection({ x: 0, y: 0 }, { x: 150, y: 0 })
    expect(s.magnitude()).toBe(0)

    s.advance(FRAME)
    const bulge = s.magnitude()
    expect(bulge).toBeGreaterThan(0.5) // old trajectory briefly persists
    run(s, 400)
    expect(s.magnitude()).toBe(0)
  })

  it('reset clears everything (epoch changes: goals, freezes)', () => {
    const s = new ErrorSmoother()
    s.addCorrection({ x: 50, y: 50 }, { x: 200, y: 0 })
    s.reset()
    s.advance(FRAME)
    expect(s.magnitude()).toBe(0)
  })
})
