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
  refillLevel: 0,
  warningThresholdPercentage: 10,
}

const mockSkin = {
  id: 'passione',
  name: 'Passione',
  version: '0.0.0-test',
  description: 'Mock skin for tests',
}

let mockSkinUpdateError = false

const mockProfiles = [
  {
    id: 'profile-test1234567890abcdef',
    profile: {
      version: '2',
      title: 'Classic Blooming',
      author: 'Test Author',
      notes: 'A test profile',
      beverage_type: 'espresso',
      target_weight: 36,
      target_volume: 0,
      steps: [
        { name: 'Fill', pump: 'pressure', pressure: 6.0, flow: 0, temperature: 93.0, seconds: 8, transition: 'fast' },
        { name: 'Bloom', pump: 'pressure', pressure: 0, flow: 0, temperature: 93.0, seconds: 15, transition: 'fast' },
        { name: 'Pour', pump: 'flow', pressure: 0, flow: 2.5, temperature: 93.0, seconds: 40, transition: 'smooth' },
      ],
    },
    visibility: 'visible',
    isDefault: true,
  },
  {
    id: 'profile-alt0987654321fedcba',
    profile: {
      version: '2',
      title: 'Alternative Profile',
      author: 'Test Author',
      notes: 'Second profile for round-trip tests',
      beverage_type: 'espresso',
      target_weight: 36,
      target_volume: 0,
      steps: [
        { name: 'Preinfuse', pump: 'pressure', pressure: 4.0, flow: 0, temperature: 92.0, seconds: 10, transition: 'fast' },
        { name: 'Pour', pump: 'pressure', pressure: 9.0, flow: 0, temperature: 92.0, seconds: 30, transition: 'smooth' },
      ],
    },
    visibility: 'visible',
    isDefault: false,
  },
]

const mockShotIds = ['shot-2026-02-13-100000', 'shot-2026-02-13-090000']
const mockShotsData = {
  'shot-2026-02-13-100000': {
    id: 'shot-2026-02-13-100000',
    timestamp: '2026-02-13T10:00:00Z',
    measurements: [
      { machine: { timestamp: '2026-02-13T10:00:00.000Z', state: { state: 'espresso', substate: 'pouring' }, flow: 2.5, pressure: 9.1, mixTemperature: 93.0 }, scale: { weight: 0, weightFlow: 0 } },
      { machine: { timestamp: '2026-02-13T10:00:30.000Z', state: { state: 'espresso', substate: 'pouring' }, flow: 2.0, pressure: 8.5, mixTemperature: 93.2 }, scale: { weight: 36, weightFlow: 1.8 } },
    ],
    workflow: { name: 'Morning Shot', profile: { title: 'Default Profile', author: 'Test' }, doseData: { doseIn: 18.0, doseOut: 36.0 } },
    metadata: { rating: 80 },
  },
  'shot-2026-02-13-090000': {
    id: 'shot-2026-02-13-090000',
    timestamp: '2026-02-13T09:00:00Z',
    measurements: [
      { machine: { timestamp: '2026-02-13T09:00:00.000Z', state: { state: 'espresso', substate: 'pouring' }, flow: 2.3, pressure: 9.0, mixTemperature: 92.5 }, scale: { weight: 0, weightFlow: 0 } },
      { machine: { timestamp: '2026-02-13T09:00:25.000Z', state: { state: 'espresso', substate: 'pouring' }, flow: 1.8, pressure: 8.0, mixTemperature: 92.8 }, scale: { weight: 34, weightFlow: 1.6 } },
    ],
    workflow: { name: 'Afternoon Shot', profile: { title: 'Blooming Espresso', author: 'Test' }, doseData: { doseIn: 18.0, doseOut: 34.0 } },
    metadata: { rating: 75 },
  },
}

const mockBeans = []
const mockGrinders = []
const kvStore = {}

// ---- Refresh-test scenario state (e2e only) -----------------------------

let beansFailNextGet = false
let grindersFailNextGet = false
let beansGetCount = 0
let grindersGetCount = 0
const mockBeanBatches = {} // beanId -> [{ id, roastDate, ... }]

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
      resolve(routeApi(path, method, parsed, res, url))
    })
  })
}

function routeApi(path, method, body, res, url) {
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
    // Mimic the DE1's substate progression so the UI's substate-gated logic
    // (e.g. shot timer start) exercises the real code path. Flowing
    // operations transition preparingForShot → pouring almost immediately.
    const FLOWING = new Set(['espresso', 'steam', 'hotWater', 'flush'])
    if (FLOWING.has(newState)) {
      mockMachineState.substate = 'preparingForShot'
      setTimeout(() => {
        if (mockMachineState.state === newState) {
          mockMachineState.substate = 'pouring'
        }
      }, 150)
    } else {
      mockMachineState.substate = 'idle'
    }
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
    return json(mockShotIds)
  }
  if (path === '/api/v1/shots/latest' && method === 'GET') {
    const latest = mockShotsData[mockShotIds[0]]
    return latest ? json(latest) : json({ error: 'No shots' }, 404)
  }
  if (path.match(/^\/api\/v1\/shots\/[^/]+$/) && method === 'GET') {
    const shotId = decodeURIComponent(path.split('/').pop())
    const shot = mockShotsData[shotId]
    return shot ? json(shot) : json({ error: 'Not found' }, 404)
  }
  if (path.match(/^\/api\/v1\/shots\/[^/]+$/) && method === 'PUT') {
    const shotId = decodeURIComponent(path.split('/').pop())
    const shot = mockShotsData[shotId]
    if (!shot) return json({ error: 'Not found' }, 404)
    if (body) Object.assign(shot, body)
    return json(shot)
  }
  if (path === '/api/v1/shots' && method === 'GET') {
    // Batch fetch with ?ids= or paginated list
    const idsParam = url?.searchParams?.get('ids')
    if (idsParam) {
      const ids = idsParam.split(',').map(decodeURIComponent)
      const items = ids.map(id => mockShotsData[id]).filter(Boolean)
      return json({ items, total: items.length, limit: items.length, offset: 0 })
    }
    const allShots = Object.values(mockShotsData)
    const search = url?.searchParams?.get('search')?.toLowerCase()
    const filtered = search
      ? allShots.filter(s => {
          const w = s.workflow ?? {}
          const texts = [w.name, w.profile?.title, s.metadata?.barista].filter(Boolean)
          return texts.some(t => t.toLowerCase().includes(search))
        })
      : allShots
    const limit = parseInt(url?.searchParams?.get('limit') || '50')
    const offset = parseInt(url?.searchParams?.get('offset') || '0')
    const items = filtered.slice(offset, offset + limit)
    return json({ items, total: filtered.length, limit, offset })
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

  // WebUI skins
  if (path === '/api/v1/webui/skins/update' && method === 'POST') {
    if (mockSkinUpdateError) return json({ error: 'mock failure' }, 500)
    return json({ message: 'Skin update check completed' })
  }
  if (path.startsWith('/api/v1/webui/skins/') && method === 'GET') {
    const id = decodeURIComponent(path.slice('/api/v1/webui/skins/'.length))
    if (id === mockSkin.id) return json(mockSkin)
    return json({ error: 'not found' }, 404)
  }

  // Test-only mutators for skin state (kept under /api/v1/test/* so the
  // existing /api/ prefix dispatch in startServers reaches them).
  if (path === '/api/v1/test/set-skin-version' && method === 'POST') {
    if (body?.version) mockSkin.version = body.version
    return json(mockSkin)
  }
  if (path === '/api/v1/test/set-skin-update-error' && method === 'POST') {
    mockSkinUpdateError = true
    return json({ ok: true })
  }
  if (path === '/api/v1/test/reset-skin' && method === 'POST') {
    mockSkin.version = '0.0.0-test'
    mockSkinUpdateError = false
    return json({ ok: true })
  }

  if (path === '/api/v1/test/reset-refresh-state' && method === 'POST') {
    beansFailNextGet = false
    grindersFailNextGet = false
    beansGetCount = 0
    grindersGetCount = 0
    for (const k of Object.keys(mockBeanBatches)) delete mockBeanBatches[k]
    return json({ ok: true })
  }

  if (path === '/api/v1/test/refresh-state' && method === 'GET') {
    return json({
      beansFailNextGet,
      grindersFailNextGet,
      beansGetCount,
      grindersGetCount,
    })
  }

  if (path === '/api/v1/test/fail-next-beans-get' && method === 'POST') {
    beansFailNextGet = true
    return json({ ok: true })
  }

  if (path === '/api/v1/test/fail-next-grinders-get' && method === 'POST') {
    grindersFailNextGet = true
    return json({ ok: true })
  }

  if (path === '/api/v1/test/add-bean' && method === 'POST') {
    // Simulate another device adding a bean — bypass POST handler and inject directly.
    // Honor a client-supplied id (tests use this to seed records with known ids); fall back to a generated id.
    const bean = { ...(body || {}), id: body?.id ?? ('bean-injected-' + Date.now()) }
    mockBeans.push(bean)
    return json(bean, 201)
  }

  if (path === '/api/v1/test/add-grinder' && method === 'POST') {
    // Honor a client-supplied id (tests use this to seed records with known ids); fall back to a generated id.
    const grinder = { ...(body || {}), id: body?.id ?? ('grinder-injected-' + Date.now()) }
    mockGrinders.push(grinder)
    return json(grinder, 201)
  }

  if (path.match(/^\/api\/v1\/test\/add-batch\/[^/]+$/) && method === 'POST') {
    const beanId = decodeURIComponent(path.split('/').pop())
    // Honor a client-supplied id; fall back to a generated id.
    const batch = { ...(body || {}), id: body?.id ?? ('batch-injected-' + Date.now()) }
    mockBeanBatches[beanId] = [...(mockBeanBatches[beanId] || []), batch]
    return json(batch, 201)
  }

  // Beans
  if (path === '/api/v1/beans' && method === 'GET') {
    beansGetCount++
    if (beansFailNextGet) {
      beansFailNextGet = false
      return json({ error: 'Simulated failure' }, 500)
    }
    return json(mockBeans)
  }
  if (path === '/api/v1/beans' && method === 'POST') {
    if (body) {
      const bean = { id: 'bean-' + Date.now(), ...body }
      mockBeans.push(bean)
      return json(bean, 201)
    }
    return json({ error: 'No body' }, 400)
  }
  if (path.match(/^\/api\/v1\/beans\/[^/]+\/batches$/) && method === 'GET') {
    const beanId = decodeURIComponent(path.split('/')[4])
    return json(mockBeanBatches[beanId] || [])
  }
  if (path.match(/^\/api\/v1\/beans\/[^/]+\/batches$/) && method === 'POST') {
    const batch = { id: 'batch-' + Date.now(), ...body }
    return json(batch, 201)
  }
  if (path.match(/^\/api\/v1\/beans\/[^/]+$/) && method === 'GET') {
    const id = decodeURIComponent(path.split('/').pop())
    const bean = mockBeans.find(b => b.id === id)
    return bean ? json(bean) : json({ error: 'Not found' }, 404)
  }
  if (path.match(/^\/api\/v1\/beans\/[^/]+$/) && method === 'PUT') {
    const id = decodeURIComponent(path.split('/').pop())
    const bean = mockBeans.find(b => b.id === id)
    if (!bean) return json({ error: 'Not found' }, 404)
    if (body) Object.assign(bean, body)
    return json(bean)
  }

  // Grinders
  if (path === '/api/v1/grinders' && method === 'GET') {
    grindersGetCount++
    if (grindersFailNextGet) {
      grindersFailNextGet = false
      return json({ error: 'Simulated failure' }, 500)
    }
    return json(mockGrinders)
  }
  if (path === '/api/v1/grinders' && method === 'POST') {
    if (body) {
      const grinder = { id: 'grinder-' + Date.now(), ...body }
      mockGrinders.push(grinder)
      return json(grinder, 201)
    }
    return json({ error: 'No body' }, 400)
  }
  if (path.match(/^\/api\/v1\/grinders\/[^/]+$/) && method === 'GET') {
    const id = decodeURIComponent(path.split('/').pop())
    const grinder = mockGrinders.find(g => g.id === id)
    return grinder ? json(grinder) : json({ error: 'Not found' }, 404)
  }
  if (path.match(/^\/api\/v1\/grinders\/[^/]+$/) && method === 'PUT') {
    const id = decodeURIComponent(path.split('/').pop())
    const grinder = mockGrinders.find(g => g.id === id)
    if (!grinder) return json({ error: 'Not found' }, 404)
    if (body) Object.assign(grinder, body)
    return json(grinder)
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
