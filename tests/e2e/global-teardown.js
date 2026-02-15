/**
 * Playwright global teardown: stops mock server after all tests.
 */

import { stopServers } from '../mock-server.js'

export default async function globalTeardown() {
  const servers = globalThis.__TEST_SERVERS__
  if (servers) {
    await stopServers(servers)
  }
}
