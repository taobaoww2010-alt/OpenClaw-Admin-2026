<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { NCard, NButton, NSpace, NModal, NForm, NFormItem, NInput as NTextInput, NDatePicker, NSpin, NEmpty, NAlert, NTimeline, NTimelineItem, NTag, NStatistic, NGrid, NGridItem, useMessage } from 'naive-ui'
import { useBossStore } from '@/stores/boss'
import { useAuthStore } from '@/stores/auth'

const bossStore = useBossStore()
const authStore = useAuthStore()
const message = useMessage()
const loading = ref(true)
const generating = ref(false)
const showCreateModal = ref(false)
const showPreviewModal = ref(false)
const selectedDate = ref<number | undefined>(undefined)
const generatedReport = ref<any>(null)
const newReport = ref({ date: '', title: '', content: '', summary: '' })

onMounted(async () => {
  await bossStore.fetchReports()
  loading.value = false
})

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
}

function formatTime(ts?: number): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('zh-CN')
}

function handleDateChange(val: number | null) {
  selectedDate.value = val || undefined
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function generateReport() {
  generating.value = true
  try {
    const dateStr = selectedDate.value ? new Date(selectedDate.value).toISOString().slice(0, 10) : today()

    const res = await fetch('/api/boss/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authStore.getToken()}` },
      body: JSON.stringify({ date: dateStr })
    })

    const data = await res.json()
    if (data.ok) {
      generatedReport.value = data.report
      showPreviewModal.value = true
      await bossStore.fetchReports()
      message.success('日报生成成功')
    } else if (res.status === 409) {
      message.warning('该日期的日报已存在')
      await bossStore.fetchReports()
    } else {
      message.error(data.error || '生成失败')
    }
  } catch (e: any) {
    message.error(e.message)
  } finally {
    generating.value = false
  }
}

function createReport() {
  if (!newReport.value.date || !newReport.value.content) return
  bossStore.createReport(newReport.value).then(() => {
    newReport.value = { date: '', title: '', content: '', summary: '' }
    showCreateModal.value = false
  })
}

const todayMetrics = computed(() => {
  if (!generatedReport.value?.metrics) return null
  return generatedReport.value.metrics
})
</script>

<template>
  <NSpin :show="loading">
    <div style="padding: 20px;">
      <NSpace vertical :size="16">
        <!-- 工具栏 -->
        <NSpace justify="space-between" align="center" wrap>
          <h2 style="margin: 0;">AI 日报</h2>
          <NSpace wrap>
            <NDatePicker v-model:value="selectedDate" type="date" @update:value="handleDateChange" placeholder="选择日期" style="width: 160px;" />
            <NButton type="primary" @click="generateReport" :loading="generating">\U0001f916 AI 生成日报</NButton>
            <NButton @click="showCreateModal = true">+ 手动编辑</NButton>
            <NButton @click="bossStore.fetchReports()">刷新</NButton>
          </NSpace>
        </NSpace>

        <NAlert v-if="bossStore.error" type="error">{{ bossStore.error }}</NAlert>

        <!-- 今日数据概览 (生成后显示) -->
        <NGrid v-if="todayMetrics" :cols="4" :x-gap="12" :y-gap="12">
          <NGridItem>
            <NCard size="small">
              <NStatistic label="新增任务" :value="todayMetrics.tasksCreated" />
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard size="small">
              <NStatistic label="完成任务" :value="todayMetrics.tasksCompleted" />
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard size="small">
              <NStatistic label="告警" :value="todayMetrics.alertsToday">
                <template #suffix>
                  <NTag v-if="todayMetrics.criticalAlerts > 0" type="error" size="tiny" style="margin-left: 4px;">
                    {{ todayMetrics.criticalAlerts }} 严重
                  </NTag>
                </template>
              </NStatistic>
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard size="small">
              <NStatistic label="活跃 Agent" :value="todayMetrics.activeAgents">
                <template #suffix>
                  <span style="font-size: 14px; color: #999;">/ {{ todayMetrics.totalAgents }}</span>
                </template>
              </NStatistic>
            </NCard>
          </NGridItem>
        </NGrid>

        <!-- 日报列表 -->
        <NCard title="历史日报" size="small">
          <NTimeline v-if="bossStore.reports.length > 0">
            <NTimelineItem v-for="report in bossStore.reports" :key="report.id" :type="report.generated_by === 'ai' ? 'success' : 'default'">
              <template #header>
                <strong>{{ formatDate(report.date) }}</strong>
                <NTag :type="report.generated_by === 'ai' ? 'success' : 'info'" size="tiny" style="margin-left: 8px;">
                  {{ report.generated_by === 'ai' ? 'AI生成' : '手动' }}
                </NTag>
              </template>
              <NCard :bordered="false" size="small">
                <h3 style="margin: 0 0 8px 0;">{{ report.title || '每日运营报告' }}</h3>
                <p v-if="report.summary" style="color: #666; margin-bottom: 8px;"><strong>摘要：</strong>{{ report.summary }}</p>
                <pre v-if="report.content" style="white-space: pre-wrap; font-size: 13px; line-height: 1.8; background: var(--n-code-color, #f5f5f5); padding: 12px; border-radius: 4px;">{{ report.content }}</pre>
                <div v-if="report.metrics && Object.keys(report.metrics).length > 0" style="margin-top: 8px;">
                  <strong>关键指标：</strong>
                  <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-top: 4px;">
                    <span v-for="(val, key) in report.metrics" :key="key" style="background: #e6f7ff; padding: 2px 8px; border-radius: 4px; font-size: 12px;">
                      {{ key }}: {{ val }}
                    </span>
                  </div>
                </div>
                <template #footer>
                  <NSpace justify="end">
                    <span style="font-size: 12px; color: #999;">{{ formatTime(report.created_at) }}</span>
                    <NButton size="tiny" type="error" quaternary @click="bossStore.deleteReport(report.id)">删除</NButton>
                  </NSpace>
                </template>
              </NCard>
            </NTimelineItem>
          </NTimeline>

          <NEmpty v-else description="暂无日报记录，点击「AI 生成日报」快速创建" />
        </NCard>
      </NSpace>

      <!-- 创建/编辑日报弹窗 -->
      <NModal v-model:show="showCreateModal" preset="card" title="生成/编辑日报" style="width: 700px;">
        <NForm>
          <NFormItem label="日期" required>
            <NDatePicker v-model:value="newReport.date as any" type="date" value-format="formatted-iso" />
          </NFormItem>
          <NFormItem label="标题">
            <NTextInput v-model:value="newReport.title" placeholder="如：5月4日运营日报" />
          </NFormItem>
          <NFormItem label="摘要">
            <NTextInput v-model:value="newReport.summary" type="textarea" :rows="2" placeholder="一句话总结今日情况..." />
          </NFormItem>
          <NFormItem label="详细内容" required>
            <NTextInput v-model:value="newReport.content" type="textarea" :rows="10" placeholder="详细日报内容...&#10;&#10;建议格式：&#10;一、今日数据概览&#10;二、Agent 执行情况&#10;三、问题与风险&#10;四、明日计划" />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="showCreateModal = false">取消</NButton>
            <NButton type="primary" @click="createReport">保存日报</NButton>
          </NSpace>
        </template>
      </NModal>

      <!-- 日报预览弹窗 -->
      <NModal v-model:show="showPreviewModal" preset="card" :title="generatedReport?.title || '日报预览'" style="width: 800px;">
        <div v-if="generatedReport">
          <NAlert type="success" style="margin-bottom: 16px;">
            {{ generatedReport.summary }}
          </NAlert>

          <pre v-if="generatedReport.metrics" style="white-space: pre-wrap; font-size: 13px; line-height: 1.8; background: var(--n-code-color, #f5f5f5); padding: 16px; border-radius: 4px;">{{ generatedReport.metrics }}</pre>
        </div>

        <template #footer>
          <NSpace justify="end">
            <NButton @click="showPreviewModal = false">关闭</NButton>
          </NSpace>
        </template>
      </NModal>
    </div>
  </NSpin>
</template>
