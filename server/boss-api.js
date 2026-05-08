// boss-api.js - Boss Dashboard 后端 API 模块
// 提供: Agent管理、任务管理、告警中心、AI日报 的RESTful API + SQLite持久化

import db from './database.js'
import { getHermesMaster, getOpenclawWorkers } from './boss-hermes-bridge.js'

// ============ 初始化数据库表 ============

function initBossTables() {
  // Agent 信息表
  db.exec(`
    CREATE TABLE IF NOT EXISTS boss_agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT,
      avatar TEXT,
      model TEXT,
      provider TEXT DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      total_tasks INTEGER DEFAULT 0,
      completed_tasks INTEGER DEFAULT 0,
      failed_tasks INTEGER DEFAULT 0,
      last_activity INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    );
  `)

  // 任务表
  db.exec(`
    CREATE TABLE IF NOT EXISTS boss_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'todo',
      priority TEXT DEFAULT 'medium',
      agent_id TEXT,
      assigned_to TEXT,
      category TEXT,
      due_date INTEGER,
      created_by TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      completed_at INTEGER,
      FOREIGN KEY (agent_id) REFERENCES boss_agents(id) ON DELETE SET NULL
    );
  `)

  // 告警表
  db.exec(`
    CREATE TABLE IF NOT EXISTS boss_alerts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT,
      level TEXT DEFAULT 'info',
      source TEXT,
      agent_id TEXT,
      task_id TEXT,
      resolved INTEGER DEFAULT 0,
      resolved_at INTEGER,
      resolved_by TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    );
  `)

  // AI日报表
  db.exec(`
    CREATE TABLE IF NOT EXISTS boss_reports (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      title TEXT,
      content TEXT,
      summary TEXT,
      metrics TEXT DEFAULT '{}',
      generated_by TEXT DEFAULT 'ai',
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      UNIQUE(date)
    );
  `)

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_boss_tasks_status ON boss_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_boss_tasks_agent_id ON boss_tasks(agent_id);
    CREATE INDEX IF NOT EXISTS idx_boss_tasks_priority ON boss_tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_boss_alerts_level ON boss_alerts(level);
    CREATE INDEX IF NOT EXISTS idx_boss_alerts_resolved ON boss_alerts(resolved);
    CREATE INDEX IF NOT EXISTS idx_boss_reports_date ON boss_reports(date);
  `)

  console.log('[BossAPI] Database tables initialized')
}

initBossTables()

// ============ Agent API ============

function isSetupCompleted() {
  const config = db.prepare('SELECT setup_completed FROM setup_config WHERE id = ?').get('default')
  return config && !!config.setup_completed
}

export function getAgents(req, res) {
  try {
    if (!isSetupCompleted()) {
      return res.json({ ok: true, agents: [], setupRequired: true })
    }
    
    const hermesMaster = getHermesMaster()
    const openclawWorkers = getOpenclawWorkers()
    const allAgents = hermesMaster ? [hermesMaster, ...openclawWorkers] : openclawWorkers
    res.json({ ok: true, agents: allAgents })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function getAgentById(req, res) {
  try {
    const agent = db.prepare('SELECT * FROM boss_agents WHERE id = ?').get(req.params.id)
    if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found' })
    res.json({ ok: true, agent })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function createAgent(req, res) {
  try {
    const { id = crypto.randomUUID(), name, role, avatar, model, status = 'active' } = req.body
    db.prepare(`
      INSERT OR REPLACE INTO boss_agents (id, name, role, avatar, model, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now') * 1000)
    `).run(id, name, role || '', avatar || '', model || '', status)
    res.json({ ok: true, id })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function updateAgent(req, res) {
  try {
    const fields = []
    const values = []
    for (const [key, val] of Object.entries(req.body)) {
      if (['role', 'avatar', 'model', 'status', 'name'].includes(key)) {
        fields.push(`${key} = ?`)
        values.push(val)
      }
    }
    if (fields.length === 0) return res.json({ ok: true, message: 'No fields to update' })
    fields.push("updated_at = strftime('%s', 'now') * 1000")
    values.push(req.params.id)
    db.prepare(`UPDATE boss_agents SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function deleteAgent(req, res) {
  try {
    db.prepare('DELETE FROM boss_agents WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

// ============ Task API ============

export function getTasks(req, res) {
  try {
    const { status, agent_id, priority, category } = req.query
    let sql = 'SELECT * FROM boss_tasks WHERE 1=1'
    const params = []
    if (status) { sql += ' AND status = ?'; params.push(status) }
    if (agent_id) { sql += ' AND agent_id = ?'; params.push(agent_id) }
    if (priority) { sql += ' AND priority = ?'; params.push(priority) }
    if (category) { sql += ' AND category = ?'; params.push(category) }
    sql += ' ORDER BY created_at DESC'
    const tasks = db.prepare(sql).all(...params)
    res.json({ ok: true, tasks })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function getTaskBoard(req, res) {
  try {
    const statuses = ['todo', 'in_progress', 'review', 'done']
    const board = {}
    for (const s of statuses) {
      board[s] = db.prepare('SELECT * FROM boss_tasks WHERE status = ? ORDER BY priority, created_at DESC').all(s)
    }
    res.json({ ok: true, board })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function createTask(req, res) {
  try {
    const { id = crypto.randomUUID(), title, description, status = 'todo', priority = 'medium', agent_id, assigned_to, category, due_date, created_by } = req.body
    db.prepare(`
      INSERT INTO boss_tasks (id, title, description, status, priority, agent_id, assigned_to, category, due_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, description || '', status, priority, agent_id || null, assigned_to || '', category || '', due_date || null, created_by || '')
    res.json({ ok: true, id })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function updateTask(req, res) {
  try {
    const fields = []
    const values = []
    for (const [key, val] of Object.entries(req.body)) {
      if (['title', 'description', 'status', 'priority', 'agent_id', 'assigned_to', 'category', 'due_date'].includes(key)) {
        fields.push(`${key} = ?`)
        values.push(val === '' ? null : val)
      }
    }
    if (fields.length === 0) return res.json({ ok: true, message: 'No fields to update' })
    // 状态变更时记录时间
    if (req.body.status === 'done') {
      fields.push("completed_at = strftime('%s', 'now') * 1000")
    } else {
      fields.push('completed_at = NULL')
    }
    fields.push("updated_at = strftime('%s', 'now') * 1000")
    values.push(req.params.id)
    db.prepare(`UPDATE boss_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function deleteTask(req, res) {
  try {
    db.prepare('DELETE FROM boss_tasks WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

// ============ Alert API ============

export function getAlerts(req, res) {
  try {
    const { level, resolved, limit = 100 } = req.query
    let sql = 'SELECT * FROM boss_alerts WHERE 1=1'
    const params = []
    if (level) { sql += ' AND level = ?'; params.push(level) }
    if (resolved !== undefined) { sql += ' AND resolved = ?'; params.push(resolved) }
    sql += ` ORDER BY created_at DESC LIMIT ${parseInt(limit)}`
    const alerts = db.prepare(sql).all(...params)
    res.json({ ok: true, alerts })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function createAlert(req, res) {
  try {
    const { id = crypto.randomUUID(), title, message, level = 'info', source, agent_id, task_id } = req.body
    db.prepare(`
      INSERT INTO boss_alerts (id, title, message, level, source, agent_id, task_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, message || '', level, source || '', agent_id || null, task_id || null)
    res.json({ ok: true, id })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function resolveAlert(req, res) {
  try {
    const { resolved_by } = req.body
    db.prepare(`
      UPDATE boss_alerts SET resolved = 1, resolved_at = strftime('%s', 'now') * 1000, resolved_by = ?
      WHERE id = ?
    `).run(resolved_by || '', req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function deleteAlert(req, res) {
  try {
    db.prepare('DELETE FROM boss_alerts WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

// ============ Report API ============

export function getReports(req, res) {
  try {
    const { limit = 30 } = req.query
    const reports = db.prepare(`SELECT * FROM boss_reports ORDER BY date DESC LIMIT ${parseInt(limit)}`).all()
    res.json({ ok: true, reports })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function getReportByDate(req, res) {
  try {
    const report = db.prepare('SELECT * FROM boss_reports WHERE date = ?').get(req.params.date)
    if (!report) return res.status(404).json({ ok: false, error: 'Report not found' })
    res.json({ ok: true, report })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function createReport(req, res) {
  try {
    const { date, title, content, summary, metrics, generated_by = 'ai' } = req.body
    db.prepare(`
      INSERT OR REPLACE INTO boss_reports (id, date, title, content, summary, metrics, generated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), date, title || '', content || '', summary || '', JSON.stringify(metrics || {}), generated_by)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function deleteReport(req, res) {
  try {
    db.prepare('DELETE FROM boss_reports WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

// ============ Dashboard Stats API ============

export function getDashboardStats(req, res) {
  try {
    if (!isSetupCompleted()) {
      return res.json({ ok: true, stats: { totalAgents: 0, activeAgents: 0, totalTasks: 0, todoTasks: 0, inProgressTasks: 0, doneTasks: 0, unresolvedAlerts: 0, criticalAlerts: 0, todayCompleted: 0 }, setupRequired: true })
    }
    
    const stats = {}
    stats.totalAgents = db.prepare('SELECT COUNT(*) as count FROM boss_agents').get().count
    stats.activeAgents = db.prepare("SELECT COUNT(*) as count FROM boss_agents WHERE status = 'active'").get().count
    stats.totalTasks = db.prepare('SELECT COUNT(*) as count FROM boss_tasks').get().count
    stats.todoTasks = db.prepare("SELECT COUNT(*) as count FROM boss_tasks WHERE status = 'todo'").get().count
    stats.inProgressTasks = db.prepare("SELECT COUNT(*) as count FROM boss_tasks WHERE status = 'in_progress'").get().count
    stats.doneTasks = db.prepare("SELECT COUNT(*) as count FROM boss_tasks WHERE status = 'done'").get().count
    stats.unresolvedAlerts = db.prepare('SELECT COUNT(*) as count FROM boss_alerts WHERE resolved = 0').get().count
    stats.criticalAlerts = db.prepare("SELECT COUNT(*) as count FROM boss_alerts WHERE level = 'critical' AND resolved = 0").get().count
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    stats.todayCompleted = db.prepare("SELECT COUNT(*) as count FROM boss_tasks WHERE status = 'done' AND completed_at >= ?").get(todayStart.getTime()).count
    res.json({ ok: true, stats })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}
