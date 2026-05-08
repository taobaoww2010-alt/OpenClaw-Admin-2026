import { computed, onMounted, onUnmounted } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useMonitorStore } from '@/stores/monitor'
import type { RPCEvent, AgentEvent } from '@/api/types'

export function useEventStream(eventTypes?: string[]) {
  const connectionStore = useConnectionStore()
  const monitorStore = useMonitorStore()
  let cleanup: (() => void) | null = null

  const filteredEvents = computed(() => {
    if (!eventTypes || eventTypes.length === 0) return monitorStore.events
    return monitorStore.events.filter((e) => eventTypes.includes(e.event))
  })

  onMounted(() => {
    cleanup = connectionStore.subscribeWs('event', (evt: unknown) => {
      const rpcEvent = evt as RPCEvent
      const agentEvent: AgentEvent = {
        event: rpcEvent.event,
        payload: rpcEvent.payload,
        seq: rpcEvent.seq,
        timestamp: Date.now(),
      }
      monitorStore.addEvent(agentEvent)
    })
  })

  onUnmounted(() => {
    cleanup?.()
  })

  return {
    events: filteredEvents,
    clear: monitorStore.clearEvents,
    paused: monitorStore.paused,
  }
}
