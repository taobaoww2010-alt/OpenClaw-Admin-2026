<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import {
  NCard,
  NButton,
  NDataTable,
  NSpin,
  NEmpty,
  NTag,
  NSpace,
  NInput,
  NIcon,
  useMessage,
  NModal,
  NForm,
  NFormItem,
  NSelect,
  NInputNumber,
  type DataTableColumns,
  type FormInst,
} from 'naive-ui'
import { SearchOutline, AddOutline, CreateOutline, TrashOutline, KeyOutline, SettingsOutline } from '@vicons/ionicons5'
import { useAuthStore } from '@/stores/auth'

interface Customer {
  id: string
  tenant_id: string
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  license_key: string
  license_activated: number
  license_expiry: string
  config: Record<string, any>
  status: string
  max_users: number
  current_users: number
  notes: string
  created_at: number
  updated_at: number
}

const authStore = useAuthStore()
const message = useMessage()

const loading = ref(false)
const customers = ref<Customer[]>([])
const searchQuery = ref('')
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
})

// Modal states
const showCreateModal = ref(false)
const showEditModal = ref(false)
const showConfigModal = ref(false)
const showActivateModal = ref(false)
const editingCustomer = ref<Customer | null>(null)
const formRef = ref<FormInst | null>(null)
const activating = ref(false)

const formData = ref({
  company_name: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  max_users: 10,
  notes: '',
})

const activationForm = ref({
  activationCode: '',
  expiryDays: 365,
})

const customerConfig = ref<Record<string, any>>({})
const configSaving = ref(false)

async function loadCustomers() {
  loading.value = true
  try {
    const token = authStore.getToken()
    const params = new URLSearchParams({
      page: pagination.value.page.toString(),
      pageSize: pagination.value.pageSize.toString(),
      search: searchQuery.value,
    })
    const res = await fetch(`/api/customers?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (data.ok) {
      customers.value = data.data
      pagination.value = { ...pagination.value, ...data.pagination }
    }
  } catch (e) {
    message.error('加载客户列表失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  pagination.value.page = 1
  loadCustomers()
}

function handlePageChange(page: number) {
  pagination.value.page = page
  loadCustomers()
}

function handlePageSizeChange(pageSize: number) {
  pagination.value.pageSize = pageSize
  pagination.value.page = 1
  loadCustomers()
}

function openCreateModal() {
  formData.value = {
    company_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    max_users: 10,
    notes: '',
  }
  showCreateModal.value = true
}

async function confirmCreate() {
  if (!formData.value.company_name.trim()) {
    message.error('公司名称不能为空')
    return
  }
  try {
    const token = authStore.getToken()
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(formData.value),
    })
    const data = await res.json()
    if (data.ok) {
      message.success('客户创建成功')
      showCreateModal.value = false
      loadCustomers()
    } else {
      message.error(data.error || '创建失败')
    }
  } catch (e) {
    message.error('请求失败')
  }
}

function openEditModal(row: Customer) {
  editingCustomer.value = row
  formData.value = {
    company_name: row.company_name,
    contact_name: row.contact_name || '',
    contact_email: row.contact_email || '',
    contact_phone: row.contact_phone || '',
    max_users: row.max_users,
    notes: row.notes || '',
  }
  showEditModal.value = true
}

async function confirmEdit() {
  if (!formData.value.company_name.trim()) {
    message.error('公司名称不能为空')
    return
  }
  if (!editingCustomer.value) return
  try {
    const token = authStore.getToken()
    const res = await fetch(`/api/customers/${editingCustomer.value.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(formData.value),
    })
    const data = await res.json()
    if (data.ok) {
      message.success('客户信息已更新')
      showEditModal.value = false
      loadCustomers()
    } else {
      message.error(data.error || '更新失败')
    }
  } catch (e) {
    message.error('请求失败')
  }
}

async function handleDelete(row: Customer) {
  if (!confirm(`确定要删除客户「${row.company_name}」吗？此操作不可撤销。`)) return
  try {
    const token = authStore.getToken()
    const res = await fetch(`/api/customers/${row.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (data.ok) {
      message.success('客户已删除')
      loadCustomers()
    } else {
      message.error(data.error || '删除失败')
    }
  } catch (e) {
    message.error('请求失败')
  }
}

function openActivateModal(row: Customer) {
  editingCustomer.value = row
  activationForm.value = { activationCode: '', expiryDays: 365 }
  showActivateModal.value = true
}

async function confirmActivate() {
  if (!editingCustomer.value) return
  if (!activationForm.value.activationCode || activationForm.value.activationCode.length < 16) {
    message.error('激活码至少16位')
    return
  }
  activating.value = true
  try {
    const token = authStore.getToken()
    const res = await fetch(`/api/customers/${editingCustomer.value.id}/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(activationForm.value),
    })
    const data = await res.json()
    if (data.ok) {
      message.success('激活成功')
      showActivateModal.value = false
      loadCustomers()
    } else {
      message.error(data.error || '激活失败')
    }
  } catch (e) {
    message.error('请求失败')
  } finally {
    activating.value = false
  }
}

async function handleDeactivate(row: Customer) {
  try {
    const token = authStore.getToken()
    const res = await fetch(`/api/customers/${row.id}/deactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (data.ok) {
      message.success('已取消激活')
      loadCustomers()
    }
  } catch (e) {
    message.error('请求失败')
  }
}

async function openConfigModal(row: Customer) {
  editingCustomer.value = row
  customerConfig.value = { ...row.config }
  showConfigModal.value = true
}

async function saveConfig() {
  if (!editingCustomer.value) return
  configSaving.value = true
  try {
    const token = authStore.getToken()
    const res = await fetch(`/api/customers/${editingCustomer.value.id}/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(customerConfig.value),
    })
    const data = await res.json()
    if (data.ok) {
      message.success('配置已保存')
      showConfigModal.value = false
      loadCustomers()
    } else {
      message.error(data.error || '保存失败')
    }
  } catch (e) {
    message.error('请求失败')
  } finally {
    configSaving.value = false
  }
}

function formatDate(ts: number) {
  if (!ts) return '-'
  return new Date(ts).toLocaleDateString('zh-CN')
}

function formatDateISO(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

const columns: DataTableColumns<Customer> = [
  { title: '租户ID', key: 'tenant_id', width: 140, ellipsis: { tooltip: true } },
  { title: '公司名称', key: 'company_name', width: 180 },
  { title: '联系人', key: 'contact_name', width: 100 },
  { title: '邮箱', key: 'contact_email', width: 160 },
  {
    title: '授权状态',
    key: 'license_activated',
    width: 100,
    render(row) {
      if (row.license_activated) {
        return h(NTag, { type: 'success', size: 'small' }, { default: () => '已激活' })
      }
      return h(NTag, { type: 'error', size: 'small' }, { default: () => '未激活' })
    },
  },
  {
    title: '有效期至',
    key: 'license_expiry',
    width: 120,
    render(row) {
      return formatDateISO(row.license_expiry)
    },
  },
  {
    title: '账户状态',
    key: 'status',
    width: 90,
    render(row) {
      const typeMap: Record<string, 'success' | 'warning' | 'error'> = {
        active: 'success',
        suspended: 'warning',
        expired: 'error',
      }
      return h(NTag, { type: typeMap[row.status] || 'default', size: 'small' }, { default: () => row.status })
    },
  },
  {
    title: '用户数',
    key: 'current_users',
    width: 80,
    render(row) {
      return `${row.current_users}/${row.max_users}`
    },
  },
  {
    title: '创建时间',
    key: 'created_at',
    width: 120,
    render(row) {
      return formatDate(row.created_at)
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 240,
    fixed: 'right',
    render(row) {
      return h(NSpace, { size: 'small' }, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => openEditModal(row) }, {
            icon: () => h(NIcon, { component: CreateOutline }),
            default: () => '编辑',
          }),
          h(NButton, {
            size: 'small',
            type: row.license_activated ? 'error' : 'primary',
            onClick: () => row.license_activated ? handleDeactivate(row) : openActivateModal(row),
          }, {
            icon: () => h(NIcon, { component: KeyOutline }),
            default: () => row.license_activated ? '取消激活' : '激活',
          }),
          h(NButton, { size: 'small', onClick: () => openConfigModal(row) }, {
            icon: () => h(NIcon, { component: SettingsOutline }),
            default: () => '配置',
          }),
          h(NButton, { size: 'small', type: 'error', onClick: () => handleDelete(row) }, {
            icon: () => h(NIcon, { component: TrashOutline }),
            default: () => '删除',
          }),
        ],
      })
    },
  },
]

onMounted(() => {
  loadCustomers()
})
</script>

<template>
  <div style="padding: 20px;">
    <NCard :bordered="false">
      <template #header>
        <NSpace justify="space-between" align="center" style="width: 100%;">
          <span style="font-weight: 600; font-size: 16px;">客户管理</span>
          <NButton type="primary" @click="openCreateModal">
            <template #icon><NIcon :component="AddOutline" /></template>
            新增客户
          </NButton>
        </NSpace>
      </template>

      <template #header-extra>
        <NInput
          v-model:value="searchQuery"
          placeholder="搜索公司名称、联系人..."
          style="width: 240px;"
          @keyup.enter="handleSearch"
        >
          <template #prefix>
            <NIcon :component="SearchOutline" />
          </template>
        </NInput>
      </template>

      <NSpin :show="loading">
        <NDataTable
          v-if="customers.length > 0"
          :columns="columns"
          :data="customers"
          :pagination="{
            page: pagination.page,
            pageSize: pagination.pageSize,
            itemCount: pagination.total,
            showSizePicker: true,
            pageSizes: [10, 20, 50],
          }"
          @update:page="handlePageChange"
          @update:page-size="handlePageSizeChange"
          :remote="true"
          :bordered="false"
        />
        <NEmpty v-else description="暂无客户数据" />
      </NSpin>
    </NCard>

    <!-- Create Modal -->
    <NModal
      v-model:show="showCreateModal"
      preset="card"
      title="新增客户"
      style="width: 500px;"
      :segmented="{ content: true, footer: true }"
    >
      <NForm label-placement="left" label-width="80">
        <NFormItem label="公司名称">
          <NInput v-model:value="formData.company_name" placeholder="必填" />
        </NFormItem>
        <NFormItem label="联系人">
          <NInput v-model:value="formData.contact_name" />
        </NFormItem>
        <NFormItem label="邮箱">
          <NInput v-model:value="formData.contact_email" placeholder="example@company.com" />
        </NFormItem>
        <NFormItem label="电话">
          <NInput v-model:value="formData.contact_phone" />
        </NFormItem>
        <NFormItem label="最大用户数">
          <NInputNumber v-model:value="formData.max_users" :min="1" :max="1000" style="width: 100%;" />
        </NFormItem>
        <NFormItem label="备注">
          <NInput v-model:value="formData.notes" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showCreateModal = false">取消</NButton>
          <NButton type="primary" @click="confirmCreate">创建</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- Edit Modal -->
    <NModal
      v-model:show="showEditModal"
      preset="card"
      title="编辑客户"
      style="width: 500px;"
      :segmented="{ content: true, footer: true }"
    >
      <NForm label-placement="left" label-width="80">
        <NFormItem label="公司名称">
          <NInput v-model:value="formData.company_name" />
        </NFormItem>
        <NFormItem label="联系人">
          <NInput v-model:value="formData.contact_name" />
        </NFormItem>
        <NFormItem label="邮箱">
          <NInput v-model:value="formData.contact_email" placeholder="example@company.com" />
        </NFormItem>
        <NFormItem label="电话">
          <NInput v-model:value="formData.contact_phone" />
        </NFormItem>
        <NFormItem label="最大用户数">
          <NInputNumber v-model:value="formData.max_users" :min="1" :max="1000" style="width: 100%;" />
        </NFormItem>
        <NFormItem label="备注">
          <NInput v-model:value="formData.notes" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showEditModal = false">取消</NButton>
          <NButton type="primary" @click="confirmEdit">保存</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- Activate Modal -->
    <NModal
      v-model:show="showActivateModal"
      preset="card"
      title="激活客户授权"
      style="width: 500px;"
      :segmented="{ content: true, footer: true }"
    >
      <NForm label-placement="left" label-width="80">
        <NFormItem label="激活码">
          <NInput
            v-model:value="activationForm.activationCode"
            type="textarea"
            placeholder="输入16位以上激活码"
            :autosize="{ minRows: 3, maxRows: 6 }"
          />
        </NFormItem>
        <NFormItem label="有效天数">
          <NInputNumber v-model:value="activationForm.expiryDays" :min="1" :max="3650" style="width: 100%;" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showActivateModal = false">取消</NButton>
          <NButton type="primary" :loading="activating" @click="confirmActivate">激活</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- Config Modal -->
    <NModal
      v-model:show="showConfigModal"
      preset="card"
      title="客户独立配置"
      style="width: 600px;"
      :segmented="{ content: true, footer: true }"
    >
      <NForm label-placement="left" label-width="120">
        <NFormItem label="模型地址">
          <NInput v-model:value="customerConfig.model_url" placeholder="例如：https://api.openai.com/v1" />
        </NFormItem>
        <NFormItem label="模型名称">
          <NInput v-model:value="customerConfig.model_name" placeholder="例如：gpt-4" />
        </NFormItem>
        <NFormItem label="Hermes Web URL">
          <NInput v-model:value="customerConfig.hermes_web_url" />
        </NFormItem>
        <NFormItem label="Hermes API URL">
          <NInput v-model:value="customerConfig.hermes_api_url" />
        </NFormItem>
        <NFormItem label="OpenClaw WS URL">
          <NInput v-model:value="customerConfig.openclaw_ws_url" />
        </NFormItem>
        <NFormItem label="其他配置 (JSON)">
          <NInput
            v-model:value="customerConfig._rawJson"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 8 }"
            placeholder='{"key": "value"}'
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showConfigModal = false">取消</NButton>
          <NButton type="primary" :loading="configSaving" @click="saveConfig">保存配置</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
