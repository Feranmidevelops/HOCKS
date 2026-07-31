import { WebSocketServer, WebSocket } from 'ws'
import { DT, TABLE_H, TABLE_W } from '../sim/constants'
import { step } from '../sim/step'
import { createInitialState } from '../sim/types'
import type { Vec2 } from '../sim/types'
import type { ClientMsg, ServerMsg } from '../protocol'
import { NetSim } from './netsim'

const PORT = 8081
// 60Hz authoritative sim, snapshot every 3rd tick = 20Hz broadcasts.
const SNAPSHOT_EVERY = 3
// Clamp catch-up work after event-loop stalls, same as the client loop.
const MAX_CATCHUP_MS = 250

const DEFAULT_TARGETS: [Vec2, Vec2] = [
  { x: TABLE_W / 2, y: TABLE_H - 80 },
  { x: TABLE_W / 2, y: 80 },
]

interface Seat {
  ws: WebSocket
  /** Simulated conditions, one per direction, so both ways are configurable. */
  inbound: NetSim
  outbound: NetSim
}

const seats: [Seat | null, Seat | null] = [null, null]
const targets: [Vec2, Vec2] = [{ ...DEFAULT_TARGETS[0] }, { ...DEFAULT_TARGETS[1] }]

function handle(idx: 0 | 1, seat: Seat, msg: ClientMsg): void {
  if (msg.type === 'input') {
    // Never let non-finite numbers into the sim — NaN poisons every state
    // downstream of it. The sim clamps range; we only vet finiteness.
    if (Number.isFinite(msg.target?.x) && Number.isFinite(msg.target?.y)) {
      targets[idx] = { x: msg.target.x, y: msg.target.y }
    }
  } else if (msg.type === 'netsim') {
    const c = msg.config
    if (Number.isFinite(c?.latencyMs) && Number.isFinite(c?.jitterMs) && Number.isFinite(c?.lossPct)) {
      const cfg = {
        latencyMs: Math.min(Math.max(c.latencyMs, 0), 2000),
        jitterMs: Math.min(Math.max(c.jitterMs, 0), 1000),
        lossPct: Math.min(Math.max(c.lossPct, 0), 100),
      }
      seat.inbound.setConfig(cfg)
      seat.outbound.setConfig(cfg)
      console.log(`player ${idx} netsim: ${cfg.latencyMs}ms +${cfg.jitterMs}ms jitter, ${cfg.lossPct}% loss`)
    }
  }
}

function send(seat: Seat, msg: ServerMsg): void {
  const data = JSON.stringify(msg)
  seat.outbound.send(() => {
    if (seat.ws.readyState === WebSocket.OPEN) seat.ws.send(data)
  })
}

const wss = new WebSocketServer({ port: PORT })

wss.on('connection', (ws) => {
  const idx = seats[0] === null ? 0 : seats[1] === null ? 1 : null
  if (idx === null) {
    ws.send(JSON.stringify({ type: 'full' } satisfies ServerMsg))
    ws.close()
    return
  }
  const seat: Seat = { ws, inbound: new NetSim(), outbound: new NetSim() }
  seats[idx] = seat
  send(seat, { type: 'welcome', playerIndex: idx })
  console.log(`player ${idx} joined`)

  ws.on('message', (data) => {
    let msg: ClientMsg
    try {
      msg = JSON.parse(String(data))
    } catch {
      return
    }
    // Inputs go through the inbound half of the simulated network.
    seat.inbound.send(() => handle(idx, seat, msg))
  })

  ws.on('close', () => {
    seats[idx] = null
    targets[idx] = { ...DEFAULT_TARGETS[idx] }
    console.log(`player ${idx} left`)
  })
})

// The authoritative loop: same accumulator pattern as the client renderer,
// but here the ticks are the game. setInterval just pumps the accumulator;
// the sim only ever advances in whole DT ticks.
let state = createInitialState()
let last = performance.now()
let acc = 0
const tickMs = DT * 1000

setInterval(() => {
  const now = performance.now()
  acc = Math.min(acc + (now - last), MAX_CATCHUP_MS)
  last = now
  while (acc >= tickMs) {
    state = step(state, { targets: [{ ...targets[0] }, { ...targets[1] }] })
    acc -= tickMs
    if (state.tick % SNAPSHOT_EVERY === 0) {
      const msg: ServerMsg = { type: 'snapshot', state }
      for (const seat of seats) {
        if (seat !== null) send(seat, msg)
      }
    }
  }
}, 4)

console.log(`HOCKS authoritative server on ws://localhost:${PORT} (60Hz sim, 20Hz snapshots)`)
