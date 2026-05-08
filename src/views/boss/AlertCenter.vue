<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { NCard, NTag, NButton, NSpace, NSelect, NInput, NModal, NForm, NFormItem, NInput as NTextInput, NPopconfirm, NSpin, NEmpty, NAlert, NDataTable, NDatePicker, NTimePicker, NStatistic, NGrid, NGridItem, NSwitch, NTooltip, useMessage } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { useBossStore, type BossAlert } from '@/stores/boss'
import { useAuthStore } from '@/stores/auth'

const bossStore = useBossStore()
const authStore = useAuthStore()
const message = useMessage()
const loading = ref(true)
const showCreateModal = ref(false)
const showPushConfigModal = ref(false)
const filterLevel = ref('')
const showResolved = ref(false)
const autoRefresh = ref(true)
const pushConfig = ref({ telegramEnabled: false, telegramBotToken: '', telegramChatId: '' })
const pushTesting = ref(false)
const monitorRules = ref<any[]>([])

const levelOptions = [
  { label: '\U0001f535 信息', value: 'info' },
  { label: '\U26a0\ufe0f 警告', value: 'warning' },
  { label: '\U0001f534 错误', value: 'error' },
  { label: '\U0001f6a8 严重', value: 'critical' },
]

const newAlert = ref<Partial<BossAlert>>({
  title: '', message: '', level: 'info', source: '', agent_id: ''
})

let refreshTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await Promise.all([bossStore.fetchAlerts(), fetchPushConfig(), fetchMonitorRules()])
  loading.value = false

  // Auto refresh every 30s
  if (autoRefresh.value) {
    refreshTimer = setInterval(() => {
      bossStore.fetchAlerts()
    }, 30000)
  }
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

async function fetchPushConfig() {
  try {
    const res = await fetch('/api/boss/alerts/push/config', {
      headers: { 'Authorization': `Bearer ${authStore.getToken()}` }
    })
    if (res.ok) {
      const data = await res.json()
      pushConfig.value = data.config
    }
  } catch {
    // Ignore
  }
}

async function fetchMonitorRules() {
  try {
    const res = await fetch('/api/boss/monitor/rules', {
      headers: { 'Authorization': `Bearer ${authStore.getToken()}` }
    })
    if (res.ok) {
      const data = await res.json()
      monitorRules.value = data.rules
    }
  } catch {
    // Ignore
  }
}

async function testPush() {
  pushTesting.value = true
  try {
    const res = await fetch('/api/boss/alerts/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authStore.getToken()}` }
    })
    const data = await res.json()
    if (data.ok) {
      message.success('测试消息发送成功')
    } else {
      message.error(data.error || '发送失败')
    }
  } catch (e: any) {
    message.error(e.message)
  } finally {
    pushTesting.value = false
  }
}

async function triggerMonitor() {
  try {
    await fetch('/api/boss/monitor/trigger', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authStore.getToken()}` }
    })
    await bossStore.fetchAlerts()
    message.success('监控已触发')
  } catch (e: any) {
    message.error(e.message)
  }
}

function levelColor(level: string): string {
  const map: Record<string, string> = { info: '#1890ff', warning: '#faad14', error: '#f5222d', critical: '#cf1322' }
  return map[level] || '#999'
}

function levelType(level: string): 'info' | 'warning' | 'error' | 'default' {
  const map: Record<string, 'info' | 'warning' | 'error' | 'default'> = { info: 'info', warning: 'warning', error: 'error', critical: 'error' }
  return map[level] || 'default'
}

function formatTime(ts?: number): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('zh-CN')
}

function timeAgo(ts?: number): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return `${Math.floor(diff / 86400000)} 天前`
}

const filteredAlerts = computed(() => {
  let list = bossStore.alerts
  if (filterLevel.value) list = list.filter(a => a.level === filterLevel.value)
  if (!showResolved.value) list = list.filter(a => !a.resolved)
  return list
})

const stats = computed(() => {
  const unresolved = bossStore.alerts.filter(a => !a.resolved)
  return {
    total: bossStore.alerts.length,
    unresolved: unresolved.length,
    critical: unresolved.filter(a => a.level === 'critical').length,
    warning: unresolved.filter(a => a.level === 'warning').length,
  }
})

const columns: DataTableColumns<BossAlert> = [
  { title: '级别', key: 'level', width: 90, render(row) {
    return h(NTag, { type: levelType(row.level), size: 'small', bordered: false }, { default: () => row.level.toUpperCase() })
  }},
  { title: '标题', key: 'title', minWidth: 200, render(row) {
    return h('div', {}, [
      h('strong', { style: 'font-size: 13px;' }, row.title),
      h('div', { style: 'font-size: 11px; color: #999; margin-top: 2px;' }, timeAgo(row.created_at))
    ])
  }},
  { title: '消息', key: 'message', minWidth: 250, ellipsis: { tooltip: true } },
  { title: '来源', key: 'source', width: 100, render(row) {
    return row.source === 'monitor' ? h(NTag, { size: 'tiny', type: 'info' }, { default: () => '自动' }) : (row.source || '-')
  }},
  { title: '状态', key: 'resolved', width: 90, render(row) {
    return row.resolved ? h(NTag, { type: 'success', size: 'small', bordered: false }, { default: () => '已处理' }) : h(NTag, { type: 'warning', size: 'small', bordered: false }, { default: () => '未处理' })
  }},
  { title: '操作', key: 'actions', width: 180, render(row) {
    if (row.resolved) return h('span', { style: 'color: #999; font-size: 12px;' }, '已处理')
    return h(NSpace, { size: 'small' }, {
      default: () => [
        h(NButton, { size: 'tiny', type: 'success', onClick: () => bossStore.resolveAlert(row.id, 'admin') }, { default: () => '处理' }),
        h(NPopconfirm, { onPositiveClick: () => bossStore.deleteAlert(row.id) }, {
          trigger: () => h(NButton, { size: 'tiny', type: 'error' }, { default: () => '删除' }),
          default: () => '确认删除？'
        })
      ]
    })
  }},
]

function createAlert() {
  if (!newAlert.value.title) return
  bossStore.createAlert(newAlert.value).then(() => {
    newAlert.value = { title: '', message: '', level: 'info', source: '', agent_id: '' }
    showCreateModal.value = false
  })
}

function h(...args: any[]) { return args }
</script>

<template>
  <NSpin :show="loading">
    <div style="padding: 20px;">
      <NSpace vertical :size="16">
        <!-- 工具栏 -->
        <NSpace justify="space-between" align="center" wrap>
          <h2 style="margin: 0;">告警中心</h2>
          <NSpace wrap>
            <NSelect v-model:value="filterLevel" :options="levelOptions" placeholder="按级别筛选" style="width: 150px;" clearable />
            <NButton @click="triggerMonitor">\u26a1 立即检测</NButton>
            <NButton @click="showPushConfigModal = true">\U0001f4e2 推送设置</NButton>
            <NButton type="primary" @click="showCreateModal = true">+ 手动告警</NButton>
            <NButton @click="bossStore.fetchAlerts()">刷新</NButton>
          </NSpace>
        </NSpace>

        <!-- 统计卡片 -->
        <NGrid :cols="4" :x-gap="12" :y-gap="12">
          <NGridItem>
            <NCard size="small">
              <NStatistic label="总告警" :value="stats.total" />
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard size="small">
              <NStatistic label="未处理" :value="stats.unresolved">
                <template #prefix>
                  <span style="color: #faad14;">\u26a0\ufe0f</span>
                </template>
              </NStatistic>
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard size="small">
              <NStatistic label="严重" :value="stats.critical">
                <template #prefix>
                  <span style="color: #f5222d;">\U0001f6a8</span>
                </template>
              </NStatistic>
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard size="small">
              <NStatistic label="警告" :value="stats.warning">
                <template #prefix>
                  <span style="color: #faad14;">\U0001f534</span>
                </template>
              </NStatistic>
            </NCard>
          </NGridItem>
        </NGrid>

        <!-- 未处理告警提示 -->
        <NAlert v-if="stats.unresolved > 0" type="warning">
          当前有 <strong>{{ stats.unresolved }}</strong> 条未处理告警
          <span v-if="stats.critical > 0">，其中 <strong style="color: #f5222d;">{{ stats.critical }} 条严重</strong></span>
          ，请及时处理。
        </NAlert>
        <NAlert v-if="bossStore.error" type="error">{{ bossStore.error }}</NAlert>

        <!-- 监控规则 -->
        <NCard title="自动监控规则" size="small">
          <NSpace vertical :size="8">
            <div v-for="rule in monitorRules" :key="rule.id" style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
              <div>
                <strong style="font-size: 13px;">{{ rule.name }}</strong>
                <span style="font-size: 11px; color: #999; margin-left: 8px;">{{ rule.description }}</span>
              </div>
              <NTag size="small" type="success" bordered>{{ rule.enabled ? '已启用' : '已禁用' }}</NTag>
            </div>
          </NSpace>
        </NCard>

        <!-- 表格 -->
        <NCard title="告警列表" size="small">
          <NDataTable :columns="columns" :data="filteredAlerts" :pagination="{ pageSize: 20 }" :scroll-x="900" />
        </NCard>

        <NEmpty v-if="filteredAlerts.length === 0" description="暂无告警记录" />
      </NSpace>

      <!-- 手动告警弹窗 -->
      <NModal v-model:show="showCreateModal" preset="card" title="手动创建告警" style="width: 500px;">
        <NForm>
          <NFormItem label="告警标题" required>
            <NTextInput v-model:value="newAlert.title" placeholder="如：Agent 连续失败..." />
          </NFormItem>
          <NFormItem label="告警内容">
            <NTextInput v-model:value="newAlert.message" type="textarea" :rows="3" />
          </NFormItem>
          <NFormItem label="级别">
            <NSelect v-model:value="newAlert.level" :options="levelOptions" />
          </NFormItem>
          <NFormItem label="来源">
            <NTextInput v-model:value="newAlert.source" placeholder="如：系统监控、人工..." />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="showCreateModal = false">取消</NButton>
            <NButton type="primary" @click="createAlert">创建</NButton>
          </NSpace>
        </template>
      </NModal>

      <!-- 推送设置弹窗 -->
      <NModal v-model:show="showPushConfigModal" preset="card" title="告警推送设置" style="width: 550px;">
        <NSpace vertical :size="16">
          <NAlert type="info">
            配置 Telegram Bot 以接收严重/错误级别告警推送。需在 <code>.env</code> 文件中设置 <code>TELEGRAM_BOT_TOKEN</code> 和 <code>TELEGRAM_CHAT_ID</code>。
          </NAlert>

          <NCard size="small" title="当前状态">
            <NSpace justify="space-between" align="center">
              <div>
                <strong>Telegram 推送</strong>
                <div style="font-size: 12px; color: #999; margin-top: 4px;">
                  {{ pushConfig.telegramEnabled ? '已配置并启用' : '未配置' }}
                </div>
              </div>
              <NTag :type="pushConfig.telegramEnabled ? 'success' : 'warning'" size="small">
                {{ pushConfig.telegramEnabled ? '已启用' : '未启用' }}
              </NTag>
            </NSpace>
          </NCard>

          <NCard size="small" title="推送规则">
            <NSpace vertical :size="8">
              <div style="font-size: 13px;">\U0001f6a8 严重 (Critical) - 立即推送</div>
              <div style="font-size: 13px;">\U0001f534 错误 (Error) - 立即推送</div>
              <div style="font-size: 13px; color: #999;">\U26a0\ufe0f 警告 (Warning) - 不推送</div>
              <div style="font-size: 13px; color: #999;">\U0001f535 信息 (Info) - 不推送</div>
            </NSpace>
          </NCard>

          <NSpace justify="center">
            <NButton type="primary" @click="testPush" :loading="pushTesting" :disabled="!pushConfig.telegramEnabled">
              发送测试消息
            </NButton>
          </NSpace>
        </NSpace>

        <template #footer>
          <NSpace justify="end">
            <NButton @click="showPushConfigModal = false">关闭</NButton>
          </NSpace>
        </template>
      </NModal>
    </div>
  </NSpin>
</template>
