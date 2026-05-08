<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useOfficeStore } from '@/stores/office'
import { useAgentStore } from '@/stores/agent'
import { useChatStore } from '@/stores/chat'
import { useConnectionStore } from '@/stores/connection'

const router = useRouter()
const officeStore = useOfficeStore()
const agentStore = useAgentStore()
const chatStore = useChatStore()
const connectionStore = useConnectionStore()

const loading = ref(true)
const svgRef = ref<SVGSVGElement | null>(null)
const containerWidth = ref(800)
const containerHeight = ref(280)

// Simplified scene dimensions
const SCENE_W = 1800
const SCENE_H = 700

// Agent colors
const agentColors = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#6366f1',
]

interface MiniChar {
  agentId: string
  name: string
  x: number
  y: number
  targetX: number
  targetY: number
  color: string
  status: 'idle' | 'walking' | 'working'
  statusText: string
  phase: string
}

const characters = ref<MiniChar[]>([])
const animFrame = ref<number | null>(null)

// Rooms data (simplified from MyWorldPage)
const rooms = [
  { id: 'reception', name: '前台接待', x: 50, y: 20, w: 1700, h: 120, color: '#e8f4f8', label: true },
  { id: 'office-1', name: '办公区 A', x: 50, y: 170, w: 320, h: 160, color: '#f0f5ff' },
  { id: 'office-2', name: '办公区 B', x: 400, y: 170, w: 320, h: 160, color: '#f0f5ff' },
  { id: 'office-3', name: '办公区 C', x: 750, y: 170, w: 320, h: 160, color: '#f0f5ff' },
  { id: 'office-4', name: '办公区 D', x: 50, y: 360, w: 320, h: 160, color: '#f0f5ff' },
  { id: 'office-5', name: '办公区 E', x: 400, y: 360, w: 320, h: 160, color: '#f0f5ff' },
  { id: 'office-6', name: '办公区 F', x: 750, y: 360, w: 320, h: 160, color: '#f0f5ff' },
  { id: 'meeting', name: '会议室', x: 1150, y: 170, w: 260, h: 140, color: '#fff7e6' },
  { id: 'pantry', name: '茶水间', x: 1150, y: 340, w: 260, h: 120, color: '#f6ffed' },
  { id: 'open-desk', name: '开放办公区', x: 1480, y: 170, w: 270, h: 290, color: '#f9f0ff' },
]

// Scale to fit container
function scaleX(x: number): number {
  return (x / SCENE_W) * containerWidth.value
}
function scaleY(y: number): number {
  return (y / SCENE_H) * containerHeight.value
}
function scaleSize(s: number): number {
  return (s / SCENE_W) * containerWidth.value
}

const eventCleanups: Array<() => void> = []

function initCharacters() {
  const agents = officeStore.officeAgents
  if (!agents || agents.length === 0) return

  const deskRooms = rooms.filter(r => r.id.startsWith('office-') || r.id === 'open-desk')

  characters.value = agents.map((agent, index) => {
    const room = (deskRooms.length > 0 ? deskRooms[index % deskRooms.length] : rooms[0])!
    const cx = room.x + room.w * 0.2 + Math.random() * room.w * 0.6
    const cy = room.y + room.h * 0.2 + Math.random() * room.h * 0.6
    const isActive = agent.status === 'working'

    return {
      agentId: agent.id,
      name: agent.name || agent.id,
      x: cx,
      y: cy,
      targetX: isActive ? cx : cx,
      targetY: isActive ? cy : cy,
      color: agentColors[index % agentColors.length] || '#888',
      status: isActive ? 'working' as const : 'idle' as const,
      statusText: isActive ? '工作中' : '空闲',
      phase: '',
    }
  })
}

function updateAnimation() {
  if (!characters.value) return

  characters.value.forEach((char) => {
    if (char.status === 'walking') {
      const dx = char.targetX - char.x
      const dy = char.targetY - char.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const speed = 3

      if (dist <= speed) {
        char.x = char.targetX
        char.y = char.targetY
        char.status = 'idle'
        char.statusText = '空闲'
      } else {
        char.x += (dx / dist) * speed
        char.y += (dy / dist) * speed
      }
    }

    // Sync with agent store status
    const agent = officeStore.officeAgents?.find(a => a.id === char.agentId)
    if (agent) {
      const agentStatus = chatStore.getOrCreateAgentStatus(char.agentId)
      const isActivePhase = agentStatus.phase !== 'idle' && agentStatus.phase !== 'done' && agentStatus.phase !== 'error' && agentStatus.phase !== 'aborted'

      if (isActivePhase && char.status !== 'walking') {
        char.status = 'working'
        char.statusText = phaseLabel(agentStatus.phase)
        char.phase = agentStatus.phase
      } else if (!isActivePhase && char.status !== 'walking') {
        char.status = agent.status === 'working' ? 'working' : 'idle'
        char.statusText = agent.status === 'working' ? '工作中' : '空闲'
        char.phase = ''
      }
    }
  })

  animFrame.value = requestAnimationFrame(updateAnimation)
}

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    sending: '发送中',
    thinking: '思考中',
    tool: '调用工具',
    replying: '回复中',
  }
  return map[phase] || phase
}

function handleClickAgent(agentId: string) {
  router.push({ name: 'BossWorld' })
}

function goToFullWorld() {
  router.push({ name: 'BossWorld' })
}

// Handle resize
function updateSize() {
  if (svgRef.value?.parentElement) {
    containerWidth.value = svgRef.value.parentElement.clientWidth
    containerHeight.value = Math.min(320, Math.max(200, containerWidth.value * 0.18))
  }
}

let resizeObs: ResizeObserver | null = null

onMounted(async () => {
  await Promise.all([
    officeStore.loadOfficeData(),
    agentStore.fetchAgents(),
  ])

  initCharacters()
  loading.value = false

  updateSize()
  resizeObs = new ResizeObserver(updateSize)
  if (svgRef.value?.parentElement) {
    resizeObs.observe(svgRef.value.parentElement)
  }

  updateAnimation()
})

onUnmounted(() => {
  if (animFrame.value) cancelAnimationFrame(animFrame.value)
  if (resizeObs) resizeObs.disconnect()
  eventCleanups.forEach(fn => fn())
})
</script>

<template>
  <div class="mini-office-scene" style="position: relative; width: 100%; overflow: hidden; border-radius: 8px;">
    <div v-if="loading" style="display: flex; align-items: center; justify-content: center; height: 200px; color: #999; font-size: 13px;">
      加载中...
    </div>
    <svg
      v-else
      ref="svgRef"
      :width="containerWidth"
      :height="containerHeight"
      :viewBox="`0 0 ${containerWidth} ${containerHeight}`"
      style="display: block; background: #fafafa; cursor: pointer;"
      @click="goToFullWorld"
    >
      <!-- Rooms -->
      <g v-for="room in rooms" :key="room.id">
        <rect
          :x="scaleX(room.x)" :y="scaleY(room.y)"
          :width="scaleSize(room.w)" :height="scaleSize(room.h)"
          :fill="room.color"
          :stroke="room.id.startsWith('office-') ? '#d6e4ff' : '#e8e8e8'"
          stroke-width="1"
          rx="3"
        />
        <text
          v-if="room.label"
          :x="scaleX(room.x + room.w / 2)"
          :y="scaleY(room.y + room.h / 2)"
          text-anchor="middle"
          :font-size="Math.max(9, scaleSize(18))"
          fill="#999"
        >{{ room.name }}</text>
      </g>

      <!-- Agents -->
      <g v-for="char in characters" :key="char.agentId">
        <!-- Status glow -->
        <circle
          :cx="scaleX(char.x)" :cy="scaleY(char.y)"
          :r="scaleSize(char.status === 'working' ? 18 : 14)"
          :fill="char.status === 'working' ? char.color + '20' : 'transparent'"
        />
        <!-- Agent dot -->
        <circle
          :cx="scaleX(char.x)" :cy="scaleY(char.y)"
          :r="scaleSize(char.status === 'working' ? 8 : 6)"
          :fill="char.color"
          :stroke="char.status === 'working' ? '#fff' : 'none'"
          :stroke-width="char.status === 'working' ? 2 : 0"
          class="agent-dot"
          :class="{ 'is-working': char.status === 'working' }"
        />
        <!-- Agent name -->
        <text
          :x="scaleX(char.x)" :y="scaleY(char.y) - scaleSize(12)"
          text-anchor="middle"
          :font-size="Math.max(8, scaleSize(11))"
          fill="#333"
          font-weight="500"
        >{{ char.name }}</text>
        <!-- Status text -->
        <text
          v-if="char.status === 'working'"
          :x="scaleX(char.x)" :y="scaleY(char.y) + scaleSize(16)"
          text-anchor="middle"
          :font-size="Math.max(7, scaleSize(9))"
          :fill="char.color"
        >{{ char.statusText }}</text>
      </g>

      <!-- "点击查看完整场景" hint at bottom -->
      <text
        :x="containerWidth / 2" :y="containerHeight - scaleSize(8)"
        text-anchor="middle"
        :font-size="Math.max(8, scaleSize(10))"
        fill="#bbb"
        style="pointer-events: none;"
      >点击进入虚拟公司全屏视图 →</text>
    </svg>
  </div>
</template>

<style scoped>
.mini-office-scene {
  border: 1px solid var(--border-color, #f0f0f0);
  background: #fafafa;
}

.agent-dot {
  transition: cx 0.3s ease, cy 0.3s ease;
  cursor: pointer;
}

.agent-dot:hover {
  filter: brightness(1.2);
}

.agent-dot.is-working {
  animation: pulse-glow 1.5s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
</style>
