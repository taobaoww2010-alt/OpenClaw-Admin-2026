// boss-hermes-bridge.js - Hermes 主控桥接模块
// 架构：Hermes (主控调度) -> OpenClaw Agents (执行 Worker)

import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import db from './database.js'
import { v4 as uuidv4 } from 'uuid'

// ============ Hermes 配置读取 ============

function loadHermesConfig() {
  const hermesHome = process.env.HERMES_HOME || join(homedir(), '.hermes')
  const configPath = join(hermesHome, 'config.yaml')
  const jsonPath = join(hermesHome, 'config.json')

  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8')
      return parseSimpleYaml(content)
    } catch {
      return null
    }
  }

  if (existsSync(jsonPath)) {
    try {
      return JSON.parse(readFileSync(jsonPath, 'utf-8'))
    } catch {
      return null
    }
  }

  return null
}

function parseSimpleYaml(content) {
  const result = {}
  let currentKey = null
  let currentObj = null
  let currentNestedKey = null

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const indent = line.search(/\S/)
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) continue

    const key = trimmed.slice(0, colonIdx).trim()
    const value = trimmed.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '')

    if (indent === 0) {
      currentKey = key
      currentObj = value ? value : {}
      result[currentKey] = currentObj
      currentNestedKey = null
    } else if (indent === 2 && currentObj && typeof currentObj === 'object') {
      if (value) {
        currentObj[key] = value
        currentNestedKey = null
      } else {
        currentObj[key] = {}
        currentNestedKey = key
      }
    } else if (indent === 4 && currentNestedKey && currentObj[currentNestedKey]) {
      currentObj[currentNestedKey][key] = value
    }
  }

  return result
}

// ============ Hermes 主控信息 ============

export function getHermesMaster() {
  const config = loadHermesConfig()
  if (!config) return null

  const model = config.model || {}
  
  return {
    id: 'hermes-master',
    name: 'Hermes 主控',
    role: '调度指挥官',
    platform: 'hermes',
    model: model.model || 'Unknown',
    provider: model.provider || 'custom',
    baseUrl: model.base_url || '',
    status: 'active',
    description: '负责任务拆解、分配策略、结果汇总',
    capabilities: ['任务拆解', '智能分配', '状态监控', '结果汇总'],
    contextLength: model.context_length || 4096,
    created_at: Date.now(),
    updated_at: Date.now(),
  }
}

// ============ OpenClaw Worker 列表 ============

export function getOpenclawWorkers() {
  try {
    const agents = db.prepare('SELECT * FROM boss_agents WHERE status = ? ORDER BY created_at DESC').all('active')
    return agents.map(a => ({
      ...a,
      platform: 'openclaw',
      type: 'worker',
      masterId: 'hermes-master',
    }))
  } catch {
    return []
  }
}

// ============ 智能任务分配 (Hermes 调度逻辑) ============

// Agent 能力映射
const AGENT_CAPABILITIES = {
  '选品': ['search', 'product', '选品', '电商', '商品'],
  '内容': ['content', 'writing', '内容', '文案', '创作', '文章'],
  '数据': ['data', 'analytics', '数据', '分析', '报表'],
  '运营': ['operation', '运营', '营销', '活动', '投放'],
  '客服': ['support', '客服', '服务', '回答'],
  '设计': ['design', '设计', '海报', '图片'],
  '开发': ['dev', 'coding', '开发', '编程', 'bug', '修复'],
}

function matchWorkerByCategory(category, workers) {
  const keywords = AGENT_CAPABILITIES[category] || []
  if (keywords.length === 0) return null

  for (const worker of workers) {
    const searchText = `${worker.name} ${worker.role || ''} ${worker.category || ''}`.toLowerCase()
    for (const keyword of keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        return worker.id
      }
    }
  }
  return null
}

// ============ 任务拆解与分配 (模拟 Hermes 主控逻辑) ============

export function dispatchFromHermes(command) {
  const workers = getOpenclawWorkers()
  const lowerCmd = command.toLowerCase()

  // 1. 意图识别
  let intent = '通用任务'
  let category = '运营'

  const intentKeywords = {
    '选品': { intent: '选品任务', category: '选品' },
    '商品': { intent: '选品任务', category: '选品' },
    '产品': { intent: '选品任务', category: '选品' },
    '内容': { intent: '内容创作', category: '内容' },
    '文案': { intent: '文案创作', category: '内容' },
    '脚本': { intent: '脚本创作', category: '内容' },
    '文章': { intent: '文章创作', category: '内容' },
    '数据': { intent: '数据分析', category: '数据' },
    '分析': { intent: '数据分析', category: '数据' },
    '竞品': { intent: '竞品分析', category: '数据' },
    '报表': { intent: '报表生成', category: '数据' },
    '投放': { intent: '投放运营', category: '运营' },
    '营销': { intent: '营销运营', category: '运营' },
    '活动': { intent: '活动运营', category: '运营' },
    '客服': { intent: '客服任务', category: '客服' },
    '设计': { intent: '设计任务', category: '设计' },
    '海报': { intent: '设计任务', category: '设计' },
    '开发': { intent: '开发任务', category: '开发' },
    '编程': { intent: '开发任务', category: '开发' },
    'bug': { intent: '修复任务', category: '开发' },
    '修复': { intent: '修复任务', category: '开发' },
  }

  for (const [keyword, mapping] of Object.entries(intentKeywords)) {
    if (lowerCmd.includes(keyword)) {
      intent = mapping.intent
      category = mapping.category
      break
    }
  }

  // 2. 任务拆解
  const subTasks = []

  if (intent === '选品任务') {
    subTasks.push(
      { title: '搜索热门商品', description: `根据 "${command}" 搜索相关热门商品`, category: '选品', priority: 'high', dependencies: [] },
      { title: '分析竞品情况', description: '分析同类竞品的价格、销量、评价', category: '数据', priority: 'medium', dependencies: ['搜索热门商品'] },
      { title: '编写选品推荐', description: '整理选品结果并输出推荐文案', category: '内容', priority: 'medium', dependencies: ['分析竞品情况'] }
    )
  } else if (intent === '内容创作') {
    subTasks.push(
      { title: '内容调研', description: '调研相关话题和素材', category: '内容', priority: 'high', dependencies: [] },
      { title: '撰写初稿', description: '根据调研结果撰写内容初稿', category: '内容', priority: 'high', dependencies: ['内容调研'] },
      { title: '审核优化', description: '审核并优化内容质量', category: '运营', priority: 'medium', dependencies: ['撰写初稿'] }
    )
  } else if (intent === '数据分析') {
    subTasks.push(
      { title: '数据收集', description: '收集相关数据源', category: '数据', priority: 'high', dependencies: [] },
      { title: '数据分析', description: '对收集的数据进行分析', category: '数据', priority: 'high', dependencies: ['数据收集'] },
      { title: '生成报告', description: '输出分析报告', category: '内容', priority: 'medium', dependencies: ['数据分析'] }
    )
  } else {
    subTasks.push(
      { title: '需求分析', description: `分析任务需求: "${command}"`, category: '运营', priority: 'high', dependencies: [] },
      { title: '执行任务', description: '按照需求执行具体任务', category: category, priority: 'high', dependencies: ['需求分析'] },
      { title: '结果确认', description: '确认任务结果是否符合预期', category: '运营', priority: 'medium', dependencies: ['执行任务'] }
    )
  }

  // 3. 分配给 Worker (由 Hermes 主控调度)
  const dispatchedTasks = subTasks.map(t => ({
    ...t,
    assignedWorkerId: matchWorkerByCategory(t.category, workers),
    masterController: 'hermes-master',
  }))

  return {
    masterController: 'hermes-master',
    intent,
    category,
    subTasks: dispatchedTasks,
    workerCount: workers.length,
    availableWorkers: workers.map(w => ({ id: w.id, name: w.name, role: w.role })),
  }
}

// ============ 创建任务到数据库 (通过 Hermes 调度后) ============

export function createDispatchedTasks(dispatchResult) {
  const taskIds = []
  const taskMap = {}

  const stmt = db.prepare(`
    INSERT INTO boss_tasks (id, title, description, status, priority, agent_id, category, assigned_to, created_at, updated_at)
    VALUES (?, ?, ?, 'todo', ?, ?, ?, 'hermes-master', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000)
  `)

  const insertMany = db.transaction((tasks) => {
    for (const t of tasks) {
      const id = uuidv4()
      t.id = id // 添加 ID 到任务对象
      stmt.run(
        id,
        t.title,
        t.description || '',
        t.priority || 'medium',
        t.assignedWorkerId || null,
        t.category || '',
      )
      taskIds.push(id)
      taskMap[t.title] = id
    }
  })

  insertMany(dispatchResult.subTasks)
  
  // 更新 dependencies 中的标题为 ID
  for (const t of dispatchResult.subTasks) {
    t.dependencies = t.dependencies.map(dep => taskMap[dep] || dep)
  }
  
  return taskIds
}

// ============ 完整调度流程 ============

export function hermesDispatch(command) {
  // 1. Hermes 拆解并分配任务
  const dispatchResult = dispatchFromHermes(command)
  
  // 2. 创建任务到数据库
  const taskIds = createDispatchedTasks(dispatchResult)
  
  return {
    ok: true,
    masterController: 'hermes-master',
    dispatchId: taskIds[0] || uuidv4(),
    taskIds,
    result: dispatchResult,
  }
}
