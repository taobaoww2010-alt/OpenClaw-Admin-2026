<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NBreadcrumb, NBreadcrumbItem, NButton, NSpace, NTooltip, NIcon, NTag } from 'naive-ui'
import { SunnyOutline, MoonOutline, LogOutOutline, LanguageOutline, ExpandOutline, ContractOutline } from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'
import { useLocaleStore } from '@/stores/locale'
import { useConnectionStore } from '@/stores/connection'
import { useWideModeStore } from '@/stores/wideMode'
import { ConnectionState } from '@/api/types'

const route = useRoute()
const router = useRouter()
const { isDark, toggle } = useTheme()
const authStore = useAuthStore()
const localeStore = useLocaleStore()
const connStore = useConnectionStore()
const wideModeStore = useWideModeStore()
const { t } = useI18n()

const openclawConnection = computed(() => {
  const { state } = connStore.openclaw
  if (state === ConnectionState.CONNECTED) return { label: 'OpenClaw', status: 'connected', type: 'success' as const }
  if (state === ConnectionState.CONNECTING || state === ConnectionState.RECONNECTING) return { label: 'OpenClaw', status: 'connecting', type: 'warning' as const }
  return { label: 'OpenClaw', status: 'disconnected', type: 'error' as const }
})

const hermesConnection = computed(() => {
  const { connected, connecting, error } = connStore.hermes
  if (connected) return { label: 'Hermes', status: 'connected', type: 'success' as const }
  if (connecting) return { label: 'Hermes', status: 'connecting', type: 'warning' as const }
  if (error) return { label: 'Hermes', status: 'error', type: 'error' as const }
  return { label: 'Hermes', status: 'disconnected', type: 'default' as const }
})

const breadcrumbs = computed(() => {
  const items: { label: string; name?: string }[] = [{ label: t('common.home'), name: 'Dashboard' }]
  if (route.name !== 'Dashboard') {
    const titleKey = route.meta.titleKey as string | undefined
    const fallbackTitle = route.meta.title as string | undefined
    items.push({ label: titleKey ? t(titleKey) : (fallbackTitle || '') })
  }
  return items
})

const languageToggleTarget = computed(() => (localeStore.locale === 'zh-CN' ? t('common.languageEn') : t('common.languageZh')))

async function handleLogout() {
  connStore.disconnectOpenClaw()
  connStore.disconnectHermes()
  await authStore.logout()
  router.push({ name: 'Login' })
}
</script>

<template>
  <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
    <NBreadcrumb>
      <NBreadcrumbItem
        v-for="(item, index) in breadcrumbs"
        :key="index"
        @click="item.name ? router.push({ name: item.name }) : undefined"
      >
        {{ item.label }}
      </NBreadcrumbItem>
    </NBreadcrumb>

    <NSpace :size="8" align="center">
      <NTooltip>
        <template #trigger>
          <NTag :type="openclawConnection.type" size="small" round>
            <template #icon>
              <span :class="['status-dot', `status-dot--${openclawConnection.status}`]" />
            </template>
            {{ openclawConnection.label }}
          </NTag>
        </template>
        OpenClaw: {{ openclawConnection.status }}
      </NTooltip>

      <NTooltip>
        <template #trigger>
          <NTag :type="hermesConnection.type" size="small" round>
            <template #icon>
              <span :class="['status-dot', `status-dot--${hermesConnection.status}`]" />
            </template>
            {{ hermesConnection.label }}
          </NTag>
        </template>
        Hermes: {{ hermesConnection.status }}
      </NTooltip>

      <NTooltip>
        <template #trigger>
          <NButton quaternary circle @click="toggle">
            <template #icon>
              <NIcon :component="isDark ? SunnyOutline : MoonOutline" />
            </template>
          </NButton>
        </template>
        {{ isDark ? t('common.switchToLight') : t('common.switchToDark') }}
      </NTooltip>

      <NTooltip>
        <template #trigger>
          <NButton quaternary circle @click="wideModeStore.toggle">
            <template #icon>
              <NIcon :component="wideModeStore.isWideMode ? ContractOutline : ExpandOutline" />
            </template>
          </NButton>
        </template>
        {{ wideModeStore.isWideMode ? t('common.switchToNormalWidth') : t('common.switchToWideMode') }}
      </NTooltip>

      <NTooltip>
        <template #trigger>
          <NButton quaternary circle @click="localeStore.toggle">
            <template #icon>
              <NIcon :component="LanguageOutline" />
            </template>
          </NButton>
        </template>
        {{ t('common.toggleLanguage', { target: languageToggleTarget }) }}
      </NTooltip>

      <NTooltip>
        <template #trigger>
          <NButton quaternary circle @click="handleLogout">
            <template #icon>
              <NIcon :component="LogOutOutline" />
            </template>
          </NButton>
        </template>
        {{ t('common.logout') }}
      </NTooltip>
    </NSpace>
  </div>
</template>

<style scoped>
.status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-dot--connected {
  background-color: var(--n-success-color, #18a058);
}

.status-dot--connecting {
  background-color: var(--n-warning-color, #f0a020);
  animation: pulse 1.5s infinite;
}

.status-dot--error,
.status-dot--disconnected {
  background-color: var(--n-error-color, #d03050);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
