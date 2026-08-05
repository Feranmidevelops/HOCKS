import { TABLE_H, TABLE_W } from '../sim/constants'
import type { NetSimConfig } from '../protocol'
import type { Body } from '../sim/types'
import { trackPointer } from './input'
import { SnapshotBuffer } from './interp'
import { connect } from './net'
import { Reconciler } from './reconcile'
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

// Phase 4: the local sim predicts the whole state (own paddle AND puck) and
// reconciles against every snapshot; recreated if our seat ever changes.
let reconciler: Reconciler | null = null

const buffer = new SnapshotBuffer()
const net = connect(`ws://${location.hostname}:8081`, {
  onSnapshot: (s, ack) => {
    buffer.push(s, performance.now())
    reconciler?.onSnapshot(s, ack)
  },
  onDrop: () => buffer.reset(),
})
const pointer = trackPointer(canvas)

// Debug handle: lets tooling (and later the Phase 7 overlay) compare the
// interpolated past view against the raw snapshot and the predicted present.
;(window as unknown as Record<string, unknown>).__hocks = {
  sample: () => buffer.sample(performance.now()),
  latest: () => net.latest(),
  predicted: () => (reconciler === null ? null : reconciler.view()),
}

// Phase 4 render composition, entity by entity:
//   own paddle + puck → predicted state (present time, reconciled each snapshot)
//   opponent paddle   → interpolation buffer (~100ms in the past, smooth —
//                       their inputs can't be predicted, only replayed)
//   score / freeze    → server's word; goals are the server's call
function frame() {
  ctx.setTransform(canvas.width / TABLE_W, 0, 0, canvas.height / TABLE_H, 0, 0)
  const now = performance.now()
  let s = buffer.sample(now) ?? net.latest()
  const idx = net.playerIndex()
  if (idx !== null) {
    if (reconciler === null || reconciler.player !== idx) reconciler = new Reconciler(idx)
    for (const input of reconciler.advance(now, toTableCoords(pointer(), idx))) {
      net.send({ type: 'input', seq: input.seq, target: input.target })
    }
    const pred = reconciler.view()
    if (s !== null && pred !== null) {
      const paddles: [Body, Body] =
        idx === 0 ? [pred.paddles[0], s.paddles[1]] : [s.paddles[0], pred.paddles[1]]
      s = { ...pred, paddles, score: s.score, freeze: s.freeze }
    }
  }
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
  const pendText = reconciler === null ? '' : ` · ${reconciler.pendingCount()} unacked inputs`
  statusEl.textContent = `${net.status()}${idxText}${pendText}`
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
