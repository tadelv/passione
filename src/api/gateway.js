/**
 * Gateway URL configuration for Streamline-Bridge API.
 *
 * In development: uses relative paths / current host so requests go through
 *   Vite's dev server proxy (configured in vite.config.js).
 * In production (served by Streamline-Bridge on port 3000 or similar):
 *   REST and WebSocket URLs point to port 8080 on the same hostname,
 *   since the API always runs on port 8080 regardless of the skin server port.
 */

const isDev = import.meta.env.DEV

/** Base URL for REST API calls. Empty in dev (relative paths go through Vite proxy). */
export const GATEWAY_URL = isDev
  ? ''
  : `http://${window.location.hostname}:8080`

/** Base URL for WebSocket connections. Uses current host in dev (Vite proxies /ws). */
export const WS_URL = isDev
  ? `ws://${window.location.host}`
  : `ws://${window.location.hostname}:8080`
