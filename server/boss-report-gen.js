// boss-report-gen.js - 自动日报生成模块
// 根据当天的任务、告警、Agent 活动数据自动生成运营日报

import db from './database.js'
import { randomUUID } from 'crypto'

// ============ 数据收集 ============

function collectDailyMetrics(dateStr) {
  const startOfDay = new Date(dateStr)
  startOfDay.setHours(0, 0, 0, 0)
  const startTs = startOfDay.getTime()

  const endOfDay = new Date(dateStr)
  endOfDay.setHours(23, 59, 59, 999)
  const endTs = endOfDay.getTime()

  // 任务统计
  const tasksCreated = db.prepare(
    'SELECT COUNT(*) as count FROM boss_tasks WHERE created_at >= ? AND created_at <= ?'
  ).get(startTs, endTs).count

  const tasksCompleted = db.prepare(
    "SELECT COUNT(*) as count FROM boss_tasks WHERE status = 'done' AND completed_at >= ? AND completed_at <= ?"
  ).get(startTs, endTs).count

  const tasksFailed = db.prepare(
    "SELECT COUNT(*) as count FROM boss_tasks WHERE status = 'done' AND completed_at >= ? AND completed_at <= ? AND priority = 'urgent'"
  ).get(startTs, endTs).count // Simplified - in reality would need a failed status

  const pendingTasks = db.prepare(
    "SELECT COUNT(*) as count FROM boss_tasks WHERE status IN ('todo', 'in_progress')"
  ).get().count

  const overdueTasks = db.prepare(
    "SELECT COUNT(*) as count FROM boss_tasks WHERE due_date < ? AND status NOT IN ('done', 'cancelled')"
  ).get(Date.now()).count

  // 告警统计
  const alertsToday = db.prepare(
    'SELECT COUNT(*) as count FROM boss_alerts WHERE created_at >= ? AND created_at <= ?'
  ).get(startTs, endTs).count

  const criticalAlerts = db.prepare(
    "SELECT COUNT(*) as count FROM boss_alerts WHERE level = 'critical' AND created_at >= ? AND created_at <= ?"
  ).get(startTs, endTs).count

  const resolvedAlerts = db.prepare(
    'SELECT COUNT(*) as count FROM boss_alerts WHERE resolved = 1 AND resolved_at >= ? AND resolved_at <= ?'
  ).get(startTs, endTs).count

  // Agent 统计
  const agents = db.prepare('SELECT * FROM boss_agents WHERE status = \'active\'').all()
  const activeAgents = agents.filter(a => a.last_activity && a.last_activity >= startTs && a.last_activity <= endTs).length

  // Agent 任务分布
  const agentTaskStats = agents.map(a => {
    const todayTasks = db.prepare(
      'SELECT COUNT(*) as count FROM boss_tasks WHERE agent_id = ? AND created_at >= ?'
    ).get(a.id, startTs).count

    const completedToday = db.prepare(
      "SELECT COUNT(*) as count FROM boss_tasks WHERE agent_id = ? AND status = 'done' AND completed_at >= ?"
    ).get(a.id, startTs).count

    return {
      name: a.name,
      role: a.role || '未指定',
      tasksToday: todayTasks,
      completedToday,
      lastActivity: a.last_activity ? new Date(a.last_activity).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '无活动',
    }
  })

  // 任务分类统计
  const categoryStats = db.prepare(
    'SELECT category, COUNT(*) as count FROM boss_tasks WHERE created_at >= ? AND category IS NOT NULL GROUP BY category ORDER BY count DESC'
  ).all(startTs).map(r => ({ category: r.category, count: r.count }))

  return {
    tasksCreated,
    tasksCompleted,
    tasksFailed,
    pendingTasks,
    overdueTasks,
    alertsToday,
    criticalAlerts,
    resolvedAlerts,
    activeAgents,
    totalAgents: agents.length,
    agentTaskStats,
    categoryStats,
  }
}

// ============ 报告生成 ============

function generateReportContent(metrics, dateStr) {
  const date = new Date(dateStr)
  const dateStrFormatted = date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  let content = `# ${dateStrFormatted} 运营日报\n\n`

  // 一、数据概览
  content += `## 一、今日数据概览\n\n`
  content += `| 指标 | 数值 |\n|------|------|\n`
  content += `| 新增任务 | ${metrics.tasksCreated} |\n`
  content += `| 完成任务 | ${metrics.tasksCompleted} |\n`
  content += `| 进行中/待处理 | ${metrics.pendingTasks} |\n`
  content += `| 逾期任务 | ${metrics.overdueTasks} |\n`
  content += `| 告警总数 | ${metrics.alertsToday} |\n`
  content += `| 严重告警 | ${metrics.criticalAlerts} |\n`
  content += `| 已处理告警 | ${metrics.resolvedAlerts} |\n\n`

  // 完成率
  if (metrics.tasksCreated > 0) {
    const completionRate = Math.round((metrics.tasksCompleted / metrics.tasksCreated) * 100)
    content += `**任务完成率**: ${completionRate}% (${metrics.tasksCompleted}/${metrics.tasksCreated})\n\n`
  }

  // 二、Agent 执行情况
  content += `## 二、Agent 执行情况\n\n`
  content += `活跃 Agent: ${metrics.activeAgents}/${metrics.totalAgents}\n\n`

  for (const agent of metrics.agentTaskStats) {
    content += `### ${agent.name} (${agent.role})\n`
    content += `- 今日任务: ${agent.tasksToday}\n`
    content += `- 已完成: ${agent.completedToday}\n`
    content += `- 最后活跃: ${agent.lastActivity}\n\n`
  }

  // 三、任务分类统计
  if (metrics.categoryStats.length > 0) {
    content += `## 三、任务分类统计\n\n`
    for (const cat of metrics.categoryStats) {
      content += `- ${cat.category}: ${cat.count} 个任务\n`
    }
    content += '\n'
  }

  // 四、问题与风险
  content += `## 四、问题与风险\n\n`
  if (metrics.criticalAlerts > 0) {
    content += `- \U0001f6a8 存在 ${metrics.criticalAlerts} 条严重告警，需要立即关注\n`
  }
  if (metrics.overdueTasks > 0) {
    content += `- \u23f0 有 ${metrics.overdueTasks} 个任务已逾期，请催促处理\n`
  }
  if (metrics.pendingTasks > 15) {
    content += `- \U0001f4cb 待处理任务积压较多 (${metrics.pendingTasks} 个)，建议及时分配\n`
  }
  if (metrics.criticalAlerts === 0 && metrics.overdueTasks === 0 && metrics.pendingTasks <= 15) {
    content += `- 暂无重大问题\n`
  }
  content += '\n'

  // 五、建议
  content += `## 五、明日建议\n\n`
  const suggestions = []
  if (metrics.tasksCompleted < metrics.tasksCreated * 0.5 && metrics.tasksCreated > 0) {
    suggestions.push('任务完成率偏低，建议优化任务分配策略')
  }
  if (metrics.activeAgents < metrics.totalAgents) {
    suggestions.push(`有 ${metrics.totalAgents - metrics.activeAgents} 个 Agent 未活跃，请检查状态`)
  }
  if (metrics.overdueTasks > 0) {
    suggestions.push('优先处理逾期任务')
  }
  if (suggestions.length === 0) {
    suggestions.push('继续保持当前运营节奏')
  }
  for (const s of suggestions) {
    content += `- ${s}\n`
  }

  return content
}

function generateSummary(metrics) {
  const parts = []
  parts.push(`今日新增 ${metrics.tasksCreated} 个任务`)

  if (metrics.tasksCompleted > 0) {
    parts.push(`完成 ${metrics.tasksCompleted} 个`)
  }

  if (metrics.alertsToday > 0) {
    parts.push(`产生 ${metrics.alertsToday} 条告警`)
  }

  if (metrics.criticalAlerts > 0) {
    parts.push(`其中 ${metrics.criticalAlerts} 条严重`)
  }

  if (metrics.activeAgents === metrics.totalAgents) {
    parts.push('所有 Agent 运行正常')
  } else if (metrics.activeAgents > 0) {
    parts.push(`${metrics.activeAgents}/${metrics.totalAgents} 个 Agent 活跃`)
  }

  return parts.join('，') + '。'
}

// ============ API 处理函数 ============

export function generateReport(req, res) {
  try {
    const { date } = req.body || {}
    const reportDate = date || new Date().toISOString().slice(0, 10)

    // 检查是否已存在
    const existing = db.prepare('SELECT * FROM boss_reports WHERE date = ?').get(reportDate)
    if (existing) {
      return res.status(409).json({
        ok: false,
        error: `Report already exists for ${reportDate}`,
        existing: { id: existing.id, title: existing.title }
      })
    }

    // 收集数据并生成报告
    const metrics = collectDailyMetrics(reportDate)
    const content = generateReportContent(metrics, reportDate)
    const summary = generateSummary(metrics)

    const id = randomUUID()
    const now = Date.now()

    db.prepare(
      `INSERT INTO boss_reports (id, date, title, content, summary, metrics, generated_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ai', ?)`
    ).run(
      id,
      reportDate,
      `${reportDate} 运营日报`,
      content,
      summary,
      JSON.stringify(metrics),
      now
    )

    res.json({
      ok: true,
      report: {
        id,
        date: reportDate,
        title: `${reportDate} 运营日报`,
        summary,
        metrics,
      }
    })
  } catch (err) {
    console.error('[BossReportGen] Error generating report:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function getReportConfig(req, res) {
  res.json({
    ok: true,
    config: {
      cronEnabled: false,
      cronSchedule: '0 18 * * *', // 每天 18:00
      nextRunTime: null,
    }
  })
}
