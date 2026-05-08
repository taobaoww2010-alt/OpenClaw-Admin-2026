import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '../auth'

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

export const useDispatcherStore = defineStore('dispatcher', () => {
  const pendingDispatches = ref<PendingDispatch[]>([])
  const currentDispatch = ref<PendingDispatch | null>(null)
  const dispatching = ref(false)
  const error = ref<string | null>(null)

  async function dispatch(command: string): Promise<DispatchResult> {
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

  async function confirmDispatch(dispatchId: string, adjustments?: DispatchSubTask[]): Promise<string[]> {
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

  function cancelDispatch(dispatchId: string) {
    pendingDispatches.value = pendingDispatches.value.filter(d => d.id !== dispatchId)
    if (currentDispatch.value?.id === dispatchId) {
      currentDispatch.value = null
    }
  }

  return {
    pendingDispatches,
    currentDispatch,
    dispatching,
    error,
    dispatch,
    confirmDispatch,
    cancelDispatch,
  }
})
