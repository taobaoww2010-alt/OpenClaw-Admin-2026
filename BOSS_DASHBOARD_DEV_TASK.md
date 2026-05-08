# Boss Dashboard 开发任务清单

## 项目背景
OpenClaw-Admin 是一个 Vue 3 + Naive UI + Pinia + Express 的管理面板。需要新增 "Boss Dashboard" 模块用于公司管理。

## 已完成 (不要重复做)
1. **后端 API** - `server/boss-api.js` - Agent/Task/Alert/Report 的完整 CRUD RESTful API
2. **SQLite 表** - boss_agents, boss_tasks, boss_alerts, boss_reports (已自动创建)
3. **路由注册** - `server/index.js` 中已注册 `/api/boss/*` 路由
4. **前端 Store** - `src/stores/boss.ts` - 完整的 Pinia store (含所有 API 调用方法)
5. **Boss Dashboard 首页** - `src/views/boss/BossDashboard.vue` - 统计概览页面

## 待完成 (按优先级)

### Phase 1: TaskBoard 任务看板页面
文件: `src/views/boss/TaskBoard.vue`
- 四列看板布局: todo | in_progress | review | done
- 每列显示对应状态的任务卡片（标题、优先级标签、负责人、截止日期）
- 支持拖拽任务在列间移动（改变 status），调用 `bossStore.updateTask(id, { status })`
- 顶部筛选栏：按 agent_id / priority / category 过滤
- 新建任务按钮 -> 弹出对话框 (NDialog + NForm)
- 使用 `bossStore.fetchTaskBoard()` 获取数据

### Phase 2: AlertCenter 告警中心页面
文件: `src/views/boss/AlertCenter.vue`
- 告警列表，按时间倒序
- 筛选：按 level (info/warning/error/critical)、resolved 状态
- 每条告警显示：级别标签、标题、消息、来源、时间
- 未处理告警支持一键解决按钮 -> `bossStore.resolveAlert(id)`
- 新建告警按钮（用于手动录入）
- 顶部统计：各级别告警数量

### Phase 3: AgentReport AI日报页面
文件: `src/views/boss/AgentReport.vue`
- 日报列表，按日期倒序，可点击展开查看完整内容
- 右侧/顶部显示最新日报摘要
- 新建日报按钮 -> 弹出编辑器对话框（Markdown 编辑）
- 支持按日期搜索
- 日报内容区域支持 Markdown 渲染

### Phase 4: Agent管理页面
文件: `src/views/boss/AgentManager.vue`
- Agent 列表表格 (NDataTable)：名称、角色、模型、状态、任务统计
- 支持增删改查
- 新建/编辑 Agent 使用对话框表单

### Phase 5: 路由配置 + 侧边栏集成
修改 `src/router/routes.ts`:
在 hermes/files 路由之后、settings 路由之前添加：

```typescript
{
  path: 'boss',
  name: 'BossDashboard',
  component: () => import('@/views/boss/BossDashboard.vue'),
  meta: { titleKey: 'routes.bossDashboard', icon: 'BusinessOutline', gateway: 'openclaw' },
},
{
  path: 'boss/tasks',
  name: 'TaskBoard',
  component: () => import('@/views/boss/TaskBoard.vue'),
  meta: { titleKey: 'routes.taskBoard', icon: 'AppsOutline', gateway: 'openclaw' },
},
{
  path: 'boss/alerts',
  name: 'AlertCenter',
  component: () => import('@/views/boss/AlertCenter.vue'),
  meta: { titleKey: 'routes.alertCenter', icon: 'AlertCircleOutline', gateway: 'openclaw' },
},
{
  path: 'boss/reports',
  name: 'AgentReport',
  component: () => import('@/views/boss/AgentReport.vue'),
  meta: { titleKey: 'routes.agentReport', icon: 'DocumentTextOutline', gateway: 'openclaw' },
},
{
  path: 'boss/agents',
  name: 'AgentManager',
  component: () => import('@/views/boss/AgentManager.vue'),
  meta: { titleKey: 'routes.agentManager', icon: 'PeopleOutline', gateway: 'openclaw' },
},
```

修改 `src/components/layout/AppSidebar.vue`:
在 iconMap 中添加：`AppsOutline, AlertCircleOutline, DocumentTextOutline` (从 @vicons/ionicons5 导入)

修改 `src/i18n/messages/zh-CN.ts`:
在 routes 对象中添加：
```
bossDashboard: '管理后台',
taskBoard: '任务看板',
alertCenter: '告警中心',
agentReport: 'AI日报',
agentManager: 'Agent管理',
```

修改 `src/i18n/messages/en-US.ts`:
对应英文翻译。

## 技术规范
- 所有页面使用 Naive UI 组件库 (NCard, NTable, NButton, NTag, NModal, NForm 等)
- Store 统一使用 `useBossStore` from `@/stores/boss`
- API 路径: `/api/boss/*` (已在后端注册)
- 样式使用 inline style 或 scoped CSS，保持与现有页面风格一致
- TypeScript 严格模式
- 参考现有页面风格: `src/views/cron/CronPage.vue`、`src/views/sessions/SessionsPage.vue`

## 数据模型参考 (src/stores/boss.ts)
```typescript
interface BossAgent { id, name, role, avatar, model, status, total_tasks, completed_tasks, failed_tasks, ... }
interface BossTask { id, title, description, status: 'todo'|'in_progress'|'review'|'done', priority: 'low'|'medium'|'high'|'urgent', agent_id, assigned_to, category, due_date, ... }
interface BossAlert { id, title, message, level: 'info'|'warning'|'error'|'critical', source, resolved, ... }
interface BossReport { id, date, title, content, summary, metrics, generated_by, ... }
```
