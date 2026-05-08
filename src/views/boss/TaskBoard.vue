<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { NCard, NTag, NButton, NSpace, NSelect, NInput, NModal, NForm, NFormItem, NInput as NTextInput, NDatePicker, NPopconfirm, NSpin, NEmpty, NAlert, NTooltip, NDivider, NDescriptions, NDescriptionsItem, NSteps, NStep } from 'naive-ui'
import { useBossStore, type BossTask } from '@/stores/boss'

const bossStore = useBossStore()
const loading = ref(true)
const showCreateModal = ref(false)
const showDetailModal = ref(false)
const showDispatchModal = ref(false)
const dispatchCommandInput = ref('')
const dispatchStep = ref(0)
const filterAgent = ref('')
const filterPriority = ref('')
const searchQuery = ref('')
const draggingTask = ref<BossTask | null>(null)

const columns = [
  { key: 'todo', label: '待处理', color: '#999', icon: '\U0001f4cb' },
  { key: 'in_progress', label: '进行中', color: '#1890ff', icon: '\U0001f504' },
  { key: 'review', label: '审核中', color: '#faad14', icon: '\U0001f440' },
  { key: 'done', label: '已完成', color: '#52c41a', icon: '\u2705' },
]

const priorityOptions = [
  { label: '低优先级', value: 'low' },
  { label: '中优先级', value: 'medium' },
  { label: '高优先级', value: 'high' },
  { label: '紧急', value: 'urgent' },
]

const statusOptions = [
  { label: '待处理', value: 'todo' },
  { label: '进行中', value: 'in_progress' },
  { label: '审核中', value: 'review' },
  { label: '已完成', value: 'done' },
]

const newTask = ref<Partial<BossTask>>({
  title: '', description: '', status: 'todo', priority: 'medium', agent_id: '', assigned_to: '', category: ''
})

const selectedTask = ref<BossTask | null>(null)

onMounted(async () => {
  await Promise.all([bossStore.fetchTaskBoard(), bossStore.fetchAgents(), bossStore.fetchTasks()])
  loading.value = false
})

function priorityColor(p: string): string {
  const map: Record<string, string> = { low: '#999', medium: '#1890ff', high: '#faad14', urgent: '#f5222d' }
  return map[p] || '#999'
}

function formatTime(ts?: number): string {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`
}

function formatFullTime(ts?: number): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('zh-CN')
}

function countdown(dueDate?: number): string {
  if (!dueDate) return ''
  const diff = dueDate - Date.now()
  if (diff <= 0) return '已过期'
  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return `${hours}h 后截止`
  const days = Math.floor(hours / 24)
  return `${days}d 后截止`
}

function getAgentName(agentId?: string): string {
  if (!agentId) return '未分配'
  const agent = bossStore.agents.find(a => a.id === agentId)
  return agent ? agent.name : '未分配'
}

function getAgentPlatform(agentId?: string): string {
  if (!agentId) return ''
  const agent = bossStore.agents.find(a => a.id === agentId)
  return agent?.platform || ''
}

const agentOptions = computed(() => bossStore.agents.map(a => ({ label: `${a.name} [${a.platform || 'openclaw'}]`, value: a.id })))

function moveTask(task: BossTask, newStatus: string) {
  bossStore.updateTask(task.id, { status: newStatus as any })
}

function nextStatus(current: string): string {
  const flow = { todo: 'in_progress', in_progress: 'review', review: 'done' }
  return flow[current as keyof typeof flow] || 'done'
}

function prevStatus(current: string): string {
  const flow = { done: 'review', review: 'in_progress', in_progress: 'todo' }
  return flow[current as keyof typeof flow] || 'todo'
}

function createTask() {
  if (!newTask.value.title) return
  bossStore.createTask(newTask.value).then(() => {
    newTask.value = { title: '', description: '', status: 'todo', priority: 'medium', agent_id: '', assigned_to: '', category: '' }
    showCreateModal.value = false
  })
}

function openDetail(task: BossTask) {
  selectedTask.value = task
  showDetailModal.value = true
}

// Drag and drop handlers
function onDragStart(task: BossTask) {
  draggingTask.value = task
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
}

function onDrop(e: DragEvent, status: string) {
  e.preventDefault()
  if (draggingTask.value && draggingTask.value.status !== status) {
    moveTask(draggingTask.value, status)
  }
  draggingTask.value = null
}

function filteredTasks(tasks: BossTask[]): BossTask[] {
  return tasks.filter(t => {
    if (filterAgent.value && t.agent_id !== filterAgent.value) return false
    if (filterPriority.value && t.priority !== filterPriority.value) return false
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      const matchTitle = t.title.toLowerCase().includes(q)
      const matchDesc = (t.description || '').toLowerCase().includes(q)
      const matchAssignee = (t.assigned_to || '').toLowerCase().includes(q)
      if (!matchTitle && !matchDesc && !matchAssignee) return false
    }
    return true
  })
}

async function handleDispatch() {
  if (!dispatchCommandInput.value.trim()) return
  try {
    await bossStore.dispatchCommand(dispatchCommandInput.value)
    dispatchStep.value = 1
  } catch (e) {
    // Error handled in store
  }
}

async function confirmDispatchTasks() {
  if (!bossStore.currentDispatch) return
  try {
    await bossStore.confirmDispatchAction(bossStore.currentDispatch.id)
    dispatchStep.value = 2
    await Promise.all([bossStore.fetchTaskBoard(), bossStore.fetchTasks()])
  } catch (e) {
    // Error handled in store
  }
}

function resetDispatch() {
  dispatchCommandInput.value = ''
  dispatchStep.value = 0
  bossStore.currentDispatch = null
  showDispatchModal.value = false
}
</script>

<template>
  <NSpin :show="loading">
    <div style="padding: 20px;">
      <!-- 顶部工具栏 -->
      <NSpace vertical :size="16" style="margin-bottom: 16px;">
        <NSpace justify="space-between" align="center" wrap>
          <h2 style="margin: 0;">任务看板</h2>
          <NSpace wrap>
            <NInput v-model:value="searchQuery" placeholder="搜索任务..." clearable style="width: 180px;" />
            <NSelect v-model:value="filterAgent" :options="agentOptions" placeholder="按 Agent 筛选" style="width: 160px;" clearable />
            <NSelect v-model:value="filterPriority" :options="priorityOptions" placeholder="按优先级筛选" style="width: 140px;" clearable />
            <NButton type="info" @click="showDispatchModal = true">\u26a1 智能派发</NButton>
            <NButton type="primary" @click="showCreateModal = true">+ 新建任务</NButton>
          </NSpace>
        </NSpace>
      </NSpace>

      <NAlert v-if="bossStore.error" type="error" style="margin-bottom: 16px;">{{ bossStore.error }}</NAlert>

      <!-- 看板列 -->
      <div style="display: flex; gap: 16px; overflow-x: auto; min-height: calc(100vh - 220px);">
        <div
          v-for="col in columns"
          :key="col.key"
          style="min-width: 280px; flex: 1;"
          @dragover="onDragOver"
          @drop="onDrop($event, col.key)"
        >
          <NCard :bordered="false" size="small">
            <template #header>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span>{{ col.icon }}</span>
                <strong>{{ col.label }}</strong>
                <NTag :color="{ color: col.color }" size="small" round>
                  {{ filteredTasks(bossStore.taskBoard[col.key] || []).length }}
                </NTag>
              </div>
            </template>

            <div v-if="filteredTasks(bossStore.taskBoard[col.key] || []).length === 0">
              <NEmpty description="无任务" size="small" />
            </div>

            <div
              v-for="task in filteredTasks(bossStore.taskBoard[col.key] || [])"
              :key="task.id"
              style="margin-bottom: 8px;"
              draggable="true"
              @dragstart="onDragStart(task)"
            >
              <NCard :bordered="true" size="small" hoverable style="cursor: pointer;" @click="openDetail(task)">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
                    <strong style="font-size: 13px;">{{ task.title }}</strong>
                    <NTag :color="{ color: priorityColor(task.priority) }" size="tiny">{{ task.priority }}</NTag>
                  </div>
                  <div v-if="task.description" style="font-size: 12px; color: #666; margin-bottom: 4px;">{{ task.description.slice(0, 60) }}{{ task.description.length > 60 ? '...' : '' }}</div>
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #999;">
                    <span style="display: flex; align-items: center; gap: 4px;">
                      {{ getAgentName(task.agent_id) }}
                      <NTag v-if="getAgentPlatform(task.agent_id)" :type="getAgentPlatform(task.agent_id) === 'hermes' ? 'warning' : 'info'" size="tiny" :bordered="false" style="font-size: 9px; padding: 0 4px;">
                        {{ getAgentPlatform(task.agent_id) === 'hermes' ? 'H' : 'OC' }}
                      </NTag>
                    </span>
                    <span>{{ formatTime(task.created_at) }}</span>
                  </div>
                  <div v-if="task.due_date" style="font-size: 11px; margin-top: 4px; color: countdown(task.due_date).includes('过期') ? '#f5222d' : '#999';">
                    {{ countdown(task.due_date) }}
                  </div>
                </div>
                <template #footer>
                  <NSpace justify="space-between">
                    <NTooltip trigger="hover">
                      <template #trigger>
                        <NButton size="tiny" quaternary @click.stop="moveTask(task, prevStatus(task.status))" :disabled="task.status === 'todo'">
                          &larr;
                        </NButton>
                      </template>
                      回退到上一步
                    </NTooltip>
                    <NTooltip trigger="hover">
                      <template #trigger>
                        <NButton size="tiny" quaternary type="primary" @click.stop="moveTask(task, nextStatus(task.status))" :disabled="task.status === 'done'">
                          推进 &rarr;
                        </NButton>
                      </template>
                      推进到下一步
                    </NTooltip>
                    <NPopconfirm @positive-click="bossStore.deleteTask(task.id)">
                      <template #trigger>
                        <NButton size="tiny" quaternary type="error">删除</NButton>
                      </template>
                      确认删除此任务？
                    </NPopconfirm>
                  </NSpace>
                </template>
              </NCard>
            </div>
          </NCard>
        </div>
      </div>

      <!-- 新建任务弹窗 -->
      <NModal v-model:show="showCreateModal" preset="card" title="新建任务" style="width: 500px;">
        <NForm>
          <NFormItem label="任务标题" required>
            <NTextInput v-model:value="newTask.title" placeholder="输入任务标题..." />
          </NFormItem>
          <NFormItem label="描述">
            <NTextInput v-model:value="newTask.description" type="textarea" :rows="3" placeholder="任务描述..." />
          </NFormItem>
          <NFormItem label="优先级">
            <NSelect v-model:value="newTask.priority" :options="priorityOptions" />
          </NFormItem>
          <NFormItem label="分配给">
            <NTextInput v-model:value="newTask.assigned_to" placeholder="负责人姓名..." />
          </NFormItem>
          <NFormItem label="关联 Agent">
            <NSelect v-model:value="newTask.agent_id" :options="agentOptions" placeholder="选择 Agent" clearable />
          </NFormItem>
          <NFormItem label="分类">
            <NTextInput v-model:value="newTask.category" placeholder="如：选品、内容、投放..." />
          </NFormItem>
          <NFormItem label="截止日期">
            <NDatePicker v-model:value="newTask.due_date as any" type="datetime" />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="showCreateModal = false">取消</NButton>
            <NButton type="primary" @click="createTask">创建任务</NButton>
          </NSpace>
        </template>
      </NModal>

      <!-- 任务详情弹窗 -->
      <NModal v-model:show="showDetailModal" preset="card" :title="selectedTask?.title || '任务详情'" style="width: 600px;">
        <template v-if="selectedTask">
          <NDescriptions :column="2" bordered>
            <NDescriptionsItem label="状态">
              <NTag :type="selectedTask.status === 'done' ? 'success' : selectedTask.status === 'in_progress' ? 'info' : selectedTask.status === 'review' ? 'warning' : 'default'">
                {{ selectedTask.status }}
              </NTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="优先级">
              <NTag :color="{ color: priorityColor(selectedTask.priority) }">{{ selectedTask.priority }}</NTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="关联 Agent">
              {{ getAgentName(selectedTask.agent_id) }}
            </NDescriptionsItem>
            <NDescriptionsItem label="负责人">
              {{ selectedTask.assigned_to || '未分配' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="分类">
              {{ selectedTask.category || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="截止日期">
              {{ selectedTask.due_date ? formatFullTime(selectedTask.due_date) : '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="创建时间">
              {{ formatFullTime(selectedTask.created_at) }}
            </NDescriptionsItem>
            <NDescriptionsItem label="更新时间">
              {{ formatFullTime(selectedTask.updated_at) }}
            </NDescriptionsItem>
          </NDescriptions>
          <NDivider />
          <div v-if="selectedTask.description">
            <strong>任务描述：</strong>
            <p style="white-space: pre-wrap; margin-top: 8px;">{{ selectedTask.description }}</p>
          </div>
          <NEmpty v-else description="暂无描述" />
        </template>
      </NModal>

      <!-- 智能派发弹窗 (Hermes 主控模式) -->
      <NModal v-model:show="showDispatchModal" preset="card" :title="dispatchStep === 0 ? '\U0001f9e0 Hermes 主控派发' : dispatchStep === 1 ? '\U0001f4cb Hermes 任务拆解方案' : '\u2705 派发成功'" style="width: 700px;">
        <NSpin :show="bossStore.dispatching">
          <!-- Step 0: 输入指令 -->
          <div v-if="dispatchStep === 0">
            <NAlert type="info" style="margin-bottom: 16px;">
              <strong>Hermes 主控</strong> 将接收你的指令，自动拆解为子任务并分配给合适的 OpenClaw Worker 执行。
            </NAlert>
            <NForm>
              <NFormItem label="指令">
                <NTextInput
                  v-model:value="dispatchCommandInput"
                  type="textarea"
                  :rows="3"
                  placeholder="例如：准备父亲节选品、分析竞品价格趋势、编写推广文案..."
                  @keydown.ctrl.enter="handleDispatch"
                />
              </NFormItem>
            </NForm>
          </div>

          <!-- Step 1: 确认拆解结果 -->
          <div v-else-if="dispatchStep === 1 && bossStore.currentDispatch">
            <NAlert type="success" style="margin-bottom: 16px;">
              <strong>Hermes 主控</strong> 识别意图：{{ bossStore.currentDispatch.result.intent }}
              <span v-if="bossStore.currentDispatch.result.category"> | 分类：{{ bossStore.currentDispatch.result.category }}</span>
            </NAlert>

            <div style="margin-bottom: 12px; font-size: 12px; color: #666;">
              可用 Worker: {{ bossStore.currentDispatch.result.availableWorkers?.length || 0 }} 个
              <NTag v-for="w in bossStore.currentDispatch.result.availableWorkers?.slice(0, 3)" :key="w.id" size="tiny" style="margin-left: 4px;">{{ w.name }}</NTag>
            </div>

            <NCard v-for="(task, idx) in bossStore.currentDispatch.result.subTasks" :key="idx" size="small" style="margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 11px; color: #999;">#{{ idx + 1 }}</span>
                    <strong>{{ task.title }}</strong>
                    <NTag :color="{ color: priorityColor(task.priority) }" size="tiny">{{ task.priority }}</NTag>
                  </div>
                  <div style="font-size: 11px; color: #666; margin-top: 4px;">{{ task.description }}</div>
                  <div style="margin-top: 6px; display: flex; gap: 8px; align-items: center;">
                    <NTag type="info" size="tiny">{{ task.category }}</NTag>
                    <span v-if="task.assignedWorkerId" style="font-size: 11px; color: #52c41a;">
                      \u2192 分配给: {{ getAgentName(task.assignedWorkerId) }}
                    </span>
                    <span v-else style="font-size: 11px; color: #faad14;">
                      \u26a0\ufe0f 待分配
                    </span>
                  </div>
                </div>
              </div>
            </NCard>
          </div>

          <!-- Step 2: 派发成功 -->
          <div v-else-if="dispatchStep === 2">
            <NAlert type="success" style="margin-bottom: 16px;">
              <strong>Hermes 主控</strong> 已成功派发任务到看板，Worker 将按顺序执行。
            </NAlert>
          </div>
        </NSpin>

        <template #footer>
          <NSpace justify="end">
            <NButton v-if="dispatchStep > 0" @click="resetDispatch">
              {{ dispatchStep === 2 ? '关闭' : '取消' }}
            </NButton>
            <NButton v-if="dispatchStep === 0" type="primary" @click="handleDispatch" :loading="bossStore.dispatching" :disabled="!dispatchCommandInput.trim()">
              \U0001f9e0 Hermes 拆解
            </NButton>
            <NButton v-if="dispatchStep === 1" type="primary" @click="confirmDispatchTasks">
              \u2705 确认派发
            </NButton>
          </NSpace>
        </template>
      </NModal>
    </div>
  </NSpin>
</template>
