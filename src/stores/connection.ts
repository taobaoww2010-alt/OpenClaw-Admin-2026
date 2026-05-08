import { ref, shallowRef, watch, computed } from 'vue'
import { defineStore } from 'pinia'
import { OpenClawWebSocket } from '@/api/websocket'
import { RPCClient } from '@/api/rpc-client'
import { ConnectionState } from '@/api/types'
import { HermesApiClient } from '@/api/hermes/client'
import type { HermesStatus } from '@/api/hermes/types'
import { useAuthStore } from './auth'

export interface OpenClawConnectionState {
  connected: boolean
  connecting: boolean
  state: ConnectionState
  error: string | null
  version: string | null
  methods: string[]
  updateAvailable: { currentVersion: string; latestVersion: string; channel: string } | null
  reconnectAttempts: number
}

export interface HermesConnectionState {
  connected: boolean
  connecting: boolean
  error: string | null
  status: HermesStatus | null
  reconnectAttempts: number
}

export interface ConnectionConfig {
  hermes: {
    webUrl: string
    apiUrl: string
    apiKey: string
  }
  hermesInitialized: boolean
  hermesHasApiKey: boolean
  hermesAutoStartDashboard: boolean
  hermesDashboardStatus: { running: boolean; pid: number | null; port: number | null; error: string | null }
}

const STORAGE_KEY_CONFIG = 'daoyi_connection_config'

function readStoredConfig(): ConnectionConfig {
  const raw = localStorage.getItem(STORAGE_KEY_CONFIG)
  if (!raw) {
    return {
      hermes: { webUrl: 'http://localhost:9119', apiUrl: 'http://localhost:8642', apiKey: '' },
      hermesInitialized: false,
      hermesHasApiKey: false,
      hermesAutoStartDashboard: false,
      hermesDashboardStatus: { running: false, pid: null, port: null, error: null },
    }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ConnectionConfig>
    return {
      hermes: {
        webUrl: parsed.hermes?.webUrl || 'http://localhost:9119',
        apiUrl: parsed.hermes?.apiUrl || 'http://localhost:8642',
        apiKey: parsed.hermes?.apiKey || '',
      },
      hermesInitialized: parsed.hermesInitialized || false,
      hermesHasApiKey: parsed.hermesHasApiKey || false,
      hermesAutoStartDashboard: parsed.hermesAutoStartDashboard || false,
      hermesDashboardStatus: parsed.hermesDashboardStatus || { running: false, pid: null, port: null, error: null },
    }
  } catch {
    return {
      hermes: { webUrl: 'http://localhost:9119', apiUrl: 'http://localhost:8642', apiKey: '' },
      hermesInitialized: false,
      hermesHasApiKey: false,
      hermesAutoStartDashboard: false,
      hermesDashboardStatus: { running: false, pid: null, port: null, error: null },
    }
  }
}

export const useConnectionStore = defineStore('connection', () => {
  const openclaw = ref<OpenClawConnectionState>({
    connected: false,
    connecting: false,
    state: ConnectionState.DISCONNECTED,
    error: null,
    version: null,
    methods: [],
    updateAvailable: null,
    reconnectAttempts: 0,
  })

  const hermes = ref<HermesConnectionState>({
    connected: false,
    connecting: false,
    error: null,
    status: null,
    reconnectAttempts: 0,
  })

  const config = ref<ConnectionConfig>(readStoredConfig())

  let ws: OpenClawWebSocket | null = null
  let rpc: RPCClient | null = null
  let wsListenersBound = false
  const wsPersistentListeners = new Map<string, Set<(...args: unknown[]) => void>>()

  let hermesClient: HermesApiClient | null = null
  let hermesReconnectTimer: ReturnType<typeof setTimeout> | null = null
  const MAX_RECONNECT_ATTEMPTS = 10
  const RECONNECT_BASE_DELAY = 2000

  watch(config, (val) => {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(val))
  }, { deep: true })

  const bothConnected = computed(() => openclaw.value.connected && hermes.value.connected)
  const anyConnected = computed(() => openclaw.value.connected || hermes.value.connected)

  function createWebSocket(): OpenClawWebSocket {
    const authStore = useAuthStore()
    return new OpenClawWebSocket({
      getToken: () => authStore.getToken(),
    })
  }

  function bindWsListeners() {
    if (wsListenersBound || !ws) return
    wsListenersBound = true

    ws.on('stateChange', (newState: unknown) => {
      openclaw.value.state = newState as ConnectionState
    })

    ws.on('reconnecting', (attempts: unknown) => {
      openclaw.value.reconnectAttempts = attempts as number
    })

    ws.on('error', (error: unknown) => {
      openclaw.value.error = error as string
    })

    ws.on('failed', (reason: unknown) => {
      openclaw.value.error = reason as string
    })

    ws.on('connected', (payload: unknown) => {
      const row = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
      const features = row.features as Record<string, unknown> | undefined
      const methods = features?.methods
      if (Array.isArray(methods)) {
        openclaw.value.methods = methods.filter((m): m is string => typeof m === 'string').map(m => m.trim()).filter(Boolean)
      }
      openclaw.value.version = typeof row.version === 'string' ? row.version : null
      const updateInfo = row.updateAvailable
      if (updateInfo && typeof updateInfo === 'object' && 'currentVersion' in updateInfo && 'latestVersion' in updateInfo) {
        openclaw.value.updateAvailable = updateInfo as { currentVersion: string; latestVersion: string; channel: string }
      } else {
        openclaw.value.updateAvailable = null
      }
    })

    ws.on('disconnected', (code: unknown, reason: unknown) => {
      if (openclaw.value.state !== ConnectionState.DISCONNECTED && openclaw.value.state !== ConnectionState.FAILED) {
        openclaw.value.error = `Connection closed (code: ${String(code)}, reason: ${String(reason || 'n/a')})`
      }
    })
  }

  function connectOpenClaw() {
    openclaw.value.error = null
    openclaw.value.connecting = true

    ws = createWebSocket()
    rpc = new RPCClient(ws)
    wsListenersBound = false
    bindWsListeners()

    wsPersistentListeners.forEach((handlers, event) => {
      handlers.forEach((handler) => ws!.on(event, handler))
    })

    ws.on('connected', () => {
      openclaw.value.connected = true
      openclaw.value.connecting = false
    })

    ws.on('disconnected', () => {
      openclaw.value.connected = false
      openclaw.value.connecting = false
    })

    ws.on('failed', () => {
      openclaw.value.connected = false
      openclaw.value.connecting = false
    })

    ws.connect()
  }

  function disconnectOpenClaw() {
    ws?.disconnect()
    ws = null
    rpc = null
    wsListenersBound = false
    openclaw.value.connected = false
    openclaw.value.connecting = false
    openclaw.value.state = ConnectionState.DISCONNECTED
    openclaw.value.version = null
    openclaw.value.methods = []
    openclaw.value.updateAvailable = null
  }

  function getRpc(): RPCClient | null {
    return rpc
  }

  function supportsAnyMethod(methods: string[]): boolean {
    if (openclaw.value.methods.length === 0) return false
    const methodSet = new Set(openclaw.value.methods)
    return methods.some((method) => methodSet.has(method))
  }

  function subscribeWs(event: string, handler: (...args: unknown[]) => void): () => void {
    if (!wsPersistentListeners.has(event)) {
      wsPersistentListeners.set(event, new Set())
    }
    wsPersistentListeners.get(event)!.add(handler)
    ws?.on(event, handler)
    return () => {
      wsPersistentListeners.get(event)?.delete(handler)
      ws?.off(event, handler)
    }
  }

  function getHermesClient(): HermesApiClient | null {
    if (!hermes.value.connected) return null
    return hermesClient
  }

  async function getHermesClientAsync(): Promise<HermesApiClient> {
    if (!hermes.value.connected) {
      if (!config.value.hermesInitialized) {
        await loadHermesConfig()
      }
      await connectHermes()
    }
    if (!hermes.value.connected) {
      throw new Error('Hermes connection failed')
    }
    return hermesClient!
  }

  async function loadHermesConfig(): Promise<void> {
    try {
      const response = await fetch('/api/hermes/connect')
      if (response.ok) {
        const data = await response.json()
        config.value.hermes = {
          webUrl: data.webUrl || config.value.hermes.webUrl,
          apiUrl: data.apiUrl || config.value.hermes.apiUrl,
          apiKey: '',
        }
        config.value.hermesHasApiKey = !!data.hasApiKey
        config.value.hermesAutoStartDashboard = !!data.autoStartDashboard
        if (data.dashboard) {
          config.value.hermesDashboardStatus = data.dashboard
        }
        config.value.hermesInitialized = true

        if (!hermes.value.connected && !hermes.value.connecting) {
          connectHermes().catch(() => {})
        }
      }
    } catch (error) {
      console.warn('[Connection] Failed to load Hermes config:', error)
    }
  }

  async function connectHermes(): Promise<boolean> {
    if (hermes.value.connecting || hermes.value.connected) return hermes.value.connected

    hermes.value.connecting = true
    hermes.value.error = null
    hermes.value.reconnectAttempts = 0

    try {
      hermesClient = new HermesApiClient(undefined, config.value.hermes.apiKey)
      const status = await hermesClient.getStatus()
      hermes.value.status = status
      hermes.value.connected = true
      return true
    } catch (error) {
      hermes.value.connected = false
      hermes.value.error = error instanceof Error ? error.message : String(error)
      scheduleHermesReconnect()
      return false
    } finally {
      hermes.value.connecting = false
    }
  }

  function disconnectHermes() {
    clearHermesReconnectTimer()
    hermesClient = null
    hermes.value.connected = false
    hermes.value.connecting = false
    hermes.value.error = null
    hermes.value.status = null
  }

  function scheduleHermesReconnect() {
    clearHermesReconnectTimer()
    if (hermes.value.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      return
    }
    const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(1.5, hermes.value.reconnectAttempts), 30000)
    hermes.value.reconnectAttempts++
    hermesReconnectTimer = setTimeout(() => connectHermes(), delay)
  }

  function clearHermesReconnectTimer() {
    if (hermesReconnectTimer) {
      clearTimeout(hermesReconnectTimer)
      hermesReconnectTimer = null
    }
  }

  async function updateHermesApiKey(apiKey: string, validate = true): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch('/api/hermes/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, validate }),
      })
      const result = await response.json()
      if (result.ok) {
        config.value.hermes = { ...config.value.hermes, apiKey }
        if (hermes.value.connected) {
          disconnectHermes()
          await connectHermes()
        }
        return { ok: true }
      }
      return { ok: false, error: result.error || 'Failed to update API Key' }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async function updateHermesAutoStartDashboard(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch('/api/hermes/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoStartDashboard: enabled }),
      })
      const result = await response.json()
      if (result.ok) {
        config.value.hermesAutoStartDashboard = enabled
        return { ok: true }
      }
      return { ok: false, error: result.error || 'Failed to update' }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async function startHermesDashboard(): Promise<{ ok: boolean; error?: string; pid?: number; port?: number }> {
    try {
      const response = await fetch('/api/hermes/dashboard/start', { method: 'POST' })
      const result = await response.json()
      if (result.ok) {
        config.value.hermesDashboardStatus = { running: true, pid: result.pid, port: result.port, error: null }
        return { ok: true, pid: result.pid, port: result.port }
      }
      config.value.hermesDashboardStatus.error = result.error
      return { ok: false, error: result.error }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      config.value.hermesDashboardStatus.error = errorMsg
      return { ok: false, error: errorMsg }
    }
  }

  async function stopHermesDashboard(): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch('/api/hermes/dashboard/stop', { method: 'POST' })
      const result = await response.json()
      if (result.ok) {
        config.value.hermesDashboardStatus = { running: false, pid: null, port: null, error: null }
        return { ok: true }
      }
      return { ok: false, error: result.error }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async function refreshHermesDashboardStatus(): Promise<void> {
    try {
      const response = await fetch('/api/hermes/dashboard')
      if (response.ok) {
        config.value.hermesDashboardStatus = await response.json()
      }
    } catch {
      // ignore
    }
  }

  async function refreshHermesStatus(): Promise<void> {
    if (!hermesClient) return
    try {
      hermes.value.status = await hermesClient.getStatus()
    } catch {
      // ignore
    }
  }

  async function testHermesConnection(apiUrl: string, apiKey = ''): Promise<{ ok: boolean; status?: HermesStatus; error?: string }> {
    try {
      const testClient = new HermesApiClient(undefined, apiKey)
      const status = await testClient.getStatus()
      return { ok: true, status }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  return {
    openclaw,
    hermes,
    config,
    bothConnected,
    anyConnected,
    connectOpenClaw,
    disconnectOpenClaw,
    getRpc,
    supportsAnyMethod,
    subscribeWs,
    getHermesClient,
    getHermesClientAsync,
    connectHermes,
    disconnectHermes,
    loadHermesConfig,
    updateHermesApiKey,
    updateHermesAutoStartDashboard,
    startHermesDashboard,
    stopHermesDashboard,
    refreshHermesDashboardStatus,
    refreshHermesStatus,
    testHermesConnection,
  }
})
