import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { WebSocketServer, WebSocket } from 'ws'
import { DT, TABLE_H, TABLE_W } from '../sim/constants'
import { step } from '../sim/step'
import { createInitialState } from '../sim/types'
import type { Vec2 } from '../sim/types'
import type { ClientMsg, ServerMsg } from '../protocol'
import { GameDirector, WIN_SCORE_DEFAULT, type Transition } from './director'
import { NetSim } from './netsim'

const PORT = Number(process.env.PORT ?? 8081)
const WIN_SCORE = Number(process.env.WIN_SCORE ?? WIN_SCORE_DEFAULT)
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

/** Latest input per seat, seq-wins: loss can skip seqs, TCP can't reorder them. */
interface LatestInput {
  seq: number
  target: Vec2
}
const inputs: [LatestInput, LatestInput] = [
  { seq: 0, target: { ...DEFAULT_TARGETS[0] } },
  { seq: 0, target: { ...DEFAULT_TARGETS[1] } },
]

const director = new GameDirector(WIN_SCORE)

/** Fresh game, same tick counter — client buffers reject rewound ticks. */
function resetGame(): void {
  state = { ...createInitialState(), tick: state.tick }
}

function gameMsg(): ServerMsg | null {
  if (director.mode === 'idle') return null
  return { type: 'game', mode: director.mode, winner: director.winner }
}

function broadcastGame(): void {
  const msg = gameMsg()
  if (msg === null) return
  for (const seat of seats) {
    if (seat !== null) send(seat, msg)
  }
}

function apply(t: Transition): void {
  if (t.reset) resetGame()
  if (t.changed || t.reset) broadcastGame()
}

function handle(idx: 0 | 1, seat: Seat, msg: ClientMsg): void {
  if (msg.type === 'ping') {
    // Echo through the outbound netsim too: the measured RTT honestly
    // includes both directions of whatever conditions are dialed in.
    if (Number.isFinite(msg.t)) send(seat, { type: 'pong', t: msg.t })
  } else if (msg.type === 'rematch') {
    apply(director.rematch(idx))
  } else if (msg.type === 'input') {
    // Never let non-finite numbers into the sim — NaN poisons every state
    // downstream of it. The sim clamps range; we only vet finiteness.
    if (
      Number.isFinite(msg.seq) &&
      msg.seq > inputs[idx].seq &&
      Number.isFinite(msg.target?.x) &&
      Number.isFinite(msg.target?.y)
    ) {
      inputs[idx] = { seq: msg.seq, target: { x: msg.target.x, y: msg.target.y } }
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

// In production this one process serves the built client AND the game socket
// on the same port; in dev, vite serves the client and this returns a hint.
const DIST = join(process.cwd(), 'dist')
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
}

const httpServer = createServer(async (req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
    return
  }
  if (!existsSync(DIST)) {
    res.writeHead(503, { 'content-type': 'text/plain' })
    res.end('no client build here - run `npm run build`, or use the vite dev server on :5173')
    return
  }
  const urlPath = (req.url ?? '/').split('?')[0]
  const safe = normalize(urlPath).replace(/^([.][.][/\\])+/, '')
  const file = join(DIST, safe === '/' || safe === '\\' ? 'index.html' : safe)
  try {
    const data = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(data)
  } catch {
    try {
      const index = await readFile(join(DIST, 'index.html'))
      res.writeHead(200, { 'content-type': MIME['.html'] })
      res.end(index)
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('not found')
    }
  }
})

const wss = new WebSocketServer({ server: httpServer })

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
  apply(director.join(idx))
  const g = gameMsg()
  if (g !== null) send(seat, g) // fresh joiner always learns the current mode
  console.log(`player ${idx} joined (${director.mode})`)

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
    inputs[idx] = { seq: 0, target: { ...DEFAULT_TARGETS[idx] } }
    apply(director.leave(idx, performance.now()))
    console.log(`player ${idx} left (${director.mode})`)
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
  apply(director.poll(now)) // expire a pause the opponent never came back from
  if (!director.shouldStep()) {
    // Paused/over/idle: hold the sim; don't bank catch-up time either.
    last = now
    acc = 0
    return
  }
  acc = Math.min(acc + (now - last), MAX_CATCHUP_MS)
  last = now
  while (acc >= tickMs) {
    state = step(state, { targets: [{ ...inputs[0].target }, { ...inputs[1].target }] })
    acc -= tickMs
    if (state.tick % SNAPSHOT_EVERY === 0) {
      // Personalized per seat: each player gets the ack for THEIR inputs.
      for (let i = 0; i < 2; i++) {
        const seat = seats[i]
        if (seat !== null) send(seat, { type: 'snapshot', state, ack: inputs[i].seq })
      }
    }
    apply(director.afterStep(state.score)) // the server owns wins, like goals
    if (!director.shouldStep()) break
  }
}, 4)

httpServer.listen(PORT, () => {
  const client = existsSync(DIST) ? 'serving built client from dist/' : 'ws only (no dist build)'
  console.log(`HOCKS authoritative server on :${PORT} (60Hz sim, 20Hz snapshots, ${client})`)
})
