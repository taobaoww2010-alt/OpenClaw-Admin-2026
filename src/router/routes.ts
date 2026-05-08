import type { RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { titleKey: 'routes.login', public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    meta: { requiresAuth: true },
    redirect: { name: 'BossDashboard' },
    children: [
      // ============ Boss 总控台 ============
      {
        path: 'boss',
        meta: { requiresAuth: true },
        redirect: { name: 'BossDashboard' },
        children: [
          {
            path: 'dashboard',
            name: 'BossDashboard',
            component: () => import('@/views/boss/BossDashboard.vue'),
            meta: { titleKey: 'routes.bossDashboard', icon: 'SpeedometerOutline' },
          },
          {
            path: 'tasks',
            name: 'TaskBoard',
            component: () => import('@/views/boss/TaskBoard.vue'),
            meta: { titleKey: 'routes.taskBoard', icon: 'ListOutline' },
          },
          {
            path: 'agents',
            name: 'AgentManager',
            component: () => import('@/views/boss/AgentManager.vue'),
            meta: { titleKey: 'routes.agentManager', icon: 'PeopleOutline' },
          },
          {
            path: 'alerts',
            name: 'AlertCenter',
            component: () => import('@/views/boss/AlertCenter.vue'),
            meta: { titleKey: 'routes.alertCenter', icon: 'WarningOutline' },
          },
          {
            path: 'reports',
            name: 'AgentReport',
            component: () => import('@/views/boss/AgentReport.vue'),
            meta: { titleKey: 'routes.agentReport', icon: 'DocumentTextOutline' },
          },
          {
            path: 'company-config',
            name: 'CompanyConfig',
            component: () => import('@/views/boss/CompanyConfig.vue'),
            meta: { titleKey: 'routes.companyConfig', icon: 'BusinessOutline' },
          },
          {
            path: 'world',
            name: 'BossWorld',
            component: () => import('@/views/myworld/MyWorldPage.vue'),
            meta: { titleKey: 'routes.bossWorld', icon: 'StorefrontOutline' },
          },
        ],
      },
      // ============ 协作空间 ============
      {
        path: 'office',
        name: 'Office',
        component: () => import('@/views/office/OfficePage.vue'),
        meta: { titleKey: 'routes.office', icon: 'ConstructOutline' },
      },
      {
        path: 'myworld',
        redirect: { name: 'BossWorld' },
        meta: { hidden: true },
      },
      // ============ 基础设施 ============
      {
        path: 'sessions',
        name: 'Sessions',
        component: () => import('@/views/sessions/SessionsPage.vue'),
        meta: { titleKey: 'routes.sessions', icon: 'ChatbubblesOutline' },
      },
      {
        path: 'sessions/:key',
        name: 'SessionDetail',
        component: () => import('@/views/sessions/SessionDetailPage.vue'),
        meta: { titleKey: 'routes.sessionDetail', hidden: true },
      },
      {
        path: 'models',
        name: 'Models',
        component: () => import('@/views/models/ModelsPage.vue'),
        meta: { titleKey: 'routes.models', icon: 'SparklesOutline' },
      },
      {
        path: 'channels',
        name: 'Channels',
        component: () => import('@/views/channels/ChannelsPage.vue'),
        meta: { titleKey: 'routes.channels', icon: 'GitNetworkOutline' },
      },
      {
        path: 'cron',
        name: 'Cron',
        component: () => import('@/views/cron/CronPage.vue'),
        meta: { titleKey: 'routes.cron', icon: 'CalendarOutline' },
      },
      {
        path: 'memory',
        name: 'Memory',
        component: () => import('@/views/memory/MemoryPage.vue'),
        meta: { titleKey: 'routes.memory', icon: 'BookOutline' },
      },
      {
        path: 'skills',
        name: 'Skills',
        component: () => import('@/views/skills/SkillsPage.vue'),
        meta: { titleKey: 'routes.skills', icon: 'ExtensionPuzzleOutline' },
      },
      {
        path: 'files',
        name: 'Files',
        component: () => import('@/views/files/FilesPage.vue'),
        meta: { titleKey: 'routes.files', icon: 'FolderOutline' },
      },
      {
        path: 'terminal',
        name: 'Terminal',
        component: () => import('@/views/terminal/TerminalPage.vue'),
        meta: { titleKey: 'routes.terminal', icon: 'TerminalOutline' },
      },
      {
        path: 'remote-desktop',
        name: 'RemoteDesktop',
        component: () => import('@/views/remote-desktop/RemoteDesktopPage.vue'),
        meta: { titleKey: 'routes.remoteDesktop', icon: 'DesktopOutline' },
      },
      // ============ 系统 ============
      {
        path: 'customers',
        name: 'Customers',
        component: () => import('@/views/customers/CustomerManager.vue'),
        meta: { titleKey: 'routes.customers', icon: 'BusinessOutline' },
      },
      {
        path: 'system',
        name: 'System',
        component: () => import('@/views/system/SystemPage.vue'),
        meta: { titleKey: 'routes.system', icon: 'PulseOutline' },
      },
      {
        path: 'backup',
        name: 'Backup',
        component: () => import('@/views/backup/BackupPage.vue'),
        meta: { titleKey: 'routes.backup', icon: 'ArchiveOutline' },
      },
      {
        path: 'connections',
        name: 'Connections',
        component: () => import('@/views/connections/ConnectionsPage.vue'),
        meta: { titleKey: 'routes.connections', icon: 'GitNetworkOutline' },
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/settings/SettingsPage.vue'),
        meta: { titleKey: 'routes.settings', icon: 'CogOutline' },
      },
      // ============ 隐藏/重定向路由 (保留兼容性) ============
      {
        path: 'dashboard',
        redirect: { name: 'BossDashboard' },
        meta: { hidden: true },
      },
      {
        path: 'chat',
        redirect: { name: 'Sessions' },
        meta: { hidden: true },
      },
      {
        path: 'config',
        redirect: { name: 'Models' },
        meta: { hidden: true },
      },
      {
        path: 'tools',
        redirect: { name: 'Skills' },
        meta: { hidden: true },
      },
      {
        path: 'monitor',
        name: 'Monitor',
        component: () => import('@/views/monitor/MonitorPage.vue'),
        meta: { titleKey: 'routes.monitor', icon: 'PulseOutline', hidden: true },
      },
      {
        path: 'agents',
        redirect: { name: 'AgentManager' },
        meta: { hidden: true },
      },
    ],
  },
]
