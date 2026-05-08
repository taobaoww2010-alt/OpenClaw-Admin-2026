import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useConnectionStore } from './connection'
import type { ModelInfo } from '@/api/types'

export const useModelStore = defineStore('model', () => {
  const models = ref<ModelInfo[]>([])
  const loading = ref(false)
  const lastError = ref<string | null>(null)

  // Obtain RPC interface via the connection store
  function getRpc() {
    const connStore = useConnectionStore()
    return connStore.getRpc()
  }

  async function fetchModels() {
    loading.value = true
    lastError.value = null
    try {
      models.value = await getRpc()!.listModels()
    } catch (error) {
      models.value = []
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[ModelStore] fetchModels failed:', error)
    } finally {
      loading.value = false
    }
  }

  return {
    models,
    loading,
    lastError,
    fetchModels,
  }
})
