import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

/**
 * Generates manifest.json in the build output (dist/) so the folder is a
 * complete Streamline-Bridge skin. The skin `id` defaults to "passione"
 * but can be overridden via VITE_SKIN_ID (e.g. "passione-dev") so a dev
 * build installs alongside the release skin without overwriting it.
 */
function skinManifest(skinId, version) {
  return {
    name: 'skin-manifest',
    writeBundle() {
      const dir = join(process.cwd(), 'dist')
      mkdirSync(dir, { recursive: true })
      const id = skinId || 'passione'
      const isDev = id !== 'passione'
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
        id,
        name: isDev ? 'Passione Dev' : 'Passione',
        description: 'A work of passion — a modern web interface for the DE1 espresso machine via Streamline-Bridge',
        version: version,
        author: 'Vid Tadel'
      }, null, 2) + '\n')
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // VITE_SKIN_ID can be set via shell env or .env file.
  // "passione-dev" avoids overwriting the release skin on the device.
  const skinId = process.env.VITE_SKIN_ID || env.VITE_SKIN_ID || 'passione'
  // VITE_APP_VERSION overrides the baked-in version (used by CI to inject
  // a dev version string like "0.9.3-dev.abc1234.42" so the update checker
  // doesn't false-positive against the manifest on disk).
  const appVersion = process.env.VITE_APP_VERSION || env.VITE_APP_VERSION || pkg.version
  return {
    plugins: [vue(), skinManifest(skinId, appVersion)],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __SKIN_ID__: JSON.stringify(skinId),
    },
    base: './',
    build: {
      outDir: 'dist',
      assetsDir: 'assets'
    },
    server: {
      proxy: {
        '/api': {
          target: env.VITE_GATEWAY_URL || 'http://localhost:8080',
          changeOrigin: true
        },
        '/ws': {
          target: env.VITE_WS_URL || 'ws://localhost:8080',
          ws: true
        }
      }
    }
  }
})
