<script setup lang="ts">
import { h, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { NMenu, NText } from 'naive-ui'
import type { MenuOption } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import {
  GridOutline, ChatboxEllipsesOutline, ChatbubblesOutline, BookOutline, CalendarOutline,
  SparklesOutline, GitNetworkOutline, ExtensionPuzzleOutline, CogOutline, PulseOutline,
  FolderOutline, PeopleOutline, StorefrontOutline, ConstructOutline, TerminalOutline,
  DesktopOutline, ArchiveOutline, SpeedometerOutline, ListOutline, WarningOutline, DocumentTextOutline,
  BusinessOutline,
} from '@vicons/ionicons5'
import { NIcon } from 'naive-ui'
import { routes } from '@/router/routes'

defineProps<{ collapsed: boolean }>()

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

// Icon mapping to render in menu items
const iconMap: Record<string, any> = {
  GridOutline, ChatboxEllipsesOutline, ChatbubblesOutline, BookOutline, CalendarOutline,
  SparklesOutline, GitNetworkOutline, ExtensionPuzzleOutline, CogOutline, PulseOutline,
  FolderOutline, PeopleOutline, StorefrontOutline, ConstructOutline, TerminalOutline,
  DesktopOutline, ArchiveOutline, SpeedometerOutline, ListOutline, WarningOutline, DocumentTextOutline,
  BusinessOutline,
}

function renderIcon(iconName: string) {
  const icon = iconMap[iconName]
  if (!icon) return undefined
  return () => h(NIcon, null, { default: () => h(icon as any) })
}

// Helpers to navigate the route tree
const mainRoute = routes.find((r) => r.path === '/')
const bossGroupChildren = mainRoute?.children?.find((c) => c.path === 'boss')?.children ?? []

function getRouteByName(name: string) {
  return mainRoute?.children?.find((r) => r.name === name)
}

// Build grouped menu structure
const menuOptions = computed<MenuOption[]>(() => {
  if (!mainRoute?.children) return []

  // Boss group: render as a group with its sub-items
  const bossItems = bossGroupChildren
    .filter((gc) => !gc.meta?.hidden)
    .map((gc) => ({
      label: gc.meta?.titleKey ? t(gc.meta.titleKey as string) : (gc.meta?.title as string),
      key: gc.name as string,
      icon: gc.meta?.icon ? renderIcon(gc.meta.icon as string) : undefined,
    }))

  const bossGroup: MenuOption = {
    label: '数字员工 Boss',
    key: 'boss-group',
    icon: renderIcon('SpeedometerOutline'),
    children: bossItems,
  }

  // Helper to map a list of route names into MenuOptions under a group
  const createGroup = (label: string, routeNames: string[]) => {
    const items = routeNames
      .map((name) => getRouteByName(name))
      .filter((r): r is RouteRecordRaw => !!r && !(r.meta?.hidden))
      .map((r) => ({
        label: r?.meta?.titleKey ? t(r.meta.titleKey as string) : (r?.meta?.title as string),
        key: (r as RouteRecordRaw).name as string,
        icon: (r as RouteRecordRaw).meta?.icon ? renderIcon((r as RouteRecordRaw).meta!.icon as string) : undefined,
      }))
    return {
      label,
      key: label,
      children: items,
    } as MenuOption
  }

  // Collaboration: Office only (MyWorld moved under Boss)
  const collabGroup = createGroup('协作空间', ['Office'])

  // Infrastructure: Sessions, Models, Channels, Cron, Memory, Skills, Files, Terminal, RemoteDesktop
  const infraGroup = createGroup('基础设施', [
    'Sessions','Models','Channels','Cron','Memory','Skills','Files','Terminal','RemoteDesktop'
  ])

  // System: System, Backup, Connections, Settings
  const systemGroup = createGroup('系统', ['System','Backup','Connections','Settings'])

  const groups = [bossGroup, collabGroup, infraGroup, systemGroup].filter((g) => g) as MenuOption[]
  return groups
})

const activeKey = computed(() => route.name as string)

function handleSelect(key: string) {
  router.push({ name: key })
}
</script>

<template>
  <div style="display: flex; flex-direction: column; height: 100%;">
    <div style="display: flex; align-items: center; padding: 20px 24px; gap: 10px;">
      <span style="font-size: 24px;">🦞</span>
      <NText v-if="!collapsed" strong style="font-size: 18px; white-space: nowrap; letter-spacing: -0.5px;">
        Daoyi-Claw
      </NText>
    </div>

    <NMenu
      :value="activeKey"
      :collapsed="collapsed"
      :collapsed-width="64"
      :collapsed-icon-size="20"
      :options="menuOptions"
      :indent="24"
      @update:value="handleSelect"
    />
  </div>
</template>
