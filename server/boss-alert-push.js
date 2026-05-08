// boss-alert-push.js - 告警推送模块 (支持 Telegram)
// 通过 Telegram Bot API 将严重/错误级别告警推送给 Boss

import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import db from './database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 读取 .env 配置
function loadEnvConfig() {
  const envPath = join(__dirname, '../.env')
  if (!existsSync(envPath)) return {}

  const content = readFileSync(envPath, 'utf-8')
  const result = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

const envConfig = loadEnvConfig()
const TELEGRAM_BOT_TOKEN = envConfig.TELEGRAM_BOT_TOKEN || ''
const TELEGRAM_CHAT_ID = envConfig.TELEGRAM_CHAT_ID || ''

// 推送历史记录 (防止重复推送)
const pushHistory = new Set()
const PUSH_HISTORY_TTL = 60 * 60 * 1000 // 1 小时内相同告警不重复推送
const pushHistoryExpiry = new Map()

// ============ Telegram 推送 ============

const levelEmoji = {
  info: '\U0001f535',
  warning: '\u26a0\ufe0f',
  error: '\U0001f534',
  critical: '\U0001f6a8',
}

function formatAlertMessage(alert) {
  const emoji = levelEmoji[alert.level] || '\U0001f4dd'
  const levelText = { info: '信息', warning: '警告', error: '错误', critical: '严重' }[alert.level] || alert.level
  const time = new Date(alert.created_at).toLocaleString('zh-CN')

  let message = `${emoji} <b>[${levelText}]</b> ${alert.title}\n\n`

  if (alert.message) {
    // 处理多行消息
    const lines = alert.message.split('\n')
    message += lines.map(l => l.startsWith('•') ? `  ${l}` : l).join('\n')
    message += '\n\n'
  }

  message += `\u23f0 <b>时间:</b> ${time}`

  if (alert.source) {
    message += `\n\U0001f4e1 <b>来源:</b> ${alert.source}`
  }

  return message
}

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[BossAlertPush] Telegram not configured (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID missing)')
    return false
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10000), // 10s timeout
    })

    const data = await response.json()

    if (!data.ok) {
      console.error('[BossAlertPush] Telegram API error:', data.description)
      return false
    }

    console.log('[BossAlertPush] Telegram message sent successfully')
    return true
  } catch (err) {
    console.error('[BossAlertPush] Failed to send Telegram message:', err.message)
    return false
  }
}

// ============ 推送主函数 ============

export async function pushAlert(alert) {
  // 检查是否在推送历史中 (防重复)
  const historyKey = `${alert.title}:${alert.level}`
  if (pushHistory.has(historyKey)) {
    console.log('[BossAlertPush] Alert already pushed recently, skipping')
    return false
  }

  // 格式化消息
  const message = formatAlertMessage(alert)

  // 发送到 Telegram
  const success = await sendTelegramMessage(message)

  if (success) {
    // 记录推送历史
    pushHistory.add(historyKey)
    pushHistoryExpiry.set(historyKey, Date.now() + PUSH_HISTORY_TTL)

    // 更新数据库中的推送状态
    try {
      db.prepare(
        'UPDATE boss_alerts SET resolved = 2 WHERE id = ?'
      ).run(alert.id)
    } catch (err) {
      console.error('[BossAlertPush] Failed to update alert push status:', err.message)
    }

    console.log(`[BossAlertPush] Alert pushed: ${alert.title}`)
  }

  return success
}

// 清理过期推送历史
function cleanupPushHistory() {
  const now = Date.now()
  for (const [key, expiry] of pushHistoryExpiry) {
    if (now > expiry) {
      pushHistory.delete(key)
      pushHistoryExpiry.delete(key)
    }
  }
}

// 每小时清理一次
setInterval(cleanupPushHistory, 60 * 60 * 1000)

// ============ 配置 & 测试 API ============

export function getPushConfig(req, res) {
  res.json({
    ok: true,
    config: {
      telegramEnabled: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
      telegramBotToken: TELEGRAM_BOT_TOKEN ? `${TELEGRAM_BOT_TOKEN.slice(0, 5)}...${TELEGRAM_BOT_TOKEN.slice(-3)}` : '',
      telegramChatId: TELEGRAM_CHAT_ID ? `${TELEGRAM_CHAT_ID.slice(0, 5)}...` : '',
    },
  })
}

export async function testPush(req, res) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return res.status(400).json({
      ok: false,
      error: 'Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env',
    })
  }

  const testAlert = {
    id: 'test-' + Date.now(),
    title: '测试告警',
    message: '这是一条测试告警消息，用于验证 Telegram 推送功能是否正常。',
    level: 'info',
    source: 'test',
    created_at: Date.now(),
  }

  const success = await sendTelegramMessage(formatAlertMessage(testAlert))

  if (success) {
    res.json({ ok: true, message: 'Test message sent successfully' })
  } else {
    res.status(500).json({ ok: false, error: 'Failed to send test message' })
  }
}
