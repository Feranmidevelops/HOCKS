import { TABLE_H, TABLE_W, TICK_RATE } from '../sim/constants'
import type { NetSimConfig } from '../protocol'
import { trackPointer } from './input'
import { connect } from './net'
import { render } from './render'
import { toTableCoords, toViewState } from './view'

const canvas = document.querySelector<HTMLCanvasElement>('#game')!
const ctx = canvas.getContext('2d')!
const statusEl = document.querySelector<HTMLDivElement>('#status')!

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

const net = connect(`ws://${location.hostname}:8081`)
const pointer = trackPointer(canvas)

// Send the latest pointer target at tick rate. No sequence numbers yet —
// latest-wins is all Phase 1 needs (sequencing arrives with prediction).
setInterval(() => {
  const idx = net.playerIndex()
  if (idx !== null) net.send({ type: 'input', target: toTableCoords(pointer(), idx) })
}, 1000 / TICK_RATE)

// Phase 1 renders exactly what the server sends: the latest snapshot, drawn
// as-is. No local sim, no interpolation — the 20Hz stutter and the laggy
// own-paddle are the two problems the next phases fix, and they should be
// felt, not hidden.
function frame() {
  ctx.setTransform(canvas.width / TABLE_W, 0, 0, canvas.height / TABLE_H, 0, 0)
  const s = net.latest()
  const idx = net.playerIndex()
  if (s !== null && idx !== null) {
    const v = toViewState(s, idx)
    render(ctx, v, v, 0)
  } else {
    ctx.fillStyle = '#141924'
    ctx.fillRect(0, 0, TABLE_W, TABLE_H)
    ctx.fillStyle = '#8b96ad'
    ctx.font = 'bold 24px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('waiting for server…', TABLE_W / 2, TABLE_H / 2 - 100)
  }
  // The view flip means every player sees themselves as blue at the bottom.
  const idxText = idx === null ? '' : ` · player ${idx} · you are blue (bottom)`
  statusEl.textContent = `${net.status()}${idxText}`
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// Network conditions panel: summon bad conditions on demand.
function slider(id: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`#${id}`)!
}
const lat = slider('lat')
const jit = slider('jit')
const loss = slider('loss')

function pushNetsim() {
  document.querySelector('#latv')!.textContent = lat.value
  document.querySelector('#jitv')!.textContent = jit.value
  document.querySelector('#lossv')!.textContent = loss.value
  const config: NetSimConfig = {
    latencyMs: Number(lat.value),
    jitterMs: Number(jit.value),
    lossPct: Number(loss.value),
  }
  net.send({ type: 'netsim', config })
}
for (const el of [lat, jit, loss]) el.addEventListener('input', pushNetsim)
