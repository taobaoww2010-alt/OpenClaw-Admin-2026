<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import { NCard, NButton, NDataTable, NSpin, NEmpty, NTag } from 'naive-ui'
import { useBossStore } from '@/stores/boss'
import type { BossAgent } from '@/stores/boss'
import type { DataTableColumns } from 'naive-ui'

const bossStore = useBossStore()
const loading = ref(true)

onMounted(async () => {
  await bossStore.fetchAgents()
  loading.value = false
})

const columns: DataTableColumns<BossAgent> = [
  { title: '名称', key: 'name' },
  { title: '角色', key: 'role' },
  { 
    title: '平台', 
    key: 'platform',
    render(row) {
      const isHermes = row.platform === 'hermes'
      return h(NTag, { type: isHermes ? 'warning' : 'info', size: 'small' }, { default: () => isHermes ? 'Hermes 主控' : 'OpenClaw Worker' })
    }
  },
  { title: '模型', key: 'model' },
  { 
    title: '状态', 
    key: 'status',
    render(row) {
      const color = row.status === 'active' ? '#52c41a' : '#999'
      return h(NTag, { size: 'small', color: { color } }, { default: () => row.status })
    }
  },
  { 
    title: '任务', 
    key: 'task_stats',
    render(row) {
      return `${row.completed_tasks || 0}/${row.total_tasks || 0}`
    }
  },
]
</script>

<template>
  <NSpin :show="loading">
    <div style="padding: 20px;">
      <NCard title="Agent 管理" :bordered="false">
        <template #header-extra>
          <NButton size="small" @click="bossStore.fetchAgents()">刷新</NButton>
        </template>
        <NDataTable v-if="bossStore.agents.length > 0" :columns="columns" :data="bossStore.agents" />
        <NEmpty v-else description="暂无 Agent" />
      </NCard>
    </div>
  </NSpin>
</template>
