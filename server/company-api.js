import db, { getCompanyConfig, updateCompanyConfig, addBusinessMetric, getBusinessMetrics, getLatestMetric, deleteBusinessMetrics, getMetricsSummary, getMetricsTrend, seedDemoMetrics } from './database.js'

// ============ Company Config API ============

export function getCompanyConfigHandler(req, res) {
  try {
    const config = getCompanyConfig()
    res.json({ ok: true, data: config || {} })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function updateCompanyConfigHandler(req, res) {
  try {
    const allowed = ['legal_name', 'industry', 'business_model', 'target_revenue_monthly',
      'cost_per_lead', 'cpa_limit', 'roas_target', 'brand_colors', 'logo_url']
    const updates = {}
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key]
    }
    updateCompanyConfig(updates)
    res.json({ ok: true, data: getCompanyConfig() })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

// ============ Business Metrics API ============

export function addMetricHandler(req, res) {
  try {
    const { date, category, metric_name, value, unit, source } = req.body
    if (!date || !category || !metric_name || value === undefined) {
      return res.status(400).json({ ok: false, error: 'date, category, metric_name, value 为必填' })
    }
    const id = addBusinessMetric({ date, category, metric_name, value, unit, source })
    res.json({ ok: true, id })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function batchAddMetricsHandler(req, res) {
  try {
    const metrics = req.body.metrics || []
    if (!Array.isArray(metrics) || metrics.length === 0) {
      return res.status(400).json({ ok: false, error: 'metrics 数组不能为空' })
    }
    const ids = []
    for (const m of metrics) {
      if (m.date && m.category && m.metric_name !== undefined) {
        ids.push(addBusinessMetric(m))
      }
    }
    res.json({ ok: true, count: ids.length, ids })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function getMetricsHandler(req, res) {
  try {
    const { category, start_date, end_date, limit = 100 } = req.query
    const data = getBusinessMetrics({
      category,
      startDate: start_date,
      endDate: end_date,
      limit: parseInt(limit)
    })
    res.json({ ok: true, data, total: data.length })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function deleteMetricsHandler(req, res) {
  try {
    const { category, start_date, end_date } = req.body
    const deleted = deleteBusinessMetrics({
      category,
      startDate: start_date,
      endDate: end_date
    })
    res.json({ ok: true, deleted })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

// ============ Metrics Summary & Trend ============

export function getMetricsSummaryHandler(req, res) {
  try {
    const summary = getMetricsSummary()
    res.json({ ok: true, data: summary })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function getMetricsTrendHandler(req, res) {
  try {
    const days = parseInt(req.query.days) || 7
    const points = getMetricsTrend(Math.min(days, 90))
    res.json({ ok: true, data: points })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function seedMetricsHandler(req, res) {
  try {
    const result = seedDemoMetrics()
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

// ============ Health Score API ============

export function getHealthScoreHandler(req, res) {
  try {
    const score = calculateHealthScore()
    res.json({ ok: true, data: score })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

function calculateHealthScore() {
  // 1. Agent Health (25%): 活跃 agent 占比
  const totalAgents = db.prepare('SELECT COUNT(*) as c FROM boss_agents').get().c
  const activeAgents = db.prepare("SELECT COUNT(*) as c FROM boss_agents WHERE status = 'active'").get().c
  const agentScore = totalAgents > 0 ? (activeAgents / totalAgents) * 100 : 0

  // 2. Task Health (25%): 完成率
  const totalTasks = db.prepare('SELECT COUNT(*) as c FROM boss_tasks').get().c
  const doneTasks = db.prepare("SELECT COUNT(*) as c FROM boss_tasks WHERE status = 'done'").get().c
  const taskScore = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 50

  // 3. Alert Health (25%): 无未解决严重告警
  const criticalUnresolved = db.prepare("SELECT COUNT(*) as c FROM boss_alerts WHERE resolved = 0 AND level IN ('critical', 'error')").get().c
  const warningUnresolved = db.prepare("SELECT COUNT(*) as c FROM boss_alerts WHERE resolved = 0 AND level = 'warning'").get().c
  const alertScore = Math.max(0, 100 - criticalUnresolved * 30 - warningUnresolved * 10)

  // 4. Metric Health (25%): 基于最新业务指标
  const revenue = getLatestMetric('finance', 'daily_revenue')
  const config = getCompanyConfig()
  let metricScore = 50
  if (config && config.target_revenue_monthly) {
    const dailyTarget = config.target_revenue_monthly / 30
    if (revenue && revenue.value > 0) {
      metricScore = Math.min(100, (revenue.value / dailyTarget) * 100)
    }
  }

  const total = agentScore * 0.25 + taskScore * 0.25 + alertScore * 0.25 + metricScore * 0.25
  const level = total >= 80 ? 'healthy' : total >= 60 ? 'warning' : total >= 40 ? 'at_risk' : 'critical'

  return {
    total: Math.round(total * 10) / 10,
    level,
    breakdown: {
      agent_health: Math.round(agentScore * 10) / 10,
      task_health: Math.round(taskScore * 10) / 10,
      alert_health: Math.round(alertScore * 10) / 10,
      metric_health: Math.round(metricScore * 10) / 10,
    },
    details: {
      agent_score: { total: totalAgents, active: activeAgents, score: Math.round(agentScore * 10) / 10 },
      task_score: { total: totalTasks, done: doneTasks, score: Math.round(taskScore * 10) / 10 },
      alert_score: { critical_unresolved: criticalUnresolved, warning_unresolved: warningUnresolved, score: Math.round(alertScore * 10) / 10 },
      metric_score: { latest_revenue: revenue?.value || 0, daily_target: config?.target_revenue_monthly ? (config.target_revenue_monthly / 30).toFixed(2) : 'N/A', score: Math.round(metricScore * 10) / 10 },
    }
  }
}
