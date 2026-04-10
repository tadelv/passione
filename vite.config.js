import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_GATEWAY_URL || 'http://localhost:8080',
        changeOrigin: true
      },
      '/ws': {
        target: (process.env.VITE_WS_URL || 'ws://localhost:8080'),
        ws: true
      }
    }
  }
})
