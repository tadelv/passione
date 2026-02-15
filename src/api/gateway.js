/**
 * Gateway URL configuration for Streamline-Bridge API.
 *
 * In development: reads from Vite env vars (VITE_GATEWAY_URL / VITE_WS_URL).
 * In production (served by Streamline-Bridge on port 3000 or similar):
 *   REST and WebSocket URLs point to port 8080 on the same hostname,
 *   since the API always runs on port 8080 regardless of the skin server port.
 */

const isDev = import.meta.env.DEV

/**
 * Base URL for REST API calls.
 * Development: full URL from env (e.g. "http://192.168.1.100:8080")
 * Production: always points to port 8080 on the current hostname.
 *   The skin may be served on port 3000 (or any other port), but the
 *   Streamline-Bridge API is always on port 8080.
 */
export const GATEWAY_URL = isDev
  ? (import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8080')
  : `http://${window.location.hostname}:8080`

/**
 * Base URL for WebSocket connections.
 * Development: full URL from env (e.g. "ws://192.168.1.100:8080")
 * Production: always points to port 8080 on the current hostname.
 */
export const WS_URL = isDev
  ? (import.meta.env.VITE_WS_URL || 'ws://localhost:8080')
  : `ws://${window.location.hostname}:8080`
