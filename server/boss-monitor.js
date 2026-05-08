// boss-monitor.js - 自动告警规则轮询监控
// 定期检查 Agent 状态、任务进度、系统指标，自动生成告警

import db from './database.js'
import { randomUUID } from 'crypto'
import { pushAlert } from './boss-alert-push.js'

const MONITOR_INTERVAL = 60 * 1000 // 每分钟轮询一次
const alertHistory = new Set() // 防重复告警 (key: `${agentId}:${ruleName}`)
const alertHistoryExpiry = new Map() // key -> expiry timestamp
const HISTORY_TTL = 30 * 60 * 1000 // 30分钟内相同规则不重复告警

let monitorTimer = null
let isRunning = false

// ============ 告警规则 ============

function checkAgentConnectivity() {
  const alerts = []
  const agents = db.prepare("SELECT * FROM boss_agents WHERE status = 'active'").all()

  for (const agent of agents) {
    const cacheKey = `${agent.id}:connectivity`
    if (alertHistory.has(cacheKey)) continue

    // 检查 Agent 最后活跃时间 (超过 10 分钟未活跃视为离线)
    const offlineThreshold = Date.now() - 10 * 60 * 1000
    if (agent.last_activity && agent.last_activity < offlineThreshold) {
      alerts.push({
        id: randomUUID(),
        title: `Agent 离线: ${agent.name}`,
        message: `Agent "${agent.name}" 已超过 10 分钟未活动，最后活跃: ${new Date(agent.last_activity).toLocaleString('zh-CN')}`,
        level: 'warning',
        source: 'monitor',
        agent_id: agent.id,
        created_at: Date.now(),
      })
      markAlerted(cacheKey)
    }
  }
  return alerts
}

function checkAgentFailureRate() {
  const alerts = []
  const agents = db.prepare("SELECT * FROM boss_agents WHERE status = 'active'").all()

  for (const agent of agents) {
    const cacheKey = `${agent.id}:failure_rate`
    if (alertHistory.has(cacheKey)) continue

    const totalTasks = agent.total_tasks || 0
    const failedTasks = agent.failed_tasks || 0

    if (totalTasks >= 5) {
      const failureRate = failedTasks / totalTasks
      if (failureRate > 0.5) {
        alerts.push({
          id: randomUUID(),
          title: `Agent 高失败率: ${agent.name}`,
          message: `Agent "${agent.name}" 失败率达 ${Math.round(failureRate * 100)}% (${failedTasks}/${totalTasks})，请检查配置或任务类型`,
          level: 'error',
          source: 'monitor',
          agent_id: agent.id,
          created_at: Date.now(),
        })
        markAlerted(cacheKey)
      }
    }
  }
  return alerts
}

function checkStuckTasks() {
  const alerts = []
  const cacheKey = 'tasks:stuck'
  if (alertHistory.has(cacheKey)) return alerts

  // 查询超过 2 小时未更新且状态为 in_progress 的任务
  const stuckThreshold = Date.now() - 2 * 60 * 60 * 1000
  const stuckTasks = db.prepare(
    `SELECT t.*, a.name as agent_name
     FROM boss_tasks t
     LEFT JOIN boss_agents a ON t.agent_id = a.id
     WHERE t.status = 'in_progress' AND t.updated_at < ?`
  ).all(stuckThreshold)

  if (stuckTasks.length > 0) {
    alerts.push({
      id: randomUUID(),
      title: `发现 ${stuckTasks.length} 个卡住的任务`,
      message: stuckTasks.map(t => `• ${t.title} (Agent: ${t.agent_name || '未知'}, 更新于: ${new Date(t.updated_at).toLocaleString('zh-CN')})`).join('\n'),
      level: 'warning',
      source: 'monitor',
      created_at: Date.now(),
    })
    markAlerted(cacheKey)
  }
  return alerts
}

function checkOverdueTasks() {
  const alerts = []
  const cacheKey = 'tasks:overdue'
  if (alertHistory.has(cacheKey)) return alerts

  const now = Date.now()
  const overdueTasks = db.prepare(
    `SELECT t.*, a.name as agent_name
     FROM boss_tasks t
     LEFT JOIN boss_agents a ON t.agent_id = a.id
     WHERE t.due_date IS NOT NULL AND t.due_date < ? AND t.status NOT IN ('done', 'cancelled')`
  ).all(now)

  if (overdueTasks.length > 0) {
    alerts.push({
      id: randomUUID(),
      title: `${overdueTasks.length} 个任务已逾期`,
      message: overdueTasks.slice(0, 5).map(t => `• ${t.title} (截止: ${new Date(t.due_date).toLocaleString('zh-CN')})`).join('\n') + (overdueTasks.length > 5 ? `\n...还有 ${overdueTasks.length - 5} 个` : ''),
      level: 'error',
      source: 'monitor',
      created_at: Date.now(),
    })
    markAlerted(cacheKey)
  }
  return alerts
}

function checkTaskBacklog() {
  const alerts = []
  const cacheKey = 'tasks:backlog'
  if (alertHistory.has(cacheKey)) return alerts

  const pendingCount = db.prepare("SELECT COUNT(*) as count FROM boss_tasks WHERE status = 'todo'").get().count
  const threshold = 20 // 待处理任务超过 20 个触发告警

  if (pendingCount > threshold) {
    alerts.push({
      id: randomUUID(),
      title: '任务积压过多',
      message: `当前有 ${pendingCount} 个待处理任务，建议及时分配或优先级排序`,
      level: 'warning',
      source: 'monitor',
      created_at: Date.now(),
    })
    markAlerted(cacheKey)
  }
  return alerts
}

function checkCriticalAlertsUnresolved() {
  const alerts = []
  const cacheKey = 'alerts:critical_unresolved'
  if (alertHistory.has(cacheKey)) return alerts

  const unresolvedCritical = db.prepare("SELECT COUNT(*) as count FROM boss_alerts WHERE level = 'critical' AND resolved = 0").get().count

  if (unresolvedCritical > 0) {
    alerts.push({
      id: randomUUID(),
      title: '严重告警未处理',
      message: `当前有 ${unresolvedCritical} 条严重告警尚未处理，请立即关注`,
      level: 'critical',
      source: 'monitor',
      created_at: Date.now(),
    })
    markAlerted(cacheKey)
  }
  return alerts
}

// ============ 辅助函数 ============

function markAlerted(key) {
  alertHistory.add(key)
  alertHistoryExpiry.set(key, Date.now() + HISTORY_TTL)
}

function cleanupExpiredAlerts() {
  const now = Date.now()
  for (const [key, expiry] of alertHistoryExpiry) {
    if (now > expiry) {
      alertHistory.delete(key)
      alertHistoryExpiry.delete(key)
    }
  }
}

function saveAlerts(alerts) {
  if (alerts.length === 0) return []

  const insert = db.prepare(
    `INSERT OR IGNORE INTO boss_alerts (id, title, message, level, source, agent_id, task_id, resolved, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
  )

  const savedIds = []
  const insertMany = db.transaction((items) => {
    for (const a of items) {
      const result = insert.run(a.id, a.title, a.message, a.level, a.source, a.agent_id || null, a.task_id || null, a.created_at)
      if (result.changes > 0) {
        savedIds.push(a.id)
      }
    }
  })

  insertMany(alerts)
  return savedIds
}

// ============ 监控主循环 ============

function runMonitorCycle() {
  if (isRunning) return
  isRunning = true

  try {
    cleanupExpiredAlerts()

    const allAlerts = [
      ...checkAgentConnectivity(),
      ...checkAgentFailureRate(),
      ...checkStuckTasks(),
      ...checkOverdueTasks(),
      ...checkTaskBacklog(),
      ...checkCriticalAlertsUnresolved(),
    ]

    if (allAlerts.length > 0) {
      const savedIds = saveAlerts(allAlerts)
      console.log(`[BossMonitor] Generated ${savedIds.length} new alert(s)`)

      // 推送严重/错误级别告警
      for (const alert of allAlerts) {
        if (alert.level === 'critical' || alert.level === 'error') {
          pushAlert(alert).catch(err => console.error('[BossMonitor] Push failed:', err.message))
        }
      }
    }
  } catch (err) {
    console.error('[BossMonitor] Error in monitor cycle:', err.message)
  } finally {
    isRunning = false
  }
}

// ============ 启动/停止 ============

export function startMonitor() {
  if (monitorTimer) return
  console.log('[BossMonitor] Starting monitor (interval: 60s)')
  runMonitorCycle() // 立即执行一次
  monitorTimer = setInterval(runMonitorCycle, MONITOR_INTERVAL)
}

export function stopMonitor() {
  if (monitorTimer) {
    clearInterval(monitorTimer)
    monitorTimer = null
    console.log('[BossMonitor] Monitor stopped')
  }
}

// ============ 手动触发 & 规则配置 API ============

export function getMonitorRules(req, res) {
  res.json({
    ok: true,
    rules: [
      { id: 'connectivity', name: 'Agent 离线检测', enabled: true, description: 'Agent 超过 10 分钟未活动视为离线' },
      { id: 'failure_rate', name: '高失败率检测', enabled: true, description: '失败率超过 50% 触发告警' },
      { id: 'stuck_tasks', name: '卡住任务检测', enabled: true, description: '任务超过 2 小时未更新' },
      { id: 'overdue_tasks', name: '逾期任务检测', enabled: true, description: '任务超过截止日期仍未完成' },
      { id: 'task_backlog', name: '任务积压检测', enabled: true, description: '待处理任务超过 20 个' },
      { id: 'critical_unresolved', name: '严重告警未处理', enabled: true, description: '存在未处理的严重告警' },
    ],
  })
}

export function triggerMonitor(req, res) {
  runMonitorCycle()
  res.json({ ok: true, message: 'Monitor cycle triggered' })
}
