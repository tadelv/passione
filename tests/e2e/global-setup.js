/**
 * Playwright global setup: starts mock server before all tests.
 */

import { startServers } from '../mock-server.js'

export default async function globalSetup() {
  const servers = await startServers()
  // Stash references on globalThis so global-teardown can access them
  globalThis.__TEST_SERVERS__ = servers
}
