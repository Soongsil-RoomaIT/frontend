import { HEARTBEAT_INTERVAL_MS, parseServerMessage, PING_FRAME, type ServerMessage } from './protocol'

/**
 * - idle:         not started, or no WebSocket URL configured
 * - connecting:   first connection attempt in progress
 * - open:         connected
 * - reconnecting: connection lost (or never established); waiting to retry
 */
export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting'

export interface StatusChange {
  status: ConnectionStatus
  /** Epoch ms of the next retry while reconnecting */
  nextRetryAt: number | null
  /** True when an `open` follows a previous successful connection (missed messages need a resync) */
  reconnected: boolean
}

interface RealtimeClientOptions {
  url: string
  onMessage: (message: ServerMessage) => void
  onStatusChange: (change: StatusChange) => void
  initialRetryMs?: number
  maxRetryMs?: number
  /** A connection must stay open this long before the backoff resets */
  stableAfterMs?: number
  /** Silence this long means the link may be dead; the client probes with a ping */
  silenceMs?: number
  /** How long the probe may go unanswered before the socket is treated as dead */
  probeGraceMs?: number
}

export class RealtimeClient {
  private readonly opts: Required<RealtimeClientOptions>
  private socket: WebSocket | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private stableTimer: ReturnType<typeof setTimeout> | null = null
  private livenessTimer: ReturnType<typeof setTimeout> | null = null
  private probePending = false
  private attempt = 0
  private hasConnectedBefore = false
  private stopped = true

  constructor(options: RealtimeClientOptions) {
    this.opts = {
      initialRetryMs: 1_000,
      maxRetryMs: 30_000,
      stableAfterMs: 5_000,
      // Two missed heartbeats before probing, so an ordinary hiccup doesn't drop the socket
      silenceMs: HEARTBEAT_INTERVAL_MS * 2 + 5_000,
      probeGraceMs: 5_000,
      ...options,
    }
  }

  start() {
    if (!this.stopped) return
    this.stopped = false
    if (!this.opts.url) {
      this.emit('idle')
      return
    }
    window.addEventListener('online', this.handleBrowserOnline)
    this.connect()
  }

  stop() {
    if (this.stopped) return
    this.stopped = true
    window.removeEventListener('online', this.handleBrowserOnline)
    this.clearRetryTimer()
    this.clearStableTimer()
    this.clearLivenessTimer()
    this.disposeSocket()
    this.emit('idle')
  }

  /** Skips the backoff wait and reconnects immediately. */
  retryNow() {
    if (this.stopped || !this.opts.url || this.socket) return
    this.clearRetryTimer()
    this.connect()
  }

  private connect() {
    this.emit(this.hasConnectedBefore || this.attempt > 0 ? 'reconnecting' : 'connecting')

    let socket: WebSocket
    try {
      socket = new WebSocket(this.opts.url)
    } catch (error) {
      // Invalid URL or blocked scheme; treat like a failed connection
      if (import.meta.env.DEV) console.error('[realtime] Cannot open WebSocket — check VITE_WS_URL', error)
      this.scheduleRetry()
      return
    }
    this.socket = socket

    socket.onopen = () => {
      const reconnected = this.hasConnectedBefore
      this.hasConnectedBefore = true
      // Reset the backoff only once the connection proves stable. A server that accepts and
      // immediately closes (overload, auth rejection) would otherwise cause a ~1s reconnect loop.
      this.clearStableTimer()
      this.stableTimer = setTimeout(() => {
        this.stableTimer = null
        this.attempt = 0
      }, this.opts.stableAfterMs)
      this.armLiveness()
      this.emit('open', null, reconnected)
    }
    socket.onmessage = (event: MessageEvent) => {
      // Any frame proves the link is alive, even one we can't parse
      this.armLiveness()
      if (typeof event.data !== 'string') return
      const message = parseServerMessage(event.data)
      if (message) {
        this.opts.onMessage(message)
      } else if (import.meta.env.DEV) {
        console.warn('[realtime] Ignored unrecognized message', event.data)
      }
    }
    // A failed connection fires `error` then `close`, so retrying is handled in onclose only
    socket.onclose = () => {
      this.socket = null
      this.clearStableTimer()
      this.clearLivenessTimer()
      if (!this.stopped) this.scheduleRetry()
    }
  }

  private scheduleRetry() {
    this.clearRetryTimer()
    const base = Math.min(this.opts.maxRetryMs, this.opts.initialRetryMs * 2 ** this.attempt)
    // Jitter (50–100% of base) so many clients don't reconnect in lockstep after a server restart
    const delay = Math.round(base * (0.5 + Math.random() * 0.5))
    this.attempt += 1
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.connect()
    }, delay)
    this.emit('reconnecting', Date.now() + delay)
  }

  private disposeSocket() {
    const socket = this.socket
    if (!socket) return
    this.socket = null
    socket.onmessage = null
    socket.onclose = null
    if (socket.readyState === WebSocket.CONNECTING) {
      // Closing a CONNECTING socket logs a browser error; close as soon as it opens instead
      socket.onopen = () => socket.close(1000)
    } else {
      socket.onopen = null
      socket.close(1000)
    }
  }

  private clearRetryTimer() {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  /**
   * A black-holed connection (wifi drop, NAT timeout, server freeze) never fires `close`,
   * so the socket would sit in OPEN forever while no data arrives. Watch for silence instead:
   * probe once with a ping, then give up on the socket and reconnect.
   */
  private armLiveness() {
    this.clearLivenessTimer()
    this.probePending = false
    this.livenessTimer = setTimeout(this.handleSilence, this.opts.silenceMs)
  }

  private handleSilence = () => {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return

    if (!this.probePending) {
      this.probePending = true
      try {
        socket.send(PING_FRAME)
      } catch {
        // Send failed outright — the socket is already unusable
        this.dropDeadSocket()
        return
      }
      this.livenessTimer = setTimeout(this.handleSilence, this.opts.probeGraceMs)
      return
    }
    this.dropDeadSocket()
  }

  /** Closes a socket the browser still believes is open, so the retry path can take over. */
  private dropDeadSocket() {
    const socket = this.socket
    if (!socket) return
    if (import.meta.env.DEV) console.warn('[realtime] No traffic and no ping reply — reconnecting')
    this.clearLivenessTimer()
    // `close()` on a black-holed socket may never complete its handshake, so drive the
    // retry here and stop listening rather than waiting for an onclose that may not come.
    this.socket = null
    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.close(4000, 'No heartbeat')
    this.clearStableTimer()
    if (!this.stopped) this.scheduleRetry()
  }

  private clearLivenessTimer() {
    if (this.livenessTimer !== null) {
      clearTimeout(this.livenessTimer)
      this.livenessTimer = null
    }
  }

  private clearStableTimer() {
    if (this.stableTimer !== null) {
      clearTimeout(this.stableTimer)
      this.stableTimer = null
    }
  }

  private handleBrowserOnline = () => this.retryNow()

  private emit(status: ConnectionStatus, nextRetryAt: number | null = null, reconnected = false) {
    this.opts.onStatusChange({ status, nextRetryAt, reconnected })
  }
}
