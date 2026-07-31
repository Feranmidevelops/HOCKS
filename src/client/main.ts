import { TABLE_H, TABLE_W } from '../sim/constants'
import { createInput } from './input'
import { startLoop } from './loop'

const canvas = document.querySelector<HTMLCanvasElement>('#game')!

function fit() {
  const scale = Math.min(window.innerWidth / TABLE_W, window.innerHeight / TABLE_H) * 0.95
  const dpr = window.devicePixelRatio || 1
  canvas.style.width = `${TABLE_W * scale}px`
  canvas.style.height = `${TABLE_H * scale}px`
  canvas.width = Math.round(TABLE_W * scale * dpr)
  canvas.height = Math.round(TABLE_H * scale * dpr)
}
fit()
window.addEventListener('resize', fit)

startLoop(canvas, createInput(canvas))
