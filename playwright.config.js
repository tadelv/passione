import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  globalSetup: './tests/e2e/global-setup.js',
  globalTeardown: './tests/e2e/global-teardown.js',
  use: {
    // App is served from port 8080 (same as mock API) so that
    // production-mode relative REST paths and ws:// host derivation
    // connect to the mock API automatically.
    baseURL: 'http://localhost:8080',
    headless: true,
    viewport: { width: 1024, height: 768 },
    actionTimeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
