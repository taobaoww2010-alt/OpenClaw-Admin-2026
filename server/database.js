import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const dbPath = join(__dirname, '../data/wizard.db')

const db = new Database(dbPath)

db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',
    agent_selection_mode TEXT DEFAULT 'existing',
    selected_agents TEXT DEFAULT '[]',
    generated_agents TEXT DEFAULT '[]',
    bindings TEXT DEFAULT '[]',
    tasks TEXT DEFAULT '[]',
    execution_log TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    scenario_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    assigned_agents TEXT DEFAULT '[]',
    priority TEXT DEFAULT 'medium',
    mode TEXT DEFAULT 'default',
    conversation_history TEXT DEFAULT '[]',
    execution_history TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS backup_records (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    filename TEXT,
    status TEXT DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    message TEXT,
    stage TEXT,
    error TEXT,
    result TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    completed_at INTEGER,
    size INTEGER
  );

  CREATE TABLE IF NOT EXISTS setup_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    company_name TEXT,
    company_description TEXT,
    model_url TEXT,
    model_api_key TEXT,
    model_name TEXT,
    hermes_web_url TEXT,
    hermes_api_url TEXT,
    hermes_api_key TEXT,
    openclaw_ws_url TEXT,
    openclaw_auth_token TEXT,
    openclaw_auth_password TEXT,
    setup_completed INTEGER DEFAULT 0,
    setup_completed_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT UNIQUE NOT NULL,
    company_name TEXT NOT NULL,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    license_key TEXT,
    license_activated INTEGER DEFAULT 0,
    license_expiry TEXT,
    config TEXT DEFAULT '{}',
    status TEXT DEFAULT 'active',
    max_users INTEGER DEFAULT 10,
    current_users INTEGER DEFAULT 0,
    notes TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_scenario_id ON tasks(scenario_id);
  CREATE INDEX IF NOT EXISTS idx_scenarios_status ON scenarios(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_backup_records_created_at ON backup_records(created_at);
`)

try {
  db.exec('ALTER TABLE scenarios ADD COLUMN execution_log TEXT DEFAULT \'[]\'')
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('[Database] Failed to add execution_log column:', e.message)
  }
}

try {
  db.exec('ALTER TABLE tasks ADD COLUMN execution_history TEXT DEFAULT \'[]\'')
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('[Database] Failed to add execution_history column:', e.message)
  }
}

try {
  db.exec('ALTER TABLE setup_config ADD COLUMN license_key TEXT')
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('[Database] Failed to add license_key column:', e.message)
  }
}

try {
  db.exec('ALTER TABLE setup_config ADD COLUMN license_activated INTEGER DEFAULT 0')
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('[Database] Failed to add license_activated column:', e.message)
  }
}

try {
  db.exec('ALTER TABLE setup_config ADD COLUMN license_expiry TEXT')
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('[Database] Failed to add license_expiry column:', e.message)
  }
}

// ============ Phase 2.1: Company Ops Tables ============

db.exec(`
  CREATE TABLE IF NOT EXISTS company_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    legal_name TEXT,
    industry TEXT,
    business_model TEXT,
    target_revenue_monthly REAL,
    cost_per_lead REAL,
    cpa_limit REAL,
    roas_target REAL,
    brand_colors TEXT DEFAULT '{"primary":"#3b82f6","secondary":"#10b981"}',
    logo_url TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS business_metrics (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT DEFAULT '',
    source TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE INDEX IF NOT EXISTS idx_metrics_date ON business_metrics(date);
  CREATE INDEX IF NOT EXISTS idx_metrics_category ON business_metrics(category);
  CREATE INDEX IF NOT EXISTS idx_metrics_name ON business_metrics(metric_name);

  -- 初始化默认 config
  INSERT OR IGNORE INTO company_config (id) VALUES ('default');
`)

// ============ Company Config Helpers ============

export function getCompanyConfig() {
  const row = db.prepare('SELECT * FROM company_config WHERE id = ?').get('default')
  if (!row) return null
  if (row.brand_colors) {
    try { row.brand_colors = JSON.parse(row.brand_colors) } catch {}
  }
  return row
}

export function updateCompanyConfig(updates) {
  const fields = []
  const values = []
  for (let [key, value] of Object.entries(updates)) {
    if (key === 'brand_colors' && typeof value === 'object') {
      value = JSON.stringify(value)
    }
    fields.push(`${key} = ?`)
    values.push(value)
  }
  if (fields.length === 0) return
  fields.push('updated_at = ?')
  values.push(Date.now())
  values.push('default')
  db.prepare(`UPDATE company_config SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

// ============ Business Metrics Helpers ============

export function addBusinessMetric({date, category, metric_name, value, unit, source}) {
  const id = `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  db.prepare(`
    INSERT INTO business_metrics (id, date, category, metric_name, value, unit, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, date, category, metric_name, value, unit || '', source || '')
  return id
}

export function getBusinessMetrics({category, startDate, endDate, limit = 100}) {
  let sql = 'SELECT * FROM business_metrics WHERE 1=1'
  const params = []
  if (category) { sql += ' AND category = ?'; params.push(category) }
  if (startDate) { sql += ' AND date >= ?'; params.push(startDate) }
  if (endDate) { sql += ' AND date <= ?'; params.push(endDate) }
  sql += ' ORDER BY date DESC, created_at DESC LIMIT ?'
  params.push(limit)
  return db.prepare(sql).all(...params)
}

export function getLatestMetric(category, metricName) {
  return db.prepare(`
    SELECT * FROM business_metrics
    WHERE category = ? AND metric_name = ?
    ORDER BY date DESC, created_at DESC LIMIT 1
  `).get(category, metricName)
}

export function deleteBusinessMetrics({category, startDate, endDate}) {
  let sql = 'DELETE FROM business_metrics WHERE 1=1'
  const params = []
  if (category) { sql += ' AND category = ?'; params.push(category) }
  if (startDate) { sql += ' AND date >= ?'; params.push(startDate) }
  if (endDate) { sql += ' AND date <= ?'; params.push(endDate) }
  const result = db.prepare(sql).run(...params)
  return result.changes
}

// ============ Metrics Summary & Trend ============

export function getDailyRevenue(days = 1) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const rows = db.prepare(`
    SELECT date, SUM(value) as total FROM business_metrics
    WHERE category = 'finance' AND metric_name = 'daily_revenue' AND date >= ?
    GROUP BY date ORDER BY date ASC
  `).all(cutoff)
  return rows
}

export function getDailyTokenCost(days = 1) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const rows = db.prepare(`
    SELECT date, SUM(value) as total FROM business_metrics
    WHERE category = 'cost' AND metric_name = 'token_cost' AND date >= ?
    GROUP BY date ORDER BY date ASC
  `).all(cutoff)
  return rows
}

export function getMetricsSummary() {
  const today = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  // Today's revenue
  const todayRev = db.prepare(`
    SELECT COALESCE(SUM(value), 0) as total FROM business_metrics
    WHERE category = 'finance' AND metric_name = 'daily_revenue' AND date = ?
  `).get(today)

  // Week revenue
  const weekRev = db.prepare(`
    SELECT COALESCE(SUM(value), 0) as total FROM business_metrics
    WHERE category = 'finance' AND metric_name = 'daily_revenue' AND date >= ?
  `).get(weekAgo)

  // Month revenue
  const monthRev = db.prepare(`
    SELECT COALESCE(SUM(value), 0) as total FROM business_metrics
    WHERE category = 'finance' AND metric_name = 'daily_revenue' AND date >= ?
  `).get(monthAgo)

  // Today's token cost
  const todayCost = db.prepare(`
    SELECT COALESCE(SUM(value), 0) as total FROM business_metrics
    WHERE category = 'cost' AND metric_name = 'token_cost' AND date = ?
  `).get(today)

  const weekCost = db.prepare(`
    SELECT COALESCE(SUM(value), 0) as total FROM business_metrics
    WHERE category = 'cost' AND metric_name = 'token_cost' AND date >= ?
  `).get(weekAgo)

  const monthCost = db.prepare(`
    SELECT COALESCE(SUM(value), 0) as total FROM business_metrics
    WHERE category = 'cost' AND metric_name = 'token_cost' AND date >= ?
  `).get(monthAgo)

  const latestCpa = getLatestMetric('finance', 'cpa')
  // Latest ROAS
  const latestRoas = getLatestMetric('finance', 'roas')

  // Leaderboard: top revenue days this month
  const topRevenueDays = db.prepare(`
    SELECT date, value FROM business_metrics
    WHERE category = 'finance' AND metric_name = 'daily_revenue' AND date >= ?
    ORDER BY value DESC LIMIT 5
  `).all(monthAgo)

  // Daily revenue count (days with data this month)
  const revenueDays = db.prepare(`
    SELECT COUNT(DISTINCT date) as days FROM business_metrics
    WHERE category = 'finance' AND metric_name = 'daily_revenue' AND date >= ?
  `).get(monthAgo)

  return {
    today: { revenue: todayRev.total, cost: todayCost.total },
    week: { revenue: weekRev.total, cost: weekCost.total },
    month: { revenue: monthRev.total, cost: monthCost.total, days_with_data: revenueDays.days },
    latest: {
      cpa: latestCpa?.value || 0,
      roas: latestRoas?.value || 0,
    },
    top_revenue_days: topRevenueDays,
  }
}

export function getMetricsTrend(days = 7) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const dates = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    dates.push(d)
  }

  const revenueMap = {}
  const costMap = {}
  const cpaMap = {}

  const revRows = db.prepare(`
    SELECT date, SUM(value) as total FROM business_metrics
    WHERE category = 'finance' AND metric_name = 'daily_revenue' AND date >= ?
    GROUP BY date
  `).all(cutoff)
  for (const r of revRows) revenueMap[r.date] = r.total

  const costRows = db.prepare(`
    SELECT date, SUM(value) as total FROM business_metrics
    WHERE category = 'cost' AND metric_name = 'token_cost' AND date >= ?
    GROUP BY date
  `).all(cutoff)
  for (const c of costRows) costMap[c.date] = c.total

  const cpaRows = db.prepare(`
    SELECT date, value FROM business_metrics
    WHERE category = 'finance' AND metric_name = 'cpa' AND date >= ?
    ORDER BY date ASC
  `).all(cutoff)
  for (const c of cpaRows) cpaMap[c.date] = c.value

  const points = dates.map(d => ({
    date: d,
    revenue: revenueMap[d] || 0,
    cost: costMap[d] || 0,
    cpa: cpaMap[d] || null,
  }))

  return points
}

export function seedDemoMetrics() {
  const now = Date.now()
  const rows = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 86400000).toISOString().slice(0, 10)
    const revenue = Math.round((50 + Math.random() * 80) * 100) / 100
    const cost = Math.round((2 + Math.random() * 5) * 100) / 100
    const cpa = Math.round((5 + Math.random() * 15) * 100) / 100
    const roas = Math.round((1.5 + Math.random() * 3) * 10) / 10
    const followers = Math.floor(5 + Math.random() * 20)
    const engagement = Math.round((2 + Math.random() * 5) * 10) / 10

    rows.push(
      { id: `demo_rev_${i}`, date: d, category: 'finance', metric_name: 'daily_revenue', value: revenue, unit: '$', source: 'demo_seed', created_at: now },
      { id: `demo_cost_${i}`, date: d, category: 'cost', metric_name: 'token_cost', value: cost, unit: '$', source: 'demo_seed', created_at: now },
      { id: `demo_cpa_${i}`, date: d, category: 'finance', metric_name: 'cpa', value: cpa, unit: '$', source: 'demo_seed', created_at: now },
      { id: `demo_roas_${i}`, date: d, category: 'finance', metric_name: 'roas', value: roas, unit: 'x', source: 'demo_seed', created_at: now },
      { id: `demo_fol_${i}`, date: d, category: 'growth', metric_name: 'new_followers', value: followers, unit: 'count', source: 'demo_seed', created_at: now },
      { id: `demo_eng_${i}`, date: d, category: 'growth', metric_name: 'engagement_rate', value: engagement, unit: '%', source: 'demo_seed', created_at: now },
    )
  }

  // Check if demo data already exists
  const existing = db.prepare("SELECT COUNT(*) as c FROM business_metrics WHERE source = 'demo_seed'").get()
  if (existing.c > 0) return { seeded: false, reason: 'Demo data already exists', count: existing.c }

  const insert = db.prepare(`INSERT OR IGNORE INTO business_metrics (id, date, category, metric_name, value, unit, source) VALUES (?, ?, ?, ?, ?, ?, ?)`)
  let count = 0
  for (const r of rows) {
    insert.run(r.id, r.date, r.category, r.metric_name, r.value, r.unit, r.source)
    count++
  }
  return { seeded: true, count }
}

export function createBackupRecord(id, type, filename = null) {
  const stmt = db.prepare(`
    INSERT INTO backup_records (id, type, filename, status, progress, message, created_at)
    VALUES (?, ?, ?, 'pending', 0, 'Task created', ?)
  `)
  stmt.run(id, type, filename, Date.now())
  return id
}

export function updateBackupRecord(id, updates) {
  const fields = []
  const values = []
  
  for (let [key, value] of Object.entries(updates)) {
    if (key === 'completedAt') key = 'completed_at'
    fields.push(`${key} = ?`)
    values.push(typeof value === 'object' ? JSON.stringify(value) : value)
  }
  
  values.push(id)
  
  const stmt = db.prepare(`UPDATE backup_records SET ${fields.join(', ')} WHERE id = ?`)
  stmt.run(...values)
}

export function getBackupRecord(id) {
  const stmt = db.prepare('SELECT * FROM backup_records WHERE id = ?')
  const record = stmt.get(id)
  if (record && record.result) {
    record.result = JSON.parse(record.result)
  }
  return record
}

export function getBackupRecords(limit = 20, offset = 0) {
  const stmt = db.prepare('SELECT * FROM backup_records ORDER BY created_at DESC LIMIT ? OFFSET ?')
  const records = stmt.all(limit, offset)
  return records.map(r => {
    if (r.result) {
      r.result = JSON.parse(r.result)
    }
    return r
  })
}

export function getBackupRecordsCount() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM backup_records')
  return stmt.get().count
}

export function deleteBackupRecord(id) {
  const stmt = db.prepare('DELETE FROM backup_records WHERE id = ?')
  stmt.run(id)
}

export function createCustomer(data) {
  const stmt = db.prepare(`
    INSERT INTO customers (id, tenant_id, company_name, contact_name, contact_email, contact_phone, license_key, license_activated, license_expiry, config, status, max_users, current_users, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, '{}', 'active', ?, 0, ?, ?, ?)
  `)
  const id = data.id || `cust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const tenantId = data.tenant_id || `tenant_${Date.now()}`
  const now = Date.now()
  stmt.run(id, tenantId, data.company_name, data.contact_name || null, data.contact_email || null, data.contact_phone || null, data.license_key || null, data.license_expiry || null, data.max_users || 10, data.notes || null, now, now)
  return id
}

export function getCustomer(id) {
  const stmt = db.prepare('SELECT * FROM customers WHERE id = ?')
  const customer = stmt.get(id)
  if (customer && customer.config) {
    customer.config = JSON.parse(customer.config)
  }
  return customer
}

export function getCustomerByTenantId(tenantId) {
  const stmt = db.prepare('SELECT * FROM customers WHERE tenant_id = ?')
  const customer = stmt.get(tenantId)
  if (customer && customer.config) {
    customer.config = JSON.parse(customer.config)
  }
  return customer
}

export function getCustomers(limit = 50, offset = 0, search = '') {
  let stmt
  if (search) {
    stmt = db.prepare(`
      SELECT * FROM customers 
      WHERE company_name LIKE ? OR contact_name LIKE ? OR tenant_id LIKE ?
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `)
    const pattern = `%${search}%`
    return stmt.all(pattern, pattern, pattern, limit, offset).map(c => ({
      ...c,
      config: c.config ? JSON.parse(c.config) : {}
    }))
  }
  stmt = db.prepare('SELECT * FROM customers ORDER BY created_at DESC LIMIT ? OFFSET ?')
  return stmt.all(limit, offset).map(c => ({
    ...c,
    config: c.config ? JSON.parse(c.config) : {}
  }))
}

export function getCustomersCount(search = '') {
  if (search) {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM customers 
      WHERE company_name LIKE ? OR contact_name LIKE ? OR tenant_id LIKE ?
    `)
    const pattern = `%${search}%`
    return stmt.get(pattern, pattern, pattern).count
  }
  const stmt = db.prepare('SELECT COUNT(*) as count FROM customers')
  return stmt.get().count
}

export function updateCustomer(id, updates) {
  const fields = []
  const values = []
  
  for (let [key, value] of Object.entries(updates)) {
    if (key === 'config' && typeof value === 'object') {
      value = JSON.stringify(value)
    }
    fields.push(`${key} = ?`)
    values.push(value)
  }
  
  fields.push('updated_at = ?')
  values.push(Date.now())
  values.push(id)
  
  const stmt = db.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`)
  stmt.run(...values)
}

export function deleteCustomer(id) {
  const stmt = db.prepare('DELETE FROM customers WHERE id = ?')
  stmt.run(id)
}

export function checkLicenseStatus(tenantId) {
  const customer = getCustomerByTenantId(tenantId)
  if (!customer) return { valid: false, reason: '客户不存在' }
  if (!customer.license_activated) return { valid: false, reason: '未激活' }
  if (customer.license_expiry) {
    const expiry = new Date(customer.license_expiry)
    if (expiry < new Date()) return { valid: false, reason: '已过期' }
  }
  if (customer.status !== 'active') return { valid: false, reason: '账户已停用' }
  return { valid: true, customer }
}

console.log('[Database] Initialized at:', dbPath)

export default db
