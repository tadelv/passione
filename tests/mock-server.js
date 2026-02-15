/**
 * Mock server for e2e tests.
 *
 * Serves both the built app (dist/) and mock Streamline-Bridge API on port 8080.
 * This mirrors the production setup where Streamline-Bridge serves the web skin
 * and API on the same host/port.
 *
 * Provides:
 *  - Static file serving for dist/ (SPA with index.html fallback)
 *  - REST API endpoints (machine state, workflow, store, profiles, etc.)
 *  - WebSocket endpoints (machine snapshot, scale snapshot, shot settings, water levels)
 */

import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { WebSocketServer } from './ws-server.js'

const DIST_DIR = join(import.meta.dirname, '..', 'dist')
const PORT = 8080

// ---- Mock data --------------------------------------------------------

const mockMachineState = {
  state: 'idle',
  substate: 'ready',
}

const mockWorkflow = {
  profile: {
    title: 'Default Profile',
    id: 'default-profile-001',
    author: 'Test',
    notes: '',
    beverage_type: 'espresso',
    steps: [],
  },
  doseData: {
    doseIn: 18.0,
    doseOut: 36.0,
  },
  grinderData: {
    grinder: 'Test Grinder',
    setting: '15',
  },
}

const mockSnapshot = {
  timestamp: new Date().toISOString(),
  state: { state: 'idle', substate: 'ready' },
  flow: 0,
  pressure: 0,
  targetFlow: 0,
  targetPressure: 0,
  mixTemperature: 92.5,
  groupTemperature: 92.0,
  targetMixTemperature: 93.0,
  targetGroupTemperature: 93.0,
  profileFrame: 0,
  steamTemperature: 140.0,
}

const mockScaleSnapshot = {
  timestamp: new Date().toISOString(),
  weight: 0,
  batteryLevel: 85,
  connected: true,
}

const mockShotSettings = {
  targetSteamTemp: 160,
  targetHotWaterTemp: 80,
  targetGroupTemp: 93,
  steamFlow: 150,
}

const mockWaterLevels = {
  currentLevel: 75,
  warningThresholdPercentage: 10,
}

const mockProfiles = []

const kvStore = {}

// ---- MIME types --------------------------------------------------------

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

// ---- Static file serving -----------------------------------------------

function serveStatic(res, urlPath) {
  let filePath = join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath)

  // For SPA: if file doesn't exist, serve index.html (hash-based routing handles the rest)
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(DIST_DIR, 'index.html')
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
    return
  }

  const ext = extname(filePath)
  const mime = MIME_TYPES[ext] || 'application/octet-stream'

  try {
    const content = readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': mime })
    res.end(content)
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Internal Server Error')
  }
}

// ---- REST API handler ---------------------------------------------------

function handleApi(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname
  const method = req.method

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Collect body for POST/PUT
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      let parsed = null
      if (body) {
        try { parsed = JSON.parse(body) } catch { /* ignore */ }
      }
      resolve(routeApi(path, method, parsed, res))
    })
  })
}

function routeApi(path, method, body, res) {
  const json = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }

  // Machine state
  if (path === '/api/v1/machine/state' && method === 'GET') {
    return json(mockMachineState)
  }
  if (path.startsWith('/api/v1/machine/state/') && method === 'PUT') {
    const newState = path.split('/').pop()
    mockMachineState.state = newState
    return json(mockMachineState)
  }

  // Machine info
  if (path === '/api/v1/machine/info' && method === 'GET') {
    return json({ model: 'DE1', serial: 'TEST001', firmware: '1.0.0' })
  }

  // Workflow
  if (path === '/api/v1/workflow' && method === 'GET') {
    return json(mockWorkflow)
  }
  if (path === '/api/v1/workflow' && method === 'PUT') {
    if (body) Object.assign(mockWorkflow, body)
    return json(mockWorkflow)
  }

  // Profiles
  if (path === '/api/v1/profiles' && method === 'GET') {
    return json(mockProfiles)
  }
  if (path === '/api/v1/profiles' && method === 'POST') {
    if (body) mockProfiles.push(body)
    return json(body, 201)
  }
  if (path.startsWith('/api/v1/profiles/') && method === 'GET') {
    const id = decodeURIComponent(path.split('/').pop())
    const profile = mockProfiles.find(p => p.id === id)
    return profile ? json(profile) : json({ error: 'Not found' }, 404)
  }

  // Machine profile upload
  if (path === '/api/v1/machine/profile' && method === 'POST') {
    return json({ ok: true })
  }

  // Shot settings
  if (path === '/api/v1/machine/shotSettings' && method === 'GET') {
    return json(mockShotSettings)
  }
  if (path === '/api/v1/machine/shotSettings' && method === 'POST') {
    if (body) Object.assign(mockShotSettings, body)
    return json(mockShotSettings)
  }

  // Machine settings
  if (path === '/api/v1/machine/settings' && method === 'GET') {
    return json({ fanThreshold: 0, flushEnabled: true })
  }
  if (path === '/api/v1/machine/settings' && method === 'POST') {
    return json({ ok: true })
  }

  // Water levels
  if (path === '/api/v1/machine/waterLevels' && method === 'GET') {
    return json(mockWaterLevels)
  }
  if (path === '/api/v1/machine/waterLevels' && method === 'POST') {
    if (body) Object.assign(mockWaterLevels, body)
    return json(mockWaterLevels)
  }

  // Scale tare
  if (path === '/api/v1/scale/tare' && method === 'PUT') {
    return json({ ok: true })
  }

  // Devices
  if (path === '/api/v1/devices' && method === 'GET') {
    return json([])
  }
  if (path === '/api/v1/devices/scan' && method === 'GET') {
    return json({ scanning: true })
  }

  // Shots
  if (path === '/api/v1/shots/ids' && method === 'GET') {
    return json([])
  }
  if (path === '/api/v1/shots/latest' && method === 'GET') {
    return json({ error: 'No shots' }, 404)
  }
  if (path === '/api/v1/shots' && method === 'GET') {
    return json([])
  }

  // KV Store -- handles /api/v1/store/{namespace}/{key}
  if (path.startsWith('/api/v1/store/')) {
    const parts = path.replace('/api/v1/store/', '').split('/')
    const namespace = decodeURIComponent(parts[0] || '')
    const key = parts[1] ? decodeURIComponent(parts[1]) : null

    if (!namespace) {
      return json({ error: 'Missing namespace' }, 400)
    }

    // GET /api/v1/store/{namespace} -- list keys
    if (!key && method === 'GET') {
      const ns = kvStore[namespace] || {}
      return json(Object.keys(ns))
    }

    // GET /api/v1/store/{namespace}/{key}
    if (key && method === 'GET') {
      const val = kvStore[namespace]?.[key]
      if (val !== undefined) return json(val)
      return json({ error: 'Not found' }, 404)
    }

    // POST /api/v1/store/{namespace}/{key}
    if (key && method === 'POST') {
      if (!kvStore[namespace]) kvStore[namespace] = {}
      kvStore[namespace][key] = body
      return json({ ok: true })
    }

    // DELETE /api/v1/store/{namespace}/{key}
    if (key && method === 'DELETE') {
      if (kvStore[namespace]) delete kvStore[namespace][key]
      res.writeHead(204)
      res.end()
      return
    }
  }

  // Settings (gateway-level)
  if (path === '/api/v1/settings' && method === 'GET') {
    return json({})
  }
  if (path === '/api/v1/settings' && method === 'POST') {
    return json({ ok: true })
  }

  // Sensors
  if (path === '/api/v1/sensors' && method === 'GET') {
    return json([])
  }

  // Plugins
  if (path === '/api/v1/plugins' && method === 'GET') {
    return json([])
  }

  // Fallback
  json({ error: 'Not found', path, method }, 404)
}

// ---- WebSocket handler --------------------------------------------------

function setupWebSockets(server) {
  const wss = new WebSocketServer({ server })

  wss.on('connection', (ws, req) => {
    const path = req.url

    if (path === '/ws/v1/machine/snapshot') {
      // Send snapshot immediately, then periodically
      const send = () => {
        if (ws.readyState === 1) {
          const snap = {
            ...mockSnapshot,
            timestamp: new Date().toISOString(),
            state: { ...mockMachineState },
          }
          ws.send(JSON.stringify(snap))
        }
      }
      send()
      const interval = setInterval(send, 200) // 5 Hz for tests
      ws.on('close', () => clearInterval(interval))
      return
    }

    if (path === '/ws/v1/scale/snapshot') {
      const send = () => {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            ...mockScaleSnapshot,
            timestamp: new Date().toISOString(),
          }))
        }
      }
      send()
      const interval = setInterval(send, 500) // 2 Hz for tests
      ws.on('close', () => clearInterval(interval))
      return
    }

    if (path === '/ws/v1/machine/shotSettings') {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(mockShotSettings))
      }
      return
    }

    if (path === '/ws/v1/machine/waterLevels') {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(mockWaterLevels))
      }
      return
    }
  })

  return wss
}

// ---- Server start/stop ---------------------------------------------------

export async function startServers() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`)

      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res)
      } else {
        serveStatic(res, url.pathname)
      }
    })

    const wss = setupWebSockets(server)

    server.listen(PORT, () => {
      console.log(`[mock] Server running on http://localhost:${PORT} (static + API + WebSocket)`)
      resolve({ server, wss })
    })

    server.on('error', reject)
  })
}

export async function stopServers({ server, wss }) {
  wss.close()
  await new Promise((resolve) => server.close(resolve))
}

// ---- CLI entry point (run directly with node) ----------------------------

const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))

if (isMainModule) {
  const servers = await startServers()

  process.on('SIGINT', async () => {
    console.log('\n[mock] Shutting down...')
    await stopServers(servers)
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await stopServers(servers)
    process.exit(0)
  })
}
