import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useConnectionStore } from './connection'
import type { Channel, ChannelAuthParams, PairParams } from '@/api/types'

export const useChannelStore = defineStore('channel', () => {
  const channels = ref<Channel[]>([])
  const loading = ref(false)

  // Replace wsStore with a local getRpc() helper bound to the connection store
  function getRpc() {
    const connStore = useConnectionStore()
    return connStore.getRpc()
  }

  async function fetchChannels() {
    loading.value = true
    try {
      channels.value = await getRpc()!.listChannels()
    } catch (error) {
      channels.value = []
      console.error('[ChannelStore] fetchChannels failed:', error)
    } finally {
      loading.value = false
    }
  }

  async function authChannel(params: ChannelAuthParams) {
    return await getRpc()!.authChannel(params)
  }

  async function pairChannel(params: PairParams) {
    await getRpc()!.pairChannel(params)
    await fetchChannels()
  }

  return {
    channels,
    loading,
    fetchChannels,
    authChannel,
    pairChannel,
  }
})
