<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCompanyStore } from '@/stores/company'
import { NCard, NForm, NFormItem, NInput, NInputNumber, NButton, NSpin, NAlert, NSpace, NDivider, NPopconfirm } from 'naive-ui'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const companyStore = useCompanyStore()
const loading = ref(false)
const saving = ref(false)
const saveSuccess = ref(false)
const saveError = ref<string | null>(null)

// Form state — deep clone to avoid mutating store directly
const form = ref({
  legal_name: '',
  industry: '',
  business_model: '',
  target_revenue_monthly: 0,
  cost_per_lead: 0,
  cpa_limit: 0,
  roas_target: 0,
})

onMounted(async () => {
  loading.value = true
  try {
    await companyStore.fetchConfig()
    const c = companyStore.config
    form.value = {
      legal_name: c.legal_name || '',
      industry: c.industry || '',
      business_model: c.business_model || '',
      target_revenue_monthly: c.target_revenue_monthly || 0,
      cost_per_lead: c.cost_per_lead || 0,
      cpa_limit: c.cpa_limit || 0,
      roas_target: c.roas_target || 0,
    }
  } finally {
    loading.value = false
  }
})

async function handleSave() {
  saving.value = true
  saveSuccess.value = false
  saveError.value = null
  try {
    await companyStore.saveConfig({
      legal_name: form.value.legal_name,
      industry: form.value.industry,
      business_model: form.value.business_model,
      target_revenue_monthly: form.value.target_revenue_monthly || undefined,
      cost_per_lead: form.value.cost_per_lead || undefined,
      cpa_limit: form.value.cpa_limit || undefined,
      roas_target: form.value.roas_target || undefined,
    })
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 3000)
  } catch (e: any) {
    saveError.value = e.message
  } finally {
    saving.value = false
  }
}

async function handleReset() {
  loading.value = true
  try {
    await companyStore.fetchConfig()
    const c = companyStore.config
    form.value = {
      legal_name: c.legal_name || '',
      industry: c.industry || '',
      business_model: c.business_model || '',
      target_revenue_monthly: c.target_revenue_monthly || 0,
      cost_per_lead: c.cost_per_lead || 0,
      cpa_limit: c.cpa_limit || 0,
      roas_target: c.roas_target || 0,
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <NSpin :show="loading">
    <div class="company-config" style="padding: 20px; max-width: 720px; margin: 0 auto;">
      <h2 style="margin-bottom: 8px;">公司配置中心</h2>
      <p style="color: #888; margin-bottom: 24px; font-size: 13px;">
        配置公司基本参数，用于运营分析、健康度评分和目标追踪。
      </p>

      <!-- Save feedback -->
      <NAlert v-if="saveSuccess" type="success" closable style="margin-bottom: 16px;">
        配置已保存
      </NAlert>
      <NAlert v-if="saveError" type="error" closable style="margin-bottom: 16px;">
        保存失败：{{ saveError }}
      </NAlert>

      <NCard :bordered="false" size="small" style="margin-bottom: 16px;">
        <NDivider style="margin-top: 0;">基本信息</NDivider>
        <NForm label-placement="left" label-width="160">
          <NFormItem label="公司名称" path="legal_name">
            <NInput
              v-model:value="form.legal_name"
              placeholder="例如：道益科技"
              clearable
            />
          </NFormItem>

          <NFormItem label="所属行业" path="industry">
            <NInput
              v-model:value="form.industry"
              placeholder="例如：跨境电商 / AI SaaS / 内容创作"
              clearable
            />
          </NFormItem>

          <NFormItem label="商业模式" path="business_model">
            <NInput
              v-model:value="form.business_model"
              placeholder="例如：DTC品牌出海 / B2B企业服务 / 订阅制SaaS"
              clearable
            />
          </NFormItem>
        </NForm>
      </NCard>

      <NCard :bordered="false" size="small" style="margin-bottom: 16px;">
        <NDivider style="margin-top: 0;">经营目标</NDivider>
        <NForm label-placement="left" label-width="160">
          <NFormItem label="月营收目标 ($)" path="target_revenue_monthly">
            <NInputNumber
              v-model:value="form.target_revenue_monthly"
              placeholder="10000"
              :min="0"
              clearable
              style="width: 100%;"
            />
          </NFormItem>

          <NFormItem label="获客成本 (Cost/Lead)" path="cost_per_lead">
            <NInputNumber
              v-model:value="form.cost_per_lead"
              placeholder="例如：5.00"
              :min="0"
              :precision="2"
              clearable
              style="width: 100%;"
            />
          </NFormItem>

          <NFormItem label="CPA 上限 ($)" path="cpa_limit">
            <NInputNumber
              v-model:value="form.cpa_limit"
              placeholder="例如：50.00"
              :min="0"
              :precision="2"
              clearable
              style="width: 100%;"
            />
          </NFormItem>

          <NFormItem label="ROAS 目标" path="roas_target">
            <NInputNumber
              v-model:value="form.roas_target"
              placeholder="例如：3.0（投产比）"
              :min="0"
              :precision="2"
              clearable
              style="width: 100%;"
            />
          </NFormItem>
        </NForm>
      </NCard>

      <NSpace justify="end" style="margin-top: 24px;">
        <NPopconfirm @positive-click="handleReset">
          <template #trigger>
            <NButton>重置</NButton>
          </template>
          确认重置为已保存的配置？
        </NPopconfirm>
        <NButton type="primary" :loading="saving" @click="handleSave">
          保存配置
        </NButton>
      </NSpace>
    </div>
  </NSpin>
</template>
