import { TABLE_H, TABLE_W } from '../sim/constants'
import type { NetSimConfig } from '../protocol'
import type { Body } from '../sim/types'
import { trackPointer } from './input'
import { SnapshotBuffer } from './interp'
import { connect } from './net'
import { Reconciler } from './reconcile'
import { render } from './render'
import { Stats } from './stats'
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
const stats = new Stats()

// Server selection: ?server=host takes a full host (cross-region testing),
// ?port=N an alternate local instance; in dev default to :8081 (vite serves
// the page); in production the game server serves this page — same origin.
const params = new URLSearchParams(location.search)
const serverParam = params.get('server')
const portParam = params.get('port')
const wsUrl = serverParam
  ? `${serverParam.startsWith('localhost') || serverParam.startsWith('127.') ? 'ws' : 'wss'}://${serverParam}`
  : portParam
    ? `ws://${location.hostname}:${portParam}`
    : import.meta.env.DEV
      ? `ws://${location.hostname}:8081`
      : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`

const net = connect(wsUrl, {
  onSnapshot: (s, ack) => {
    const now = performance.now()
    buffer.push(s, now)
    stats.snapshotArrived(now)
    if (reconciler !== null) {
      reconciler.onSnapshot(s, ack)
      stats.correction(reconciler.lastCorrection(), reconciler.lastResimTicks(), now)
    }
  },
  onPong: (rtt) => stats.pong(rtt),
  onBytes: (dir, n) => stats.bytes(dir, n, performance.now()),
  onDrop: () => {
    // Reconnect may seat us elsewhere and the server resets our input seq —
    // start the local timeline over from the next authoritative snapshot.
    buffer.reset()
    reconciler = null
    rematchAsked = false
  },
})
const pointer = trackPointer(canvas)
let rematchAsked = false

canvas.addEventListener('pointerdown', () => {
  if (net.game().mode === 'over' && !rematchAsked) {
    net.send({ type: 'rematch' })
    rematchAsked = true
  }
})

// Debug handle: lets tooling (and later the Phase 7 overlay) compare the
// interpolated past view against the raw snapshot and the predicted present.
;(window as unknown as Record<string, unknown>).__hocks = {
  sample: () => buffer.sample(performance.now()),
  latest: () => net.latest(),
  predicted: () => (reconciler === null ? null : reconciler.view()),
  err: () => (reconciler === null ? 0 : reconciler.correctionError()),
  game: () => net.game(),
  stats: () => stats.report(performance.now()),
}

// RTT probe: one ping a second, echoed through the netsim pipeline.
setInterval(() => net.send({ type: 'ping', t: performance.now() }), 1000)

// The overlay: the project's numbers, live. Updated at 4Hz — fast enough to
// watch, slow enough to read.
const statsEl = document.querySelector<HTMLDivElement>('#stats')!

// Players don't need the dev tooling: the netsim sliders and the stats
// overlay are hidden unless ?debug=1 is in the URL or 'd' is pressed.
const netsimEl = document.querySelector<HTMLDivElement>('#netsim')!
let debugOn = params.has('debug')
function applyDebugVisibility() {
  netsimEl.style.display = debugOn ? 'flex' : 'none'
  statsEl.style.display = debugOn ? 'block' : 'none'
}
applyDebugVisibility()
window.addEventListener('keydown', (e) => {
  if (e.key === 'd') {
    debugOn = !debugOn
    applyDebugVisibility()
  }
})
setInterval(() => {
  const r = stats.report(performance.now())
  const err = reconciler === null ? 0 : reconciler.correctionError()
  const fmt = (v: number | null, unit: string, digits = 0) =>
    v === null ? '—' : `${v.toFixed(digits)}${unit}`
  statsEl.textContent = [
    `rtt         ${fmt(r.rttMs, ' ms')}`,
    `snapshots   ${fmt(r.snapGapMeanMs, '', 0)} ±${fmt(r.snapJitterMs, ' ms', 1)}`,
    `resim       ${r.resimTicks} ticks`,
    `correction  ${r.correctionAvg.toFixed(1)}u avg · ${r.correctionMax.toFixed(0)}u max`,
    `smoothing   ${err.toFixed(1)}u`,
    `traffic     ↓${(r.bytesInPerSec / 1024).toFixed(1)} ↑${(r.bytesOutPerSec / 1024).toFixed(1)} KB/s`,
  ].join('\n')
}, 250)

// Phase 4 render composition, entity by entity:
//   own paddle + puck → predicted state (present time, reconciled each snapshot)
//   opponent paddle   → interpolation buffer (~100ms in the past, smooth —
//                       their inputs can't be predicted, only replayed)
//   score / freeze    → server's word; goals are the server's call
function overlay(title: string, subtitle: string) {
  ctx.fillStyle = 'rgba(11, 14, 20, 0.72)'
  ctx.fillRect(0, TABLE_H / 2 - 130, TABLE_W, 190)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#e8e6e3'
  ctx.font = 'bold 44px system-ui, sans-serif'
  ctx.fillText(title, TABLE_W / 2, TABLE_H / 2 - 60)
  ctx.fillStyle = '#8b96ad'
  ctx.font = '22px system-ui, sans-serif'
  ctx.fillText(subtitle, TABLE_W / 2, TABLE_H / 2 - 14)
}

function frame() {
  ctx.setTransform(canvas.width / TABLE_W, 0, 0, canvas.height / TABLE_H, 0, 0)
  const now = performance.now()
  let s = buffer.sample(now) ?? net.latest()
  const idx = net.playerIndex()
  const g = net.game()
  const live = g.mode === 'solo' || g.mode === 'versus'
  if (g.mode !== 'over') rematchAsked = false
  if (idx !== null && live) {
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
  if (g.mode === 'paused') {
    overlay('PAUSED', 'opponent disconnected — waiting for them to return…')
  } else if (g.mode === 'over' && idx !== null) {
    overlay(
      g.winner === idx ? 'YOU WIN 🏆' : 'YOU LOSE',
      rematchAsked ? 'rematch requested — waiting for opponent…' : 'click or tap for a rematch',
    )
  }
  // The view flip means every player sees themselves as blue at the bottom.
  const idxText = idx === null ? '' : ` · player ${idx} · you are blue (bottom)`
  const pendText = reconciler === null ? '' : ` · ${reconciler.pendingCount()} unacked inputs`
  const err = reconciler === null ? 0 : reconciler.correctionError()
  const errText = err >= 1 ? ` · smoothing ${Math.round(err)}u` : ''
  statusEl.textContent = `${net.status()}${idxText}${pendText}${errText}`
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
