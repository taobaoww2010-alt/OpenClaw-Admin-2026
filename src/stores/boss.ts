import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'

// ============ Types ============

export interface BossAgent {
  id: string
  name: string
  role?: string
  avatar?: string
  model?: string
  status: string
  platform?: 'openclaw' | 'hermes'
  provider?: string
  baseUrl?: string
  total_tasks: number
  completed_tasks: number
  failed_tasks: number
  last_activity?: number
  created_at: number
  updated_at: number
}

export interface BossTask {
  id: string
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'review' | 'done'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  agent_id?: string
  assigned_to?: string
  category?: string
  due_date?: number
  created_by?: string
  created_at: number
  updated_at: number
  completed_at?: number
}

export interface BossAlert {
  id: string
  title: string
  message?: string
  level: 'info' | 'warning' | 'error' | 'critical'
  source?: string
  agent_id?: string
  task_id?: string
  resolved: number
  resolved_at?: number
  resolved_by?: string
  created_at: number
}

export interface BossReport {
  id: string
  date: string
  title?: string
  content?: string
  summary?: string
  metrics: Record<string, unknown>
  generated_by?: string
  created_at: number
}

export interface DashboardStats {
  totalAgents: number
  activeAgents: number
  totalTasks: number
  todoTasks: number
  inProgressTasks: number
  doneTasks: number
  unresolvedAlerts: number
  criticalAlerts: number
  todayCompleted: number
}

// ============ API Helper ============

function bossApi(path: string, options?: RequestInit): Promise<any> {
  const authStore = useAuthStore()
  const token = authStore.getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...options?.headers as any }
  if (token) headers['Authorization'] = `Bearer ${token}`

  return fetch(`/api/boss${path}`, { ...options, headers }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || res.statusText)
    }
    return res.json()
  })
}

// ============ Dispatcher Types ============

export interface DispatchSubTask {
  title: string
  description: string
  category: string
  assignedWorkerId?: string
  masterController: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  dependencies: string[]
}

export interface DispatchResult {
  masterController: string
  intent: string
  category: string
  subTasks: DispatchSubTask[]
  workerCount: number
  availableWorkers: Array<{ id: string; name: string; role?: string }>
}

export interface PendingDispatch {
  id: string
  command: string
  result: DispatchResult
  createdAt: number
}

// ============ Store ============

export const useBossStore = defineStore('boss', () => {
  // Dashboard
  const stats = ref<DashboardStats>({ totalAgents: 0, activeAgents: 0, totalTasks: 0, todoTasks: 0, inProgressTasks: 0, doneTasks: 0, unresolvedAlerts: 0, criticalAlerts: 0, todayCompleted: 0 })

  // Agents
  const agents = ref<BossAgent[]>([])
  const selectedAgent = ref<BossAgent | null>(null)

  // Tasks
  const tasks = ref<BossTask[]>([])
  const taskBoard = ref<Record<string, BossTask[]>>({ todo: [], in_progress: [], review: [], done: [] })
  const selectedTask = ref<BossTask | null>(null)

  // Alerts
  const alerts = ref<BossAlert[]>([])
  const unresolvedAlerts = computed(() => alerts.value.filter(a => !a.resolved))

  // Reports
  const reports = ref<BossReport[]>([])
  const latestReport = computed(() => reports.value[0] || null)

  // Dispatcher
  const pendingDispatches = ref<PendingDispatch[]>([])
  const currentDispatch = ref<PendingDispatch | null>(null)
  const dispatching = ref(false)

  // State
  const loading = ref(false)
  const error = ref<string | null>(null)

  // ============ Dashboard ============

  async function fetchStats() {
    loading.value = true
    error.value = null
    try {
      const data = await bossApi('/stats')
      stats.value = data.stats
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  // ============ Agents ============

  async function fetchAgents() {
    loading.value = true
    error.value = null
    try {
      const data = await bossApi('/agents')
      agents.value = data.agents || []
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function createAgent(agent: Partial<BossAgent>) {
    loading.value = true
    error.value = null
    try {
      await bossApi('/agents', { method: 'POST', body: JSON.stringify(agent) })
      await fetchAgents()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateAgent(id: string, updates: Partial<BossAgent>) {
    loading.value = true
    error.value = null
    try {
      await bossApi(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(updates) })
      await fetchAgents()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteAgent(id: string) {
    loading.value = true
    error.value = null
    try {
      await bossApi(`/agents/${id}`, { method: 'DELETE' })
      await fetchAgents()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  // ============ Tasks ============

  async function fetchTasks(filters?: { status?: string; agent_id?: string; priority?: string; category?: string }) {
    loading.value = true
    error.value = null
    try {
      const params = new URLSearchParams()
      if (filters) {
        for (const [k, v] of Object.entries(filters)) {
          if (v) params.set(k, v)
        }
      }
      const data = await bossApi(`/tasks?${params.toString()}`)
      tasks.value = data.tasks || []
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchTaskBoard() {
    loading.value = true
    error.value = null
    try {
      const data = await bossApi('/tasks/board')
      taskBoard.value = data.board || { todo: [], in_progress: [], review: [], done: [] }
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function createTask(task: Partial<BossTask>) {
    loading.value = true
    error.value = null
    try {
      await bossApi('/tasks', { method: 'POST', body: JSON.stringify(task) })
      await fetchTasks()
      await fetchTaskBoard()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateTask(id: string, updates: Partial<BossTask>) {
    loading.value = true
    error.value = null
    try {
      await bossApi(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(updates) })
      await fetchTasks()
      await fetchTaskBoard()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteTask(id: string) {
    loading.value = true
    error.value = null
    try {
      await bossApi(`/tasks/${id}`, { method: 'DELETE' })
      await fetchTasks()
      await fetchTaskBoard()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  // ============ Alerts ============

  async function fetchAlerts(filters?: { level?: string; resolved?: number }) {
    loading.value = true
    error.value = null
    try {
      const params = new URLSearchParams()
      if (filters) {
        for (const [k, v] of Object.entries(filters)) {
          if (v !== undefined) params.set(k, String(v))
        }
      }
      const data = await bossApi(`/alerts?${params.toString()}`)
      alerts.value = data.alerts || []
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function createAlert(alert: Partial<BossAlert>) {
    loading.value = true
    error.value = null
    try {
      await bossApi('/alerts', { method: 'POST', body: JSON.stringify(alert) })
      await fetchAlerts()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function resolveAlert(id: string, resolvedBy?: string) {
    loading.value = true
    error.value = null
    try {
      await bossApi(`/alerts/${id}/resolve`, { method: 'PUT', body: JSON.stringify({ resolved_by: resolvedBy || '' }) })
      await fetchAlerts()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteAlert(id: string) {
    loading.value = true
    error.value = null
    try {
      await bossApi(`/alerts/${id}`, { method: 'DELETE' })
      await fetchAlerts()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  // ============ Reports ============

  async function fetchReports() {
    loading.value = true
    error.value = null
    try {
      const data = await bossApi('/reports')
      reports.value = data.reports || []
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchReportByDate(date: string) {
    loading.value = true
    error.value = null
    try {
      const data = await bossApi(`/reports/${date}`)
      return data.report
    } catch (e: any) {
      error.value = e.message
      return null
    } finally {
      loading.value = false
    }
  }

  async function createReport(report: Partial<BossReport>) {
    loading.value = true
    error.value = null
    try {
      await bossApi('/reports', { method: 'POST', body: JSON.stringify(report) })
      await fetchReports()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteReport(id: string) {
    loading.value = true
    error.value = null
    try {
      await bossApi(`/reports/${id}`, { method: 'DELETE' })
      await fetchReports()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  // ============ Bulk Load ============

  async function loadAll() {
    await Promise.all([fetchStats(), fetchAgents(), fetchTasks(), fetchAlerts(), fetchReports()])
  }

  // ============ Dispatcher ============

  async function dispatchCommand(command: string): Promise<DispatchResult> {
    dispatching.value = true
    error.value = null
    try {
      const data = await bossApi('/dispatch', {
        method: 'POST',
        body: JSON.stringify({ command }),
      })
      const pending: PendingDispatch = {
        id: data.dispatchId,
        command,
        result: data.result,
        createdAt: Date.now(),
      }
      pendingDispatches.value.unshift(pending)
      currentDispatch.value = pending
      return data.result
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      dispatching.value = false
    }
  }

  async function confirmDispatchAction(dispatchId: string, adjustments?: DispatchSubTask[]): Promise<string[]> {
    error.value = null
    try {
      const data = await bossApi(`/dispatch/${dispatchId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ subTasks: adjustments }),
      })
      currentDispatch.value = null
      return data.taskIds || []
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  function cancelDispatchAction(dispatchId: string) {
    pendingDispatches.value = pendingDispatches.value.filter(d => d.id !== dispatchId)
    if (currentDispatch.value?.id === dispatchId) {
      currentDispatch.value = null
    }
  }

  return {
    stats, agents, selectedAgent, tasks, taskBoard, selectedTask,
    alerts, unresolvedAlerts, reports, latestReport,
    pendingDispatches, currentDispatch, dispatching,
    loading, error,
    fetchStats, loadAll,
    fetchAgents, createAgent, updateAgent, deleteAgent,
    fetchTasks, fetchTaskBoard, createTask, updateTask, deleteTask,
    fetchAlerts, createAlert, resolveAlert, deleteAlert,
    fetchReports, fetchReportByDate, createReport, deleteReport,
    dispatchCommand, confirmDispatchAction, cancelDispatchAction,
  }
})
