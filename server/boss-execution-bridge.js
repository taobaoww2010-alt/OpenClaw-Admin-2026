// boss-execution-bridge.js - Task Execution Bridge
// 架构：Boss 确认调度 -> 通过 Gateway chat.send 发送给 Worker -> 监控执行状态

import db from './database.js'
import { v4 as uuidv4 } from 'uuid'

// Gateway 实例 (从 index.js 注入)
let gatewayInstance = null

// 正在执行的任务跟踪
const executingTasks = new Map()

export function setGateway(gateway) {
  gatewayInstance = gateway
}

export function getGateway() {
  return gatewayInstance
}

// ============ Session 管理 ============

async function getSessionKey(agentId) {
  if (!gatewayInstance) {
    throw new Error('Gateway not connected')
  }

  // 获取该 agent 的 session
  const sessionsData = await gatewayInstance.call('sessions.list')
  const sessions = sessionsData.sessions || []
  
  // 查找匹配 agent 的 session
  const session = sessions.find(s => s.key.includes(`agent:${agentId}:`))
  if (session) {
    return session.key
  }

  // 如果没有 session，尝试创建 (通过发送一个初始化消息)
  // 使用 main agent 作为 fallback
  const mainSession = sessions.find(s => s.key.includes('agent:main:'))
  return mainSession?.key || null
}

// ============ 任务执行 ============

export async function executeTask(taskId, taskData) {
  if (!gatewayInstance || !gatewayInstance.isConnected) {
    throw new Error('Gateway not connected')
  }

  const { title, description, assignedWorkerId, category } = taskData
  
  // 获取 session key
  const sessionKey = await getSessionKey(assignedWorkerId || 'main')
  if (!sessionKey) {
    throw new Error(`No session found for worker: ${assignedWorkerId}`)
  }

  // 构建任务指令
  const command = buildTaskCommand(title, description, category)
  const idempotencyKey = `boss-task-${taskId}`

  // 更新任务状态为 in_progress
  db.prepare(`
    UPDATE boss_tasks 
    SET status = 'in_progress', updated_at = strftime('%s', 'now') * 1000 
    WHERE id = ?
  `).run(taskId)

  // 通过 Gateway 发送任务
  const result = await gatewayInstance.call('chat.send', {
    sessionKey,
    idempotencyKey,
    message: command,
  })

  // 记录执行状态
  executingTasks.set(taskId, {
    runId: result.runId,
    status: 'started',
    startedAt: Date.now(),
    sessionKey,
  })

  return {
    ok: true,
    runId: result.runId,
    sessionKey,
  }
}

// ============ 批量执行 (Hermes 调度后确认) ============

export async function executeDispatchedTasks(dispatchResult) {
  const results = []
  
  for (const task of dispatchResult.subTasks) {
    if (!task.assignedWorkerId) {
      results.push({ 
        task, 
        ok: false, 
        error: 'No worker assigned' 
      })
      continue
    }

    try {
      // 创建任务到数据库 (如果还没创建)
      const taskId = task.id || uuidv4()
      
      // 检查任务是否已存在
      const existing = db.prepare('SELECT id FROM boss_tasks WHERE id = ?').get(taskId)
      if (!existing) {
        db.prepare(`
          INSERT INTO boss_tasks (id, title, description, status, priority, agent_id, assigned_to, category, created_at, updated_at)
          VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000)
        `).run(taskId, task.title, task.description, task.priority, task.assignedWorkerId, task.category)
      }

      // 执行任务
      const execResult = await executeTask(taskId, task)
      results.push({ taskId, ...execResult, ok: true })
    } catch (err) {
      results.push({ task, ok: false, error: err.message })
    }
  }

  return results
}

// ============ 任务指令构建 ============

function buildTaskCommand(title, description, category) {
  return `[Boss 任务指派]

任务: ${title}
类别: ${category}

详细说明:
${description}

请执行此任务并汇报结果。完成后请回复 "任务完成: [结果摘要]"。`
}

// ============ 任务状态更新 (从 Gateway 事件) ============

export function handleTaskEvent(event, payload) {
  // OpenClaw Gateway 发送的事件格式:
  // - chat 事件: { runId, sessionKey, seq, state }
  // - agent 事件: { runId, stream, data, sessionKey, seq, ts }
  // - run.finished / run.completed / run.failed (标准格式)

  let runId = payload?.runId
  let state = payload?.state

  // 处理标准 run.* 事件
  if (event === 'run.finished' || event === 'run.completed') {
    if (runId) {
      completeTaskByRunId(runId, 'done')
    }
    return
  }
  
  if (event === 'run.failed') {
    if (runId) {
      completeTaskByRunId(runId, 'failed')
    }
    return
  }

  // 处理 OpenClaw chat 事件 (state 字段表示运行状态)
  if (event === 'chat' && runId && state) {
    if (state === 'finished' || state === 'completed' || state === 'done' || state === 'final') {
      completeTaskByRunId(runId, 'done')
    } else if (state === 'failed' || state === 'error') {
      completeTaskByRunId(runId, 'failed')
    }
  }
}

function completeTaskByRunId(runId, status) {
  for (const [taskId, execInfo] of executingTasks.entries()) {
    if (execInfo.runId === runId) {
      const now = Date.now()
      if (status === 'done') {
        db.prepare(`
          UPDATE boss_tasks 
          SET status = 'done', completed_at = ?, updated_at = ? 
          WHERE id = ?
        `).run(now, now, taskId)
        console.log(`[ExecutionBridge] Task ${taskId} completed`)
      } else {
        db.prepare(`
          UPDATE boss_tasks 
          SET status = 'failed', updated_at = ? 
          WHERE id = ?
        `).run(now, taskId)
        console.log(`[ExecutionBridge] Task ${taskId} failed`)
      }
      executingTasks.delete(taskId)
      break
    }
  }
}

// ============ 获取任务执行状态 ============

export function getExecutingTasks() {
  return Array.from(executingTasks.entries()).map(([taskId, info]) => ({
    taskId,
    ...info,
  }))
}

export function getTaskExecutionStatus(taskId) {
  return executingTasks.get(taskId) || null
}
