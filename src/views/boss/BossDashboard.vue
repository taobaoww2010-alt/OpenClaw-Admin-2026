<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NStatistic, NGrid, NGi, NTag, NSpin, NButton, NAlert, NEmpty, NProgress, NSpace, NTimeline, NTimelineItem, NNumberAnimation } from 'naive-ui'
import { useBossStore } from '@/stores/boss'
import { useCompanyStore } from '@/stores/company'
import type { BossTask, BossAgent } from '@/stores/boss'
import { useAuthStore } from '@/stores/auth'
import MiniOfficeScene from '@/components/boss/MiniOfficeScene.vue'

const router = useRouter()
const bossStore = useBossStore()
const companyStore = useCompanyStore()
const authStore = useAuthStore()
const loading = ref(true)
let refreshTimer: ReturnType<typeof setInterval> | null = null

interface ExecutingTask {
  taskId: string
  runId: string
  status: string
  startedAt: number
  sessionKey: string
}

const executingTasks = ref<ExecutingTask[]>([])
const seeding = ref(false)

onMounted(async () => {
  try {
    await Promise.all([bossStore.loadAll(), companyStore.loadAll()])
    await fetchExecutingTasks()
  } catch (e) {
    console.error('BossDashboard onMounted error:', e)
  } finally {
    loading.value = false
  }
  refreshTimer = setInterval(async () => {
    await Promise.all([bossStore.fetchStats(), companyStore.fetchHealthScore(), companyStore.fetchMetricsSummary()])
    await fetchExecutingTasks()
  }, 10000)
})

async function handleSeedDemo() {
  seeding.value = true
  try {
    await companyStore.seedDemoMetrics()
  } catch (e) {
    console.error('Seed demo error:', e)
  } finally {
    seeding.value = false
  }
}

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

async function fetchExecutingTasks() {
  try {
    const token = authStore.getToken()
    const res = await fetch('/api/boss/execution/tasks', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      executingTasks.value = data.tasks || []
    }
  } catch (e) {
    console.error('Failed to fetch executing tasks:', e)
  }
}

function formatTime(ts?: number): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('zh-CN')
}

function formatRelative(ts?: number): string {
  if (!ts) return '-'
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

function formatDuration(startedAt: number): string {
  const diff = Date.now() - startedAt
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}秒`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}分${secs % 60}秒`
  const hours = Math.floor(mins / 60)
  return `${hours}时${mins % 60}分`
}

function agentStatusColor(status: string): string {
  return status === 'active' ? '#52c41a' : '#999'
}

function alertLevelColor(level: string): string {
  const map: Record<string, string> = { info: '#1890ff', warning: '#faad14', error: '#f5222d', critical: '#cf1322' }
  return map[level] || '#999'
}

function priorityColor(p: string): string {
  const map: Record<string, string> = { low: '#999', medium: '#1890ff', high: '#faad14', urgent: '#f5222d' }
  return map[p] || '#999'
}

const completionRate = computed(() => {
  const total = bossStore.stats.totalTasks
  if (total === 0) return 0
  return Math.round((bossStore.stats.doneTasks / total) * 100)
})

const recentTasks = computed<BossTask[]>(() => {
  return bossStore.tasks.slice(0, 5)
})

const healthColor = computed(() => {
  const t = companyStore.healthScore?.total ?? 0
  if (t >= 80) return '#52c41a'
  if (t >= 60) return '#faad14'
  if (t >= 40) return '#ff7a45'
  return '#f5222d'
})

const healthTagType = computed(() => {
  const t = companyStore.healthScore?.total ?? 0
  if (t >= 80) return 'success'
  if (t >= 60) return 'warning'
  if (t >= 40) return 'error'
  return 'default'
})

const healthLabel = computed(() => {
  const level = companyStore.healthScore?.level
  const map: Record<string, string> = { healthy: '健康', warning: '警告', at_risk: '有风险', critical: '危急' }
  return map[level || ''] || '-'
})

// ===== Business Metrics Computed =====

const summary = computed(() => companyStore.metricsSummary)
const trend = computed(() => companyStore.metricsTrend)

const monthlyProgress = computed(() => {
  const s = summary.value
  if (!s || !s.month.revenue || !companyStore.config.target_revenue_monthly) return 0
  return Math.min(100, Math.round((s.month.revenue / companyStore.config.target_revenue_monthly) * 100))
})

const roasStatus = computed(() => {
  const roas = summary.value?.latest.roas ?? 0
  const target = companyStore.config.roas_target ?? 0
  if (!target) return { value: roas, status: 'neutral', label: '未设目标' }
  if (roas >= target) return { value: roas, status: 'success', label: `${roas.toFixed(1)}x ✓` }
  return { value: roas, status: 'warning', label: `${roas.toFixed(1)}x (目标${target}x)` }
})

const cpaStatus = computed(() => {
  const cpa = summary.value?.latest.cpa ?? 0
  const limit = companyStore.config.cpa_limit ?? 0
  if (!limit) return { value: cpa, status: 'neutral', label: `$${cpa.toFixed(2)}` }
  if (cpa <= limit) return { value: cpa, status: 'success', label: `$${cpa.toFixed(2)} ✓` }
  return { value: cpa, status: 'error', label: `$${cpa.toFixed(2)} ⚠ 超限` }
})

// SVG trend chart dimensions
const trendChartWidth = 600
const trendChartHeight = 180

const trendPathData = computed(() => {
  const points = trend.value
  if (!points || points.length < 2) return { revenue: '', cost: '' }
  const maxVal = Math.max(...points.map(p => Math.max(p.revenue, p.cost)), 1)
  const pad = { top: 10, bottom: 20, left: 10, right: 10 }
  const chartW = trendChartWidth - pad.left - pad.right
  const chartH = trendChartHeight - pad.top - pad.bottom

  const toPoint = (v: number, i: number) => {
    const x = pad.left + (i / (points.length - 1)) * chartW
    const y = pad.top + chartH - (v / maxVal) * chartH
    return `${x},${y}`
  }

  const revPoints = points.map((p, i) => toPoint(p.revenue, i))
  const costPoints = points.map((p, i) => toPoint(p.cost, i))

  return {
    revenue: `M${revPoints.join(' L')}`,
    cost: `M${costPoints.join(' L')}`,
  }
})

const trendDates = computed(() => {
  return trend.value.map(p => p.date.slice(5))
})
</script>

<template>
  <NSpin :show="loading">
    <div class="boss-dashboard" style="padding: 20px;">
      <!-- 顶部统计卡片 -->
      <NGrid :cols="8" :x-gap="16" :y-gap="16" responsive="screen" class="mb-4">
        <NGi>
          <NCard :bordered="false" size="small">
            <NStatistic label="Agent 总数" :value="bossStore.stats.totalAgents" />
          </NCard>
        </NGi>
        <NGi>
          <NCard :bordered="false" size="small">
            <NStatistic label="活跃 Agent">
              <template #default>
                <span style="color: #52c41a;">{{ bossStore.stats.activeAgents }}</span>
              </template>
            </NStatistic>
          </NCard>
        </NGi>
        <NGi>
          <NCard :bordered="false" size="small">
            <NStatistic label="待处理任务" :value="bossStore.stats.todoTasks" />
          </NCard>
        </NGi>
        <NGi>
          <NCard :bordered="false" size="small">
            <NStatistic label="进行中">
              <template #default>
                <span style="color: #1890ff;">{{ bossStore.stats.inProgressTasks }}</span>
              </template>
            </NStatistic>
          </NCard>
        </NGi>
        <NGi>
          <NCard :bordered="false" size="small">
            <NStatistic label="已完成">
              <template #default>
                <span style="color: #52c41a;">{{ bossStore.stats.doneTasks }}</span>
              </template>
            </NStatistic>
          </NCard>
        </NGi>
        <NGi>
          <NCard :bordered="false" size="small">
            <NStatistic label="今日完成" :value="bossStore.stats.todayCompleted" />
          </NCard>
        </NGi>
        <NGi>
          <NCard :bordered="false" size="small">
            <NStatistic label="未处理告警">
              <template #default>
                <span :style="{ color: bossStore.stats.criticalAlerts > 0 ? '#f5222d' : '#faad14' }">
                  {{ bossStore.stats.unresolvedAlerts }}
                </span>
              </template>
            </NStatistic>
          </NCard>
        </NGi>
        <NGi>
          <NCard :bordered="false" size="small">
            <NStatistic label="严重告警">
              <template #default>
                <span style="color: #cf1322;">{{ bossStore.stats.criticalAlerts }}</span>
              </template>
            </NStatistic>
          </NCard>
        </NGi>
      </NGrid>

      <!-- 公司健康度 -->
      <NGrid :cols="4" :x-gap="16" :y-gap="16" responsive="screen" style="margin-bottom: 16px;">
        <NGi>
          <NCard :bordered="false" size="small">
            <NStatistic label="公司健康度">
              <template #default>
                <span :style="{ color: healthColor, fontWeight: 'bold', fontSize: '20px' }">
                  {{ companyStore.healthScore?.total ?? '-' }}%
                </span>
              </template>
            </NStatistic>
            <div style="margin-top: 6px;">
              <NTag :type="healthTagType" size="small">{{ healthLabel }}</NTag>
            </div>
          </NCard>
        </NGi>
        <NGi>
          <NCard :bordered="false" size="small">
            <NStatistic label="Agent 健康度" :value="companyStore.healthScore?.breakdown.agent_health ?? '-'" />
          </NCard>
        </NGi>
        <NGi>
          <NCard :bordered="false" size="small">
            <NStatistic label="任务健康度" :value="companyStore.healthScore?.breakdown.task_health ?? '-'" />
          </NCard>
        </NGi>
        <NGi>
          <NCard :bordered="false" size="small">
            <NStatistic label="告警健康度" :value="companyStore.healthScore?.breakdown.alert_health ?? '-'" />
          </NCard>
        </NGi>
      </NGrid>

      <!-- 经营指标 -->
      <NCard :bordered="false" size="small" style="margin-bottom: 16px;" v-if="summary">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <span style="font-weight: 600; font-size: 15px;">📊 经营指标</span>
          <NSpace size="small">
            <NButton size="tiny" quaternary @click="companyStore.fetchMetricsSummary()">刷新</NButton>
            <NButton v-if="!summary.today.revenue && !summary.today.cost" size="tiny" :loading="seeding" @click="handleSeedDemo">生成示例数据</NButton>
          </NSpace>
        </div>
        <NGrid :cols="6" :x-gap="12" :y-gap="12">
          <NGi>
            <div style="padding: 8px 12px; background: var(--bg-card-secondary, #f9f9f9); border-radius: 8px;">
              <div style="font-size: 11px; color: #888;">今日收入</div>
              <div style="font-size: 18px; font-weight: 700; color: #52c41a;">
                $<NNumberAnimation :from="0" :to="summary.today.revenue" :precision="2" />
              </div>
            </div>
          </NGi>
          <NGi>
            <div style="padding: 8px 12px; background: var(--bg-card-secondary, #f9f9f9); border-radius: 8px;">
              <div style="font-size: 11px; color: #888;">本周收入</div>
              <div style="font-size: 18px; font-weight: 700;">
                ${{ summary.week.revenue.toFixed(2) }}
              </div>
            </div>
          </NGi>
          <NGi>
            <div style="padding: 8px 12px; background: var(--bg-card-secondary, #f9f9f9); border-radius: 8px;">
              <div style="font-size: 11px; color: #888;">月营收达成</div>
              <div style="font-size: 18px; font-weight: 700;">{{ monthlyProgress }}%</div>
              <NProgress :percentage="monthlyProgress" :height="4" :border-radius="2" style="margin-top: 4px;" />
            </div>
          </NGi>
          <NGi>
            <div style="padding: 8px 12px; background: var(--bg-card-secondary, #f9f9f9); border-radius: 8px;">
              <div style="font-size: 11px; color: #888;">Token 成本(今日)</div>
              <div style="font-size: 18px; font-weight: 700;">
                ${{ summary.today.cost.toFixed(2) }}
              </div>
              <div v-if="summary.today.revenue > 0" style="font-size: 11px; color: #888; margin-top: 2px;">
                ROI {{ (summary.today.revenue / Math.max(summary.today.cost, 0.01)).toFixed(1) }}x
              </div>
            </div>
          </NGi>
          <NGi>
            <div style="padding: 8px 12px; background: var(--bg-card-secondary, #f9f9f9); border-radius: 8px;">
              <div style="font-size: 11px; color: #888;">ROAS</div>
              <div :style="{ fontSize: '18px', fontWeight: 700, color: roasStatus.status === 'success' ? '#52c41a' : roasStatus.status === 'warning' ? '#faad14' : '#888' }">
                {{ roasStatus.label }}
              </div>
            </div>
          </NGi>
          <NGi>
            <div style="padding: 8px 12px; background: var(--bg-card-secondary, #f9f9f9); border-radius: 8px;">
              <div style="font-size: 11px; color: #888;">CPA</div>
              <div :style="{ fontSize: '18px', fontWeight: 700, color: cpaStatus.status === 'error' ? '#f5222d' : cpaStatus.status === 'success' ? '#52c41a' : '#888' }">
                {{ cpaStatus.label }}
              </div>
            </div>
          </NGi>
        </NGrid>
      </NCard>

      <!-- 任务完成度进度条 -->
      <NCard :bordered="false" size="small" style="margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="font-weight: 600; white-space: nowrap;">任务完成度</span>
          <NProgress
            type="line"
            :percentage="completionRate"
            :height="12"
            :border-radius="6"
            :show-indicator="true"
            style="flex: 1;"
          />
        </div>
      </NCard>

      <!-- 快速操作栏 -->
      <NCard :bordered="false" size="small" style="margin-bottom: 16px;">
        <NSpace>
          <NButton type="primary" @click="router.push('/boss/tasks')">任务看板</NButton>
          <NButton type="info" @click="router.push('/boss/alerts')">告警中心</NButton>
          <NButton type="warning" @click="router.push('/boss/reports')">Agent 日报</NButton>
          <NButton @click="router.push('/boss/company-config')">⚙️ 公司配置</NButton>
          <NButton type="success" @click="bossStore.loadAll()">刷新数据</NButton>
        </NSpace>
      </NCard>

      <!-- 错误提示 -->
      <NAlert v-if="bossStore.error" type="error" style="margin-bottom: 16px;">
        {{ bossStore.error }}
      </NAlert>

      <NGrid :cols="2" :x-gap="16" :y-gap="16" responsive="screen">
        <!-- Agent 团队 (Hermes 主控 + OpenClaw Workers) -->
        <NGi>
          <NCard title="数字员工团队" :bordered="false">
            <template #header-extra>
              <NButton size="small" @click="bossStore.fetchAgents()">刷新</NButton>
            </template>
            <div v-if="bossStore.agents.length === 0">
              <NEmpty description="暂无 Agent" />
            </div>

            <!-- Hermes 主控 -->
            <div v-for="agent in bossStore.agents.filter(a => a.platform === 'hermes')" :key="agent.id" style="padding: 10px 0; border-bottom: 1px solid var(--border-color, #f0f0f0);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <strong style="font-size: 14px;">\U0001f9e0 {{ agent.name }}</strong>
                  <NTag type="warning" size="tiny" :bordered="false" style="margin-left: 6px;">主控</NTag>
                  <NTag v-if="agent.role" size="small" type="warning" style="margin-left: 8px;">{{ agent.role }}</NTag>
                </div>
                <NTag size="small" :color="{ color: agentStatusColor(agent.status) }">
                  {{ agent.status }}
                </NTag>
              </div>
              <div v-if="agent.model" style="font-size: 11px; color: #999; margin-top: 4px;">
                模型: {{ agent.model }} | 提供商: {{ agent.provider || 'custom' }}
              </div>
            </div>

            <!-- OpenClaw Workers (缩进显示) -->
            <div v-if="bossStore.agents.filter(a => a.platform === 'openclaw').length > 0" style="margin-top: 8px; padding-left: 20px; border-left: 2px solid #e8e8e8;">
              <div style="font-size: 11px; color: #999; margin-bottom: 8px;">OpenClaw Workers ({{ bossStore.agents.filter(a => a.platform === 'openclaw').length }})</div>
              <div v-for="agent in bossStore.agents.filter(a => a.platform === 'openclaw')" :key="agent.id" style="padding: 6px 0; border-bottom: 1px dashed var(--border-color, #f0f0f0);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <strong>{{ agent.name }}</strong>
                    <NTag type="info" size="tiny" :bordered="false" style="margin-left: 6px;">Worker</NTag>
                    <NTag v-if="agent.role" size="small" type="info" style="margin-left: 8px;">{{ agent.role }}</NTag>
                  </div>
                  <div style="font-size: 11px; color: #999;">
                    {{ agent.completed_tasks }}/{{ agent.total_tasks }} 任务
                  </div>
                </div>
              </div>
            </div>
          </NCard>
        </NGi>

        <!-- 最新告警 -->
        <NGi>
          <NCard title="实时告警" :bordered="false">
            <template #header-extra>
              <NButton size="small" @click="router.push('/boss/alerts')">查看全部</NButton>
            </template>
            <div v-if="bossStore.alerts.length === 0">
              <NEmpty description="暂无告警" />
            </div>
            <div v-for="alert in bossStore.alerts.slice(0, 8)" :key="alert.id" style="padding: 8px 0; border-bottom: 1px solid var(--border-color, #f0f0f0);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center;">
                  <NTag :color="{ color: alertLevelColor(alert.level) }" size="small">
                    {{ alert.level }}
                  </NTag>
                  <strong style="margin-left: 8px;">{{ alert.title }}</strong>
                </div>
                <div style="font-size: 12px; color: #999;">
                  {{ formatRelative(alert.created_at) }}
                  <span v-if="alert.resolved" style="color: #52c41a;"> (已处理)</span>
                </div>
              </div>
            </div>
          </NCard>
        </NGi>

        <!-- 最近任务 -->
        <NGi>
          <NCard title="最近任务" :bordered="false">
            <template #header-extra>
              <NButton size="small" @click="router.push('/boss/tasks')">查看全部</NButton>
            </template>
            <div v-if="recentTasks.length === 0">
              <NEmpty description="暂无任务" />
            </div>
            <div v-for="task in recentTasks" :key="task.id" style="padding: 8px 0; border-bottom: 1px solid var(--border-color, #f0f0f0);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <strong style="font-size: 13px;">{{ task.title }}</strong>
                  <NTag :color="{ color: priorityColor(task.priority) }" size="tiny" style="margin-left: 6px;">
                    {{ task.priority }}
                  </NTag>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <NTag size="tiny" :type="task.status === 'done' ? 'success' : task.status === 'in_progress' ? 'info' : task.status === 'review' ? 'warning' : 'default'">
                    {{ task.status }}
                  </NTag>
                  <span style="font-size: 12px; color: #999;">{{ formatRelative(task.created_at) }}</span>
                </div>
              </div>
            </div>
          </NCard>
        </NGi>

        <!-- 正在执行的任务 -->
        <NGi>
          <NCard title="正在执行" :bordered="false">
            <template #header-extra>
              <NButton size="small" @click="fetchExecutingTasks()">刷新</NButton>
            </template>
            <div v-if="executingTasks.length === 0">
              <NEmpty description="暂无执行中的任务" />
            </div>
            <div v-for="exec in executingTasks" :key="exec.taskId" style="padding: 8px 0; border-bottom: 1px solid var(--border-color, #f0f0f0);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <strong style="font-size: 13px;">任务 {{ exec.taskId.slice(0, 8) }}...</strong>
                  <NTag type="info" size="tiny" style="margin-left: 6px;">
                    <span class="pulse-dot"></span> 执行中
                  </NTag>
                </div>
                <div style="font-size: 12px; color: #999;">
                  已运行 {{ formatDuration(exec.startedAt) }}
                </div>
              </div>
              <div style="font-size: 11px; color: #999; margin-top: 4px;">
                Run: {{ exec.runId.slice(0, 20) }}...
              </div>
            </div>
          </NCard>
        </NGi>

        <!-- 最新日报 -->
        <NGi>
          <NCard title="AI 日报" :bordered="false">
            <template #header-extra>
              <NButton size="small" @click="router.push('/boss/reports')">历史日报</NButton>
            </template>
            <div v-if="!bossStore.latestReport">
              <NEmpty description="暂无日报" />
            </div>
            <div v-else>
              <h3 style="margin: 0 0 8px 0; font-size: 14px;">{{ bossStore.latestReport.title || 'AI 日报' }} - {{ bossStore.latestReport.date }}</h3>
              <p v-if="bossStore.latestReport.summary" style="color: #666; margin: 0 0 8px 0;">{{ bossStore.latestReport.summary }}</p>
              <pre v-if="bossStore.latestReport.content" style="white-space: pre-wrap; font-size: 13px; line-height: 1.6; max-height: 200px; overflow: auto;">{{ bossStore.latestReport.content }}</pre>
            </div>
          </NCard>
        </NGi>
      </NGrid>

      <!-- 虚拟公司 2D 场景 -->
      <NCard :bordered="false" size="small" style="margin-bottom: 16px;">
        <template #header>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>🏢 虚拟公司实时状态</span>
            <NTag size="tiny" type="info">{{ bossStore.agents.length }} 名员工</NTag>
          </div>
        </template>
        <template #header-extra>
          <NButton size="small" @click="router.push('/boss/world')">全屏查看</NButton>
        </template>
        <MiniOfficeScene />
      </NCard>

      <!-- 趋势图 -->
      <NCard :bordered="false" size="small" style="margin-bottom: 16px;" v-if="trend.length >= 2">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-weight: 600; font-size: 15px;">📈 近 7 天趋势</span>
          <NSpace size="small">
            <span style="font-size: 11px; display: flex; align-items: center; gap: 4px;">
              <span style="display: inline-block; width: 12px; height: 3px; background: #52c41a; border-radius: 2px;"></span> 收入
            </span>
            <span style="font-size: 11px; display: flex; align-items: center; gap: 4px;">
              <span style="display: inline-block; width: 12px; height: 3px; background: #f5222d; border-radius: 2px;"></span> Token 成本
            </span>
          </NSpace>
        </div>
        <div class="trend-chart-container" style="width: 100%; overflow-x: auto;">
          <svg :width="trendChartWidth" :height="trendChartHeight" style="display: block;">
            <!-- Y axis grid lines -->
            <line v-for="i in 4" :key="'grid-'+i"
              :x1="10" :y1="10 + (i-1) * 40" :x2="trendChartWidth - 10" :y2="10 + (i-1) * 40"
              stroke="#e8e8e8" stroke-width="1" />
            <!-- Revenue line -->
            <path :d="trendPathData.revenue" fill="none" stroke="#52c41a" stroke-width="2" stroke-linejoin="round" />
            <!-- Cost line -->
            <path :d="trendPathData.cost" fill="none" stroke="#f5222d" stroke-width="2" stroke-linejoin="round" stroke-dasharray="4,2" />
            <!-- Date labels -->
            <text v-for="(d, i) in trendDates" :key="'date-'+i"
              :x="10 + (i / Math.max(trendDates.length - 1, 1)) * (trendChartWidth - 20)"
              y="175" text-anchor="middle" font-size="10" fill="#999">
              {{ d }}
            </text>
            <!-- Data dots on revenue -->
            <circle v-for="(p, i) in trend" :key="'rev-dot-'+i"
              :cx="10 + (i / Math.max(trend.length - 1, 1)) * (trendChartWidth - 20)"
              :cy="10 + (trendChartHeight - 30) - (p.revenue / Math.max(...trend.map(x=>Math.max(x.revenue, x.cost)), 1)) * (trendChartHeight - 40)"
              r="3" fill="#52c41a" />
          </svg>
        </div>
      </NCard>
    </div>
  </NSpin>
</template>

<style scoped>
.pulse-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #1890ff;
  margin-right: 4px;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}
</style>
