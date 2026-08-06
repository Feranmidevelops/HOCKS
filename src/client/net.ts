import type { SimState } from '../sim/types'
import type { ClientMsg, LiveGameMode, ServerMsg } from '../protocol'

export interface GameInfo {
  mode: LiveGameMode
  winner: 0 | 1 | null
}

export interface NetClient {
  /** Most recent snapshot the server has sent, or null before the first. */
  latest: () => SimState | null
  playerIndex: () => 0 | 1 | null
  /** What the room is doing per the server: solo/versus/paused/over. */
  game: () => GameInfo
  status: () => string
  send: (msg: ClientMsg) => void
}

export interface NetHandlers {
  /** ack = highest own-input seq this state reflects (Phase 4). */
  onSnapshot?: (state: SimState, ack: number) => void
  /** Fired when the connection drops — interpolation buffers must reset. */
  onDrop?: () => void
  /** Overlay hooks: rtt echo and wire traffic accounting. */
  onPong?: (rttMs: number) => void
  onBytes?: (dir: 'in' | 'out', count: number) => void
}

/** Connect to the game server; reconnects automatically unless it was full. */
export function connect(url: string, handlers: NetHandlers = {}): NetClient {
  let ws: WebSocket
  let latest: SimState | null = null
  let playerIndex: 0 | 1 | null = null
  let game: GameInfo = { mode: 'solo', winner: null }
  let status = 'connecting…'
  let rejected = false

  const open = () => {
    ws = new WebSocket(url)
    ws.onopen = () => {
      status = 'connected'
    }
    ws.onmessage = (e) => {
      const raw = String(e.data)
      handlers.onBytes?.('in', raw.length)
      const msg: ServerMsg = JSON.parse(raw)
      if (msg.type === 'snapshot') {
        latest = msg.state
        handlers.onSnapshot?.(msg.state, msg.ack)
      } else if (msg.type === 'welcome') playerIndex = msg.playerIndex
      else if (msg.type === 'game') game = { mode: msg.mode, winner: msg.winner }
      else if (msg.type === 'pong') handlers.onPong?.(performance.now() - msg.t)
      else if (msg.type === 'full') {
        rejected = true
        status = 'server full (two players max)'
      }
    }
    ws.onclose = () => {
      playerIndex = null
      latest = null
      handlers.onDrop?.()
      if (!rejected) {
        status = 'disconnected — retrying…'
        setTimeout(open, 1000)
      }
    }
  }
  open()

  return {
    latest: () => latest,
    playerIndex: () => playerIndex,
    game: () => game,
    status: () => status,
    send: (msg) => {
      if (ws.readyState === WebSocket.OPEN) {
        const data = JSON.stringify(msg)
        handlers.onBytes?.('out', data.length)
        ws.send(data)
      }
    },
  }
}
