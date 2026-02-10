/**
 * ReconnectingWebSocket — auto-reconnects with exponential backoff.
 *
 * Usage:
 *   const ws = new ReconnectingWebSocket(url, onMessage)
 *   ws.connect()
 *   // later...
 *   ws.close()
 */

const INITIAL_DELAY = 1000   // 1 s
const MAX_DELAY = 30000      // 30 s
const BACKOFF_FACTOR = 2

export class ReconnectingWebSocket {
  /**
   * @param {string} url          Full WebSocket URL
   * @param {(data: any) => void} onMessage  Called with parsed JSON for each message
   */
  constructor(url, onMessage) {
    this._url = url
    this._onMessage = onMessage
    this._ws = null
    this._delay = INITIAL_DELAY
    this._timer = null
    this._closed = false       // true after explicit close()
    this._connected = false
    this._onConnectionChange = null
  }

  /** Whether the socket is currently open. */
  get connected() {
    return this._connected
  }

  /**
   * Register a callback invoked when connection state changes.
   * @param {(connected: boolean) => void} fn
   */
  set onConnectionChange(fn) {
    this._onConnectionChange = fn
  }

  /** Open the WebSocket (idempotent — closes previous if any). */
  connect() {
    this._closed = false
    this._openSocket()
  }

  /** Permanently close — stops reconnection attempts. */
  close() {
    this._closed = true
    clearTimeout(this._timer)
    if (this._ws) {
      this._ws.onclose = null // prevent reconnect handler
      this._ws.close()
      this._ws = null
    }
    this._setConnected(false)
  }

  // ---- internal ------------------------------------------------------------

  _openSocket() {
    if (this._closed) return

    try {
      this._ws = new WebSocket(this._url)
    } catch {
      this._scheduleReconnect()
      return
    }

    this._ws.onopen = () => {
      this._delay = INITIAL_DELAY  // reset backoff on success
      this._setConnected(true)
    }

    this._ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this._onMessage(data)
      } catch {
        // ignore non-JSON frames
      }
    }

    this._ws.onerror = () => {
      // onerror is always followed by onclose — reconnect logic lives there
    }

    this._ws.onclose = () => {
      this._setConnected(false)
      this._scheduleReconnect()
    }
  }

  _scheduleReconnect() {
    if (this._closed) return
    clearTimeout(this._timer)
    this._timer = setTimeout(() => this._openSocket(), this._delay)
    this._delay = Math.min(this._delay * BACKOFF_FACTOR, MAX_DELAY)
  }

  _setConnected(value) {
    if (this._connected === value) return
    this._connected = value
    this._onConnectionChange?.(value)
  }
}
