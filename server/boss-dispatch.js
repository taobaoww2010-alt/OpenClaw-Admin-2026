// boss-dispatch.js - 任务调度模块 (Hermes 主控模式)
// 架构：Boss 指令 -> Hermes 拆解 -> 分配 OpenClaw Workers -> 执行

import { dispatchFromHermes, createDispatchedTasks } from './boss-hermes-bridge.js'
import { executeTask } from './boss-execution-bridge.js'

// In-memory dispatch cache (for preview before confirm)
const dispatchCache = new Map()

export function dispatchCommand(req, res) {
  try {
    const { command } = req.body
    if (!command) {
      return res.status(400).json({ ok: false, error: 'Command is required' })
    }

    // Hermes 主控进行任务拆解和分配 (仅规划，不写数据库)
    const result = dispatchFromHermes(command)
    const dispatchId = `dispatch-${Date.now()}`

    // 缓存调度结果供预览
    dispatchCache.set(dispatchId, {
      command,
      result,
      createdAt: Date.now(),
      masterController: 'hermes-master',
    })

    // 清理旧缓存
    if (dispatchCache.size > 100) {
      const oldest = dispatchCache.keys().next().value
      if (oldest) dispatchCache.delete(oldest)
    }

    res.json({
      ok: true,
      dispatchId,
      masterController: 'hermes-master',
      result,
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export async function confirmDispatch(req, res) {
  try {
    const { dispatchId } = req.params
    const { execute = true } = req.body || {}
    
    const cached = dispatchCache.get(dispatchId)
    if (!cached) {
      return res.status(404).json({ ok: false, error: 'Dispatch not found or expired' })
    }

    // 创建任务到数据库
    const taskIds = createDispatchedTasks(cached.result)

    // 如果要求立即执行
    const executionResults = []
    if (execute && taskIds.length > 0) {
      for (let i = 0; i < cached.result.subTasks.length; i++) {
        const task = cached.result.subTasks[i]
        const taskId = taskIds[i]
        
        if (!taskId || !task.assignedWorkerId) continue

        try {
          const execResult = await executeTask(taskId, task)
          executionResults.push({ taskId, ...execResult, ok: true })
        } catch (err) {
          executionResults.push({ taskId, ok: false, error: err.message })
        }
      }
    }

    dispatchCache.delete(dispatchId)

    res.json({ 
      ok: true, 
      taskIds,
      executed: executionResults.length > 0,
      executionResults,
      masterController: 'hermes-master'
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export function getDispatch(req, res) {
  try {
    const { dispatchId } = req.params
    const cached = dispatchCache.get(dispatchId)
    if (!cached) {
      return res.status(404).json({ ok: false, error: 'Dispatch not found' })
    }
    res.json({ ok: true, dispatch: cached })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}
