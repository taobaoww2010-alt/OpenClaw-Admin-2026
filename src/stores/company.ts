import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'

// ============ Types ============

export interface CompanyConfig {
  id?: string
  legal_name?: string
  industry?: string
  business_model?: string
  target_revenue_monthly?: number
  cost_per_lead?: number
  cpa_limit?: number
  roas_target?: number
  brand_colors?: Record<string, string>
  logo_url?: string
  created_at?: number
  updated_at?: number
}

export interface BusinessMetric {
  id: string
  date: string
  category: string
  metric_name: string
  value: number
  unit: string
  source?: string
  created_at?: number
}

export interface MetricsSummary {
  today: { revenue: number; cost: number }
  week: { revenue: number; cost: number }
  month: { revenue: number; cost: number; days_with_data: number }
  latest: { cpa: number; roas: number }
  top_revenue_days: Array<{ date: string; value: number }>
}

export interface TrendPoint {
  date: string
  revenue: number
  cost: number
  cpa: number | null
}

export interface HealthScore {
  total: number
  level: 'healthy' | 'warning' | 'at_risk' | 'critical'
  breakdown: {
    agent_health: number
    task_health: number
    alert_health: number
    metric_health: number
  }
  details: Record<string, any>
}

// ============ API Helper ============

function companyApi(path: string, options?: RequestInit): Promise<any> {
  const authStore = useAuthStore()
  const token = authStore.getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options?.headers as any) }
  if (token) headers['Authorization'] = `Bearer ${token}`

  return fetch(`/api/company${path}`, { ...options, headers }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || res.statusText)
    }
    return res.json()
  })
}

// ============ Store ============

export const useCompanyStore = defineStore('company', () => {
  // State
  const config = ref<CompanyConfig>({})
  const metrics = ref<BusinessMetric[]>([])
  const metricsSummary = ref<MetricsSummary | null>(null)
  const metricsTrend = ref<TrendPoint[]>([])
  const healthScore = ref<HealthScore | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // ============ Company Config ============

  async function fetchConfig() {
    loading.value = true
    error.value = null
    try {
      const data = await companyApi('/config')
      config.value = data.data || {}
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function saveConfig(updates: Partial<CompanyConfig>) {
    loading.value = true
    error.value = null
    try {
      const data = await companyApi('/config', {
        method: 'PUT',
        body: JSON.stringify(updates),
      })
      config.value = data.data || {}
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  // ============ Business Metrics ============

  async function addMetric(metric: Omit<BusinessMetric, 'id'>) {
    loading.value = true
    error.value = null
    try {
      await companyApi('/metrics', {
        method: 'POST',
        body: JSON.stringify(metric),
      })
      await fetchMetrics()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function batchAddMetrics(metricsList: Omit<BusinessMetric, 'id'>[]) {
    loading.value = true
    error.value = null
    try {
      await companyApi('/metrics/batch', {
        method: 'POST',
        body: JSON.stringify({ metrics: metricsList }),
      })
      await fetchMetrics()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchMetrics(filters?: { category?: string; start_date?: string; end_date?: string }) {
    loading.value = true
    error.value = null
    try {
      const params = new URLSearchParams()
      if (filters) {
        for (const [k, v] of Object.entries(filters)) {
          if (v) params.set(k, v)
        }
      }
      const data = await companyApi(`/metrics?${params.toString()}`)
      metrics.value = data.data || []
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function deleteMetrics(filters?: { category?: string; start_date?: string; end_date?: string }) {
    loading.value = true
    error.value = null
    try {
      await companyApi('/metrics', {
        method: 'DELETE',
        body: JSON.stringify(filters || {}),
      })
      await fetchMetrics()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  // ============ Metrics Summary & Trend ============

  async function fetchMetricsSummary() {
    loading.value = true
    error.value = null
    try {
      const data = await companyApi('/metrics/summary')
      metricsSummary.value = data.data
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchMetricsTrend(days = 7) {
    loading.value = true
    error.value = null
    try {
      const data = await companyApi(`/metrics/trend?days=${days}`)
      metricsTrend.value = data.data || []
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function seedDemoMetrics() {
    loading.value = true
    error.value = null
    try {
      await companyApi('/metrics/seed', { method: 'POST' })
      await Promise.all([fetchMetricsSummary(), fetchMetricsTrend(), fetchHealthScore()])
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  // ============ Health Score ============

  async function fetchHealthScore() {
    loading.value = true
    error.value = null
    try {
      const data = await companyApi('/health')
      healthScore.value = data.data
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function loadAll() {
    await Promise.all([fetchConfig(), fetchHealthScore(), fetchMetricsSummary(), fetchMetricsTrend()])
  }

  return {
    config, metrics, metricsSummary, metricsTrend, healthScore, loading, error,
    fetchConfig, saveConfig,
    addMetric, batchAddMetrics, fetchMetrics, deleteMetrics,
    fetchMetricsSummary, fetchMetricsTrend, seedDemoMetrics,
    fetchHealthScore,
    loadAll,
  }
})
