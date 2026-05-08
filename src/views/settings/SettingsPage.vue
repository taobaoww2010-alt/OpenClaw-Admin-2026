<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import {
  NCard,
  NSpace,
  NSelect,
  NText,
  NAlert,
  NForm,
  NFormItem,
  NInput,
  NButton,
  NSpin,
  NSwitch,
  NSlider,
  NInputNumber,
  NDivider,
  NModal,
  NTag,
  useMessage,
  type FormInst,
  type FormItemRule,
  NIcon,
} from 'naive-ui'
import {
  VolumeHighOutline,
  StopOutline,
  EyeOutline,
  EyeOffOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useThemeStore, type ThemeMode } from '@/stores/theme'
import { useConnectionStore } from '@/stores/connection'
import { useAuthStore } from '@/stores/auth'
import { useTTSSettings } from '@/composables/useTTSSettings'
import { useEdgeTTS } from '@/composables/useEdgeTTS'
import { ConnectionState } from '@/api/types'

const themeStore = useThemeStore()
const connectionStore = useConnectionStore()
const authStore = useAuthStore()
const { t } = useI18n()
const message = useMessage()
const appTitle = import.meta.env.VITE_APP_TITLE || 'OpenClaw Admin'
const appVersion = import.meta.env.VITE_APP_VERSION || ''

const loading = ref(false)
const saving = ref(false)
const configForm = ref({
  AUTH_USERNAME: '',
  AUTH_PASSWORD: '',
  OPENCLAW_WS_URL: '',
  OPENCLAW_AUTH_TOKEN: '',
  OPENCLAW_AUTH_PASSWORD: '', // Gateway 密码认证
})

// 数据库配置（模型、Hermes）
const dbConfigLoading = ref(false)
const dbConfigSaving = ref(false)
const dbConfigTesting = ref(false)
const dbConfig = ref({
  company_name: '',
  company_description: '',
  model_url: '',
  model_api_key: '',
  model_name: '',
  hermes_web_url: '',
  hermes_api_url: '',
  hermes_api_key: '',
})
const licenseKey = ref('')
const licenseActivated = ref(false)
const licenseExpiry = ref('')
const showLicense = ref(false)
const modelTestResult = ref<{ ok: boolean; message: string } | null>(null)
const hermesTestResult = ref<{ ok: boolean; message: string } | null>(null)

const modelFormRef = ref<FormInst | null>(null)
const hermesFormRef = ref<FormInst | null>(null)

const modelRules: Record<string, FormItemRule[]> = {
  model_url: [
    { required: true, message: '请输入模型地址', trigger: 'blur' },
    { type: 'url', message: '请输入有效的 URL (http/https/ws/wss)', trigger: 'blur' },
  ],
  model_name: [
    { required: true, message: '请输入模型名称', trigger: 'blur' },
  ],
}

const hermesRules: Record<string, FormItemRule[]> = {
  hermes_web_url: [
    { required: true, message: '请输入 Hermes Web 地址', trigger: 'blur' },
    { type: 'url', message: '请输入有效的 URL', trigger: 'blur' },
  ],
  hermes_api_url: [
    { required: true, message: '请输入 Hermes API 地址', trigger: 'blur' },
    { type: 'url', message: '请输入有效的 URL', trigger: 'blur' },
  ],
}

// TTS settings
const { settings: ttsSettings, resetSettings: resetTTSSettings, updateSettings: updateTTSSettings } = useTTSSettings()
const ttsVoices = ref<{ label: string; value: string; lang?: string }[]>([])
const ttsLoading = ref(false)
const ttsSaving = ref(false)
const ttsPreviewText = ref('你好，这是一个语音测试。')
const { speak: ttsSpeak, stop: ttsStop, isPlaying: ttsIsPlaying, isLoading: ttsIsLoading } = useEdgeTTS()

const themeOptions = computed(() => ([
  { label: t('pages.settings.themeLight'), value: 'light' },
  { label: t('pages.settings.themeDark'), value: 'dark' },
]))

const connectionStatus = computed(() => {
  switch (connectionStore.openclaw.state) {
    case ConnectionState.CONNECTED: return { text: t('pages.settings.statusConnected'), type: 'success' as const }
    case ConnectionState.CONNECTING: return { text: t('pages.settings.statusConnecting'), type: 'info' as const }
    case ConnectionState.RECONNECTING: return { text: t('pages.settings.statusReconnecting', { count: connectionStore.openclaw.reconnectAttempts }), type: 'warning' as const }
    case ConnectionState.FAILED: return { text: t('pages.settings.statusFailed'), type: 'error' as const }
    default: return { text: t('pages.settings.statusDisconnected'), type: 'error' as const }
  }
})

function handleThemeChange(mode: ThemeMode) {
  themeStore.setMode(mode)
}

async function loadConfig() {
  loading.value = true
  try {
    const token = authStore.getToken()
    const response = await fetch('/api/config', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
    const data = await response.json()
    if (data.ok) {
      configForm.value = {
        AUTH_USERNAME: data.config.AUTH_USERNAME || '',
        AUTH_PASSWORD: data.config.AUTH_PASSWORD || '',
        OPENCLAW_WS_URL: data.config.OPENCLAW_WS_URL || '',
        OPENCLAW_AUTH_TOKEN: data.config.OPENCLAW_AUTH_TOKEN || '',
        OPENCLAW_AUTH_PASSWORD: data.config.OPENCLAW_AUTH_PASSWORD || '',
      }
    }
  } catch (e) {
    message.error(t('pages.settings.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  saving.value = true
  try {
    const token = authStore.getToken()
    const response = await fetch('/api/config', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(configForm.value),
    })
    const data = await response.json()
    if (data.ok) {
      message.success(t('pages.settings.saveSuccess'))
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } else {
      message.error(data.error?.message || t('pages.settings.saveFailed'))
    }
  } catch (e) {
    message.error(t('pages.settings.saveFailed'))
  } finally {
    saving.value = false
  }
}

// ---- TTS Settings ----

async function loadTTSSettings() {
  ttsLoading.value = true
  try {
    // Load available voices - need to handle async loading
    let voices = window.speechSynthesis.getVoices()
    
    // If voices are not loaded yet, wait for voiceschanged event
    if (voices.length === 0) {
      await new Promise<void>((resolve) => {
        const handleVoicesChanged = () => {
          window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
          resolve()
        }
        window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged)
        // Also set a timeout in case the event never fires
        setTimeout(() => {
          window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
          resolve()
        }, 2000)
      })
      voices = window.speechSynthesis.getVoices()
    }
    
    const voiceOptions: { label: string; value: string; lang?: string }[] = []
    
    // Group voices by language
    const langGroups = new Map<string, SpeechSynthesisVoice[]>()
    for (const voice of voices) {
      const lang = voice.lang.split('-')[0] || 'other'
      if (!langGroups.has(lang)) {
        langGroups.set(lang, [])
      }
      langGroups.get(lang)!.push(voice)
    }
    
    // Add Chinese voices first
    const chineseVoices = langGroups.get('zh') || []
    for (const v of chineseVoices) {
      voiceOptions.push({
        label: `${v.name} (${v.lang})`,
        value: v.name,
        lang: v.lang,
      })
    }
    
    // Add English voices second
    const englishVoices = langGroups.get('en') || []
    for (const v of englishVoices) {
      voiceOptions.push({
        label: `${v.name} (${v.lang})`,
        value: v.name,
        lang: v.lang,
      })
    }
    
    // Add other voices
    for (const [lang, voiceList] of langGroups) {
      if (lang === 'zh' || lang === 'en') continue
      for (const v of voiceList) {
        voiceOptions.push({
          label: `${v.name} (${v.lang})`,
          value: v.name,
          lang: v.lang,
        })
      }
    }
    
    ttsVoices.value = voiceOptions
  } catch (err) {
    console.error('[SettingsPage] Failed to load TTS settings:', err)
  } finally {
    ttsLoading.value = false
  }
}

async function handlePreviewTTS() {
  if (ttsIsPlaying.value || ttsIsLoading.value) {
    ttsStop()
    return
  }
  
  try {
    await ttsSpeak(ttsPreviewText.value, {
      voice: ttsSettings.value.voice,
      rate: ttsSettings.value.rate,
      volume: ttsSettings.value.volume,
      pitch: ttsSettings.value.pitch,
    })
  } catch (err) {
    console.error('[SettingsPage] TTS preview error:', err)
    message.error(t('pages.settings.tts.previewFailed'))
  }
}

async function handleSaveTTS() {
  ttsSaving.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 300))
    message.success(t('pages.settings.tts.saveSuccess'))
  } finally {
    ttsSaving.value = false
  }
}

function handleResetTTS() {
  resetTTSSettings()
  message.success(t('pages.settings.tts.resetSuccess'))
}

onMounted(() => {
  loadConfig()
  loadDBConfig()
  loadTTSSettings()
})

// ---- 数据库配置（模型、Hermes） ----

async function loadDBConfig() {
  dbConfigLoading.value = true
  try {
    const token = authStore.getToken()
    const res = await fetch('/api/setup/status', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await res.json()
    if (data.ok) {
      licenseKey.value = data.licenseKey || ''
      licenseActivated.value = data.licenseActivated || false
      licenseExpiry.value = data.licenseExpiry || ''
      dbConfig.value = {
        company_name: data.companyName || '',
        company_description: data.companyDescription || '',
        model_url: data.modelUrl || '',
        model_api_key: data.modelApiKey || '',
        model_name: data.modelName || '',
        hermes_web_url: data.hermesWebUrl || '',
        hermes_api_url: data.hermesApiUrl || '',
        hermes_api_key: data.hermesApiKey || '',
      }
    }
  } catch (e) {
    message.error('加载配置失败')
  } finally {
    dbConfigLoading.value = false
  }
}

function copyLicenseKey() {
  if (licenseKey.value) {
    navigator.clipboard.writeText(licenseKey.value)
    message.success('已复制')
  }
}

function maskLicenseKey(key: string) {
  if (!key) return '生成中...'
  return key.substring(0, 4) + '••••••••••••••'
}

const activationCode = ref('')
const showActivationModal = ref(false)
const activating = ref(false)

function handleActivate() {
  activationCode.value = ''
  showActivationModal.value = true
}

async function confirmActivate() {
  if (!activationCode.value || activationCode.value.trim().length < 16) {
    message.error('激活码至少16位')
    return
  }
  
  activating.value = true
  try {
    const token = authStore.getToken()
    const res = await fetch('/api/license/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ activationCode: activationCode.value.trim() }),
    })
    const data = await res.json()
    if (data.ok) {
      licenseActivated.value = true
      licenseExpiry.value = data.expiry
      message.success('系统已激活')
      showActivationModal.value = false
    } else {
      message.error(data.error || '激活失败')
    }
  } catch (e) {
    message.error('激活请求失败')
  } finally {
    activating.value = false
  }
}

async function handleDeactivate() {
  try {
    const token = authStore.getToken()
    const res = await fetch('/api/license/deactivate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const data = await res.json()
    if (data.ok) {
      licenseActivated.value = false
      licenseExpiry.value = ''
      message.info('已取消激活')
    }
  } catch (e) {
    message.error('操作失败')
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  } catch {
    return dateStr
  }
}

async function saveDBConfig() {
  let valid = true
  
  if (modelFormRef.value) {
    try {
      await modelFormRef.value.validate()
    } catch (e) {
      valid = false
    }
  }
  
  if (hermesFormRef.value) {
    try {
      await hermesFormRef.value.validate()
    } catch (e) {
      valid = false
    }
  }
  
  if (!valid) {
    message.warning('请检查填写内容')
    return
  }

  dbConfigSaving.value = true
  try {
    const token = authStore.getToken()
    // 保存公司
    if (dbConfig.value.company_name) {
      await fetch('/api/setup/save-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          company_name: dbConfig.value.company_name,
          company_description: dbConfig.value.company_description,
        })
      })
    }
    // 保存模型
    await fetch('/api/setup/save-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        model_url: dbConfig.value.model_url,
        model_api_key: dbConfig.value.model_api_key,
        model_name: dbConfig.value.model_name,
      })
    })
    // 保存 Hermes
    await fetch('/api/setup/save-hermes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        web_url: dbConfig.value.hermes_web_url,
        api_url: dbConfig.value.hermes_api_url,
        api_key: dbConfig.value.hermes_api_key,
      })
    })
    message.success('配置已保存')
    // 重新加载配置以确保显示最新状态
    loadDBConfig()
  } catch (e) {
    message.error('保存失败')
  } finally {
    dbConfigSaving.value = false
  }
}

async function testModel() {
  if (!dbConfig.value.model_url || !dbConfig.value.model_name) {
    message.warning('请填写模型地址和名称')
    return
  }
  
  dbConfigTesting.value = true
  const startTime = Date.now()
  try {
    const token = authStore.getToken()
    const res = await fetch('/api/setup/test-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        model_url: dbConfig.value.model_url,
        model_api_key: dbConfig.value.model_api_key,
        model_name: dbConfig.value.model_name,
      })
    })
    const duration = Date.now() - startTime
    const data = await res.json()
    modelTestResult.value = { ok: data.ok, message: data.error || data.message || '' }
    if (data.ok) {
      message.success(`模型连接成功 (${duration}ms)`)
    } else {
      message.error(data.error || '连接失败')
    }
  } catch (e) {
    modelTestResult.value = { ok: false, message: '网络错误' }
    message.error('网络错误')
  } finally {
    dbConfigTesting.value = false
  }
}

async function testHermes() {
  if (!dbConfig.value.hermes_web_url || !dbConfig.value.hermes_api_url) {
    message.warning('请填写 Hermes Web 地址和 API 地址')
    return
  }
  dbConfigTesting.value = true
  hermesTestResult.value = null
  const startTime = Date.now()
  try {
    const token = authStore.getToken()
    const res = await fetch('/api/setup/test-hermes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        web_url: dbConfig.value.hermes_web_url,
        api_url: dbConfig.value.hermes_api_url,
        api_key: dbConfig.value.hermes_api_key,
      })
    })
    const duration = Date.now() - startTime
    const data = await res.json()
    hermesTestResult.value = { ok: data.ok, message: data.error || data.message || '' }
    if (data.ok) {
      message.success(`Hermes 连接成功 (${duration}ms)`)
    } else {
      message.error(data.error || '连接失败')
    }
  } catch (e) {
    hermesTestResult.value = { ok: false, message: '网络错误' }
    message.error('网络错误')
  } finally {
    dbConfigTesting.value = false
  }
}
</script>

<template>
  <NSpace vertical :size="24">
    <div>
      <NText strong style="font-size: 18px;">系统身份</NText>
      <NText depth="3" style="font-size: 14px; margin-left: 8px;">配置公司信息与管理员授权</NText>
    </div>

    <NSpace vertical :size="16">
      <!-- License Key -->
      <NCard :title="licenseActivated ? '已激活' : '未激活'" class="app-card">
        <NSpace vertical :size="16">
          <NSpace align="center">
            <NTag :type="licenseActivated ? 'success' : 'error'" size="medium">
              {{ licenseActivated ? '授权生效中' : '系统未授权' }}
            </NTag>
            <NText depth="3" v-if="licenseActivated">
              有效期至：{{ formatDate(licenseExpiry) }}
            </NText>
          </NSpace>
          
          <NText strong style="font-size: 16px; letter-spacing: 1px; font-family: monospace;">
            {{ showLicense ? licenseKey : maskLicenseKey(licenseKey) }}
          </NText>
          
          <NSpace align="center">
            <NButton quaternary circle size="small" @click="showLicense = !showLicense">
              <template #icon>
                <NIcon :component="showLicense ? EyeOffOutline : EyeOutline" />
              </template>
            </NButton>
            <NButton size="small" @click="copyLicenseKey">
              复制密钥
            </NButton>
            <NButton v-if="!licenseActivated" type="primary" size="small" @click="handleActivate">
              输入激活码
            </NButton>
            <NButton v-if="licenseActivated" type="error" quaternary size="small" @click="handleDeactivate">
              取消激活
            </NButton>
          </NSpace>
        </NSpace>
      </NCard>

    <!-- 公司信息 -->
    <NCard title="公司信息" class="app-card">
      <NSpin :show="dbConfigLoading">
        <NForm label-placement="left" label-width="100" style="max-width: 600px;">
          <NFormItem label="公司名称">
            <NInput
              v-model:value="dbConfig.company_name"
              placeholder="例如：道一数字科技"
              autocomplete="new-password"
            />
          </NFormItem>
          <NFormItem label="公司简介">
            <NInput
              v-model:value="dbConfig.company_description"
              type="textarea"
              placeholder="简要描述公司业务范围..."
              :autosize="{ minRows: 2, maxRows: 4 }"
              autocomplete="new-password"
            />
          </NFormItem>
        </NForm>
      </NSpin>
    </NCard>
    </NSpace>

    <NDivider style="margin: 0;" />

    <div>
      <NText strong style="font-size: 18px;">服务连接</NText>
      <NText depth="3" style="font-size: 14px; margin-left: 8px;">配置大模型与 Hermes 主控地址</NText>
    </div>

    <NSpace vertical :size="16">
    <!-- 大模型配置 -->
    <NCard title="大模型连接" class="app-card">
      <NAlert v-if="modelTestResult?.ok" type="success" :bordered="false" style="margin-bottom: 16px;">
        模型连接正常
      </NAlert>
      <NSpin :show="dbConfigLoading">
        <NForm
          ref="modelFormRef"
          :model="dbConfig"
          :rules="modelRules"
          label-placement="left"
          label-width="100"
          style="max-width: 600px;"
        >
          <NFormItem label="模型地址" path="model_url">
            <NInput
              v-model:value="dbConfig.model_url"
              placeholder="例如：http://192.168.31.164:8080/v1"
              autocomplete="new-password"
            />
          </NFormItem>
          <NFormItem label="API Key" path="model_api_key">
            <NInput
              v-model:value="dbConfig.model_api_key"
              type="password"
              show-password-on="click"
              placeholder="可选"
              autocomplete="new-password"
            />
          </NFormItem>
          <NFormItem label="模型名称" path="model_name">
            <NInput
              v-model:value="dbConfig.model_name"
              placeholder="例如：Qwen3.6-27B-UD-Q4_K_XL.gguf"
              autocomplete="new-password"
            />
          </NFormItem>
          <NFormItem label="">
            <NSpace>
              <NButton :loading="dbConfigTesting" @click="testModel">
                {{ modelTestResult?.ok ? '✅ 已验证' : '测试连接' }}
              </NButton>
            </NSpace>
          </NFormItem>
          <p v-if="modelTestResult?.message && !modelTestResult.ok" style="color: #ef4444; margin: 0; font-size: 13px;">
            {{ modelTestResult.message }}
          </p>
        </NForm>
      </NSpin>
    </NCard>

    <!-- Hermes 配置 -->
    <NCard title="Hermes 主控" class="app-card">
      <NAlert v-if="hermesTestResult?.ok" type="success" :bordered="false" style="margin-bottom: 16px;">
        Hermes 连接正常
      </NAlert>
      <NSpin :show="dbConfigLoading">
        <NForm
          ref="hermesFormRef"
          :model="dbConfig"
          :rules="hermesRules"
          label-placement="left"
          label-width="100"
          style="max-width: 600px;"
        >
          <NFormItem label="Web 地址" path="hermes_web_url">
            <NInput
              v-model:value="dbConfig.hermes_web_url"
              placeholder="例如：http://localhost:9119"
              autocomplete="new-password"
            />
          </NFormItem>
          <NFormItem label="API 地址" path="hermes_api_url">
            <NInput
              v-model:value="dbConfig.hermes_api_url"
              placeholder="例如：http://localhost:8642"
              autocomplete="new-password"
            />
          </NFormItem>
          <NFormItem label="API Key" path="hermes_api_key">
            <NInput
              v-model:value="dbConfig.hermes_api_key"
              type="password"
              show-password-on="click"
              placeholder="可选"
              autocomplete="new-password"
            />
          </NFormItem>
          <NFormItem label="">
            <NSpace>
              <NButton :loading="dbConfigTesting" @click="testHermes">
                {{ hermesTestResult?.ok ? '✅ 已验证' : '测试连接' }}
              </NButton>
            </NSpace>
          </NFormItem>
          <p v-if="hermesTestResult?.message && !hermesTestResult.ok" style="color: #ef4444; margin: 0; font-size: 13px;">
            {{ hermesTestResult.message }}
          </p>
        </NForm>
      </NSpin>
    </NCard>

    <!-- 保存按钮 -->
    <NCard class="app-card">
      <NSpace justify="end">
        <NButton type="primary" :loading="dbConfigSaving" @click="saveDBConfig" size="large">
          保存所有配置
        </NButton>
      </NSpace>
    </NCard>
    </NSpace>

    <NDivider style="margin: 0;" />

    <div>
      <NText strong style="font-size: 18px;">网关与环境</NText>
      <NText depth="3" style="font-size: 14px; margin-left: 8px;">OpenClaw Gateway 与管理员账号配置</NText>
    </div>

    <NSpace vertical :size="16">
    <NCard :title="t('pages.settings.connectionSettings')" class="app-card">
      <NAlert :type="connectionStatus.type" :bordered="false">
        {{ t('pages.settings.currentStatus', { status: connectionStatus.text }) }}
        <span v-if="connectionStore.openclaw.error">（{{ connectionStore.openclaw.error }}）</span>
      </NAlert>
    </NCard>

    <NCard :title="t('pages.settings.envSettings')" class="app-card">
      <NSpin :show="loading">
        <NForm label-placement="left" label-width="140" style="max-width: 600px;">
          <NFormItem :label="t('pages.settings.authUsername')">
            <NInput
              v-model:value="configForm.AUTH_USERNAME"
              :placeholder="t('pages.settings.authUsernamePlaceholder')"
              autocomplete="new-password"
            />
          </NFormItem>
          
          <NFormItem :label="t('pages.settings.authPassword')">
            <NInput
              v-model:value="configForm.AUTH_PASSWORD"
              type="password"
              show-password-on="click"
              :placeholder="t('pages.settings.authPasswordPlaceholder')"
              autocomplete="new-password"
            />
          </NFormItem>
          
          <NFormItem :label="t('pages.settings.openclawUrl')">
            <NInput
              v-model:value="configForm.OPENCLAW_WS_URL"
              :placeholder="t('pages.settings.openclawUrlPlaceholder')"
              autocomplete="new-password"
            />
          </NFormItem>
          
          <NFormItem :label="t('pages.settings.openclawToken')">
            <NInput
              v-model:value="configForm.OPENCLAW_AUTH_TOKEN"
              type="password"
              show-password-on="click"
              :placeholder="t('pages.settings.openclawTokenPlaceholder')"
              autocomplete="new-password"
            />
          </NFormItem>
          
          <NFormItem :label="t('pages.settings.openclawPassword')">
            <NInput
              v-model:value="configForm.OPENCLAW_AUTH_PASSWORD"
              type="password"
              show-password-on="click"
              :placeholder="t('pages.settings.openclawPasswordPlaceholder')"
              autocomplete="new-password"
            />
          </NFormItem>
          
          <NFormItem :label="''">
            <NSpace>
              <NButton type="primary" :loading="saving" @click="saveConfig">
                {{ t('pages.settings.save') }}
              </NButton>
            </NSpace>
          </NFormItem>
        </NForm>
      </NSpin>
      
      <NAlert type="info" :bordered="false" style="margin-top: 16px;">
        {{ t('pages.settings.envSettingsHint') }}
      </NAlert>
    </NCard>
    </NSpace>

    <NDivider style="margin: 0;" />

    <div>
      <NText strong style="font-size: 18px;">个性化</NText>
      <NText depth="3" style="font-size: 14px; margin-left: 8px;">外观主题与语音合成设置</NText>
    </div>

    <NSpace vertical :size="16">
    <NCard :title="t('pages.settings.appearanceSettings')" class="app-card">
      <NForm label-placement="left" label-width="120" style="max-width: 500px;">
        <NFormItem :label="t('pages.settings.themeMode')">
          <NSelect
            :value="themeStore.mode"
            :options="themeOptions"
            @update:value="handleThemeChange"
          />
        </NFormItem>
      </NForm>
    </NCard>

    <!-- TTS Settings -->
    <NCard :title="t('pages.settings.tts.title')" class="app-card">
      <NSpin :show="ttsLoading">
        <NSpace vertical :size="16">
          <NAlert type="info" :bordered="false">
            {{ t('pages.settings.tts.hint') }}
          </NAlert>

          <!-- Enable TTS -->
          <div>
            <NSpace align="center" :size="12">
              <NSwitch v-model:value="ttsSettings.enabled" />
              <NText>{{ t('pages.settings.tts.enable') }}</NText>
            </NSpace>
          </div>

          <NDivider style="margin: 0;" />

          <!-- Auto Play -->
          <div>
            <NText strong style="display: block; margin-bottom: 4px;">{{ t('pages.settings.tts.autoPlay') }}</NText>
            <NText depth="3" style="font-size: 13px; display: block; margin-bottom: 8px;">
              {{ t('pages.settings.tts.autoPlayHint') }}
            </NText>
            <NSpace align="center" :size="12">
              <NSwitch v-model:value="ttsSettings.autoPlay" />
            </NSpace>
          </div>

          <NDivider style="margin: 0;" />

          <!-- Voice Selection -->
          <div>
            <NText strong style="display: block; margin-bottom: 4px;">{{ t('pages.settings.tts.voice') }}</NText>
            <NText depth="3" style="font-size: 13px; display: block; margin-bottom: 8px;">
              {{ t('pages.settings.tts.voiceHint') }}
            </NText>
            <NSelect
              v-model:value="ttsSettings.voice"
              :options="ttsVoices"
              :placeholder="t('pages.settings.tts.voicePlaceholder')"
              filterable
              clearable
              style="max-width: 400px;"
            />
          </div>

          <NDivider style="margin: 0;" />

          <!-- Rate -->
          <div>
            <NText strong style="display: block; margin-bottom: 4px;">{{ t('pages.settings.tts.rate') }}</NText>
            <NText depth="3" style="font-size: 13px; display: block; margin-bottom: 8px;">
              {{ t('pages.settings.tts.rateHint') }}
            </NText>
            <div style="max-width: 400px; display: flex; align-items: center; gap: 16px;">
              <NSlider
                v-model:value="ttsSettings.rate"
                :min="0.1"
                :max="2.0"
                :step="0.1"
                :tooltip="true"
                :format-tooltip="(value: number) => `${value.toFixed(1)}x`"
                style="flex: 1;"
              />
              <NInputNumber
                v-model:value="ttsSettings.rate"
                :min="0.1"
                :max="2.0"
                :step="0.1"
                size="small"
                style="width: 80px;"
              >
                <template #suffix>x</template>
              </NInputNumber>
            </div>
          </div>

          <NDivider style="margin: 0;" />

          <!-- Volume -->
          <div>
            <NText strong style="display: block; margin-bottom: 4px;">{{ t('pages.settings.tts.volume') }}</NText>
            <NText depth="3" style="font-size: 13px; display: block; margin-bottom: 8px;">
              {{ t('pages.settings.tts.volumeHint') }}
            </NText>
            <div style="max-width: 400px; display: flex; align-items: center; gap: 16px;">
              <NSlider
                v-model:value="ttsSettings.volume"
                :min="0"
                :max="1"
                :step="0.1"
                :tooltip="true"
                :format-tooltip="(value: number) => `${Math.round(value * 100)}%`"
                style="flex: 1;"
              />
              <NInputNumber
                v-model:value="ttsSettings.volume"
                :min="0"
                :max="1"
                :step="0.1"
                size="small"
                style="width: 80px;"
              />
            </div>
          </div>

          <NDivider style="margin: 0;" />

          <!-- Pitch -->
          <div>
            <NText strong style="display: block; margin-bottom: 4px;">{{ t('pages.settings.tts.pitch') }}</NText>
            <NText depth="3" style="font-size: 13px; display: block; margin-bottom: 8px;">
              {{ t('pages.settings.tts.pitchHint') }}
            </NText>
            <div style="max-width: 400px; display: flex; align-items: center; gap: 16px;">
              <NSlider
                v-model:value="ttsSettings.pitch"
                :min="0.1"
                :max="2.0"
                :step="0.1"
                :tooltip="true"
                :format-tooltip="(value: number) => value.toFixed(1)"
                style="flex: 1;"
              />
              <NInputNumber
                v-model:value="ttsSettings.pitch"
                :min="0.1"
                :max="2.0"
                :step="0.1"
                size="small"
                style="width: 80px;"
              />
            </div>
          </div>

          <NDivider style="margin: 0;" />

          <!-- Preview -->
          <div>
            <NText strong style="display: block; margin-bottom: 4px;">{{ t('pages.settings.tts.preview') }}</NText>
            <NText depth="3" style="font-size: 13px; display: block; margin-bottom: 8px;">
              {{ t('pages.settings.tts.previewHint') }}
            </NText>
            <NSpace :size="12" align="center" style="max-width: 400px;">
              <NInput
                v-model:value="ttsPreviewText"
                :placeholder="t('pages.settings.tts.previewPlaceholder')"
                style="flex: 1;"
              />
              <NButton
                :type="ttsIsPlaying || ttsIsLoading ? 'error' : 'primary'"
                :loading="ttsIsLoading && !ttsIsPlaying"
                @click="handlePreviewTTS"
              >
                <template #icon>
                  <NIcon :component="ttsIsPlaying || ttsIsLoading ? StopOutline : VolumeHighOutline" />
                </template>
                {{ ttsIsPlaying ? t('pages.settings.tts.stop') : t('pages.settings.tts.play') }}
              </NButton>
            </NSpace>
          </div>

          <NDivider style="margin: 0;" />

          <!-- Actions -->
          <NSpace :size="8">
            <NButton type="primary" :loading="ttsSaving" @click="handleSaveTTS">
              {{ t('common.save') }}
            </NButton>
            <NButton @click="handleResetTTS">
              {{ t('common.reset') }}
            </NButton>
          </NSpace>
        </NSpace>
      </NSpin>
    </NCard>
    </NSpace>

    <NDivider style="margin: 0;" />

    <NCard :title="t('pages.settings.about')" class="app-card">
      <NSpace vertical :size="8">
        <NText>{{ appTitle }} v{{ appVersion }}</NText>
        <NText depth="3" style="font-size: 13px;">
          {{ t('pages.settings.aboutLine1') }}
        </NText>
        <NText depth="3" style="font-size: 13px;">
          {{ t('pages.settings.aboutLine2') }}
        </NText>
      </NSpace>
    </NCard>

    <!-- Activation Modal -->
    <NModal
      v-model:show="showActivationModal"
      preset="dialog"
      title="输入激活码"
      :positive-text="'激活'"
      :negative-text="'取消'"
      :show-icon="false"
      :positive-button-props="{ loading: activating }"
      @positive-click="confirmActivate"
    >
      <NInput
        v-model:value="activationCode"
        placeholder="请输入16位以上激活码"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 4 }"
        style="margin-top: 16px;"
      />
    </NModal>
  </NSpace>
</template>
