/**
 * Gateway URL configuration for Streamline-Bridge API.
 *
 * In development: reads from Vite env vars (VITE_GATEWAY_URL / VITE_WS_URL).
 * In production (served by Streamline-Bridge): uses relative REST paths
 * and derives WebSocket URL from the current page origin.
 */

const isDev = import.meta.env.DEV

/**
 * Base URL for REST API calls.
 * Development: full URL from env (e.g. "http://192.168.1.100:8080")
 * Production: empty string — fetch paths like "/api/v1/..." are relative to origin.
 */
export const GATEWAY_URL = isDev
  ? (import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8080')
  : ''

/**
 * Base URL for WebSocket connections.
 * Development: full URL from env (e.g. "ws://192.168.1.100:8080")
 * Production: derived from current page host so it works regardless of IP/hostname.
 */
export const WS_URL = isDev
  ? (import.meta.env.VITE_WS_URL || 'ws://localhost:8080')
  : `ws://${window.location.host}`
