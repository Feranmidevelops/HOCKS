import { describe, expect, it } from 'vitest'
import { GameDirector, PAUSE_TIMEOUT_MS } from '../src/server/director'

describe('game director', () => {
  it('runs solo for the first player, fresh versus when a challenger joins', () => {
    const d = new GameDirector()
    expect(d.join(0)).toStrictEqual({ changed: true, reset: true })
    expect(d.mode).toBe('solo')
    expect(d.shouldStep()).toBe(true)

    expect(d.join(1)).toStrictEqual({ changed: true, reset: true })
    expect(d.mode).toBe('versus')
  })

  it('pauses on mid-rally drop and resumes with state intact on reconnect', () => {
    const d = new GameDirector()
    d.join(0)
    d.join(1)
    const t = d.leave(1, 1000)
    expect(t.changed).toBe(true)
    expect(t.reset).toBe(false) // hold the rally
    expect(d.mode).toBe('paused')
    expect(d.shouldStep()).toBe(false)

    const back = d.join(1)
    expect(back).toStrictEqual({ changed: true, reset: false }) // no reset: mid-rally
    expect(d.mode).toBe('versus')
  })

  it('gives up on a paused opponent after the timeout', () => {
    const d = new GameDirector()
    d.join(0)
    d.join(1)
    d.leave(1, 1000)
    expect(d.poll(1000 + PAUSE_TIMEOUT_MS - 1)).toStrictEqual({ changed: false, reset: false })
    expect(d.poll(1000 + PAUSE_TIMEOUT_MS)).toStrictEqual({ changed: true, reset: true })
    expect(d.mode).toBe('solo')
  })

  it('declares the winner at the win score and stops the sim', () => {
    const d = new GameDirector(7)
    d.join(0)
    d.join(1)
    expect(d.afterStep([3, 2])).toStrictEqual({ changed: false, reset: false })
    const t = d.afterStep([7, 2])
    expect(t.changed).toBe(true)
    expect(d.mode).toBe('over')
    expect(d.winner).toBe(0)
    expect(d.shouldStep()).toBe(false)
  })

  it('rematch starts only when every seated player is ready', () => {
    const d = new GameDirector(1)
    d.join(0)
    d.join(1)
    d.afterStep([1, 0])
    expect(d.rematch(0)).toStrictEqual({ changed: false, reset: false })
    expect(d.mode).toBe('over')
    const t = d.rematch(1)
    expect(t).toStrictEqual({ changed: true, reset: true })
    expect(d.mode).toBe('versus')
    expect(d.winner).toBeNull()
  })

  it('a walkout during the endgame leaves a fresh solo game behind', () => {
    const d = new GameDirector(1)
    d.join(0)
    d.join(1)
    d.afterStep([0, 1])
    expect(d.leave(1, 5000)).toStrictEqual({ changed: true, reset: true })
    expect(d.mode).toBe('solo')

    // And the lone player can rematch a solo endgame by themselves.
    d.afterStep([1, 0])
    expect(d.mode).toBe('over')
    expect(d.rematch(0)).toStrictEqual({ changed: true, reset: true })
    expect(d.mode).toBe('solo')
  })

  it('everyone leaving returns to idle with a fresh game', () => {
    const d = new GameDirector()
    d.join(0)
    d.join(1)
    d.leave(0, 1000)
    expect(d.mode).toBe('paused')
    expect(d.leave(1, 2000)).toStrictEqual({ changed: true, reset: true })
    expect(d.mode).toBe('idle')
    expect(d.shouldStep()).toBe(false)
  })
})
