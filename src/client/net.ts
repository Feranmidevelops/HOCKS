import type { SimState } from '../sim/types'
import type { ClientMsg, ServerMsg } from '../protocol'

export interface NetClient {
  /** Most recent snapshot the server has sent, or null before the first. */
  latest: () => SimState | null
  playerIndex: () => 0 | 1 | null
  status: () => string
  send: (msg: ClientMsg) => void
}

export interface NetHandlers {
  onSnapshot?: (state: SimState) => void
  /** Fired when the connection drops — interpolation buffers must reset. */
  onDrop?: () => void
}

/** Connect to the game server; reconnects automatically unless it was full. */
export function connect(url: string, handlers: NetHandlers = {}): NetClient {
  let ws: WebSocket
  let latest: SimState | null = null
  let playerIndex: 0 | 1 | null = null
  let status = 'connecting…'
  let rejected = false

  const open = () => {
    ws = new WebSocket(url)
    ws.onopen = () => {
      status = 'connected'
    }
    ws.onmessage = (e) => {
      const msg: ServerMsg = JSON.parse(String(e.data))
      if (msg.type === 'snapshot') {
        latest = msg.state
        handlers.onSnapshot?.(msg.state)
      } else if (msg.type === 'welcome') playerIndex = msg.playerIndex
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
    status: () => status,
    send: (msg) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    },
  }
}
