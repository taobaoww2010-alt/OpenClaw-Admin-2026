import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useConnectionStore } from './connection'
import type { DeviceNode, NodeInvokeParams } from '@/api/types'

export const useNodeStore = defineStore('node', () => {
  const nodes = ref<DeviceNode[]>([])
  const loading = ref(false)

  const connectionStore = useConnectionStore()

  async function fetchNodes() {
    loading.value = true
    try {
      nodes.value = await connectionStore.getRpc()!.listNodes()
    } catch (error) {
      nodes.value = []
      console.error('[NodeStore] fetchNodes failed:', error)
    } finally {
      loading.value = false
    }
  }

  async function invokeNode(params: NodeInvokeParams) {
    return await connectionStore.getRpc()!.invokeNode(params)
  }

  async function requestPairing(nodeId: string) {
    await connectionStore.getRpc()!.requestNodePairing(nodeId)
  }

  async function approvePairing(nodeId: string, code: string) {
    await connectionStore.getRpc()!.approveNodePairing(nodeId, code)
    await fetchNodes()
  }

  return {
    nodes,
    loading,
    fetchNodes,
    invokeNode,
    requestPairing,
    approvePairing,
  }
})
