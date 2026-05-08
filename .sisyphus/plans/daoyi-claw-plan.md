# Daoyi-Claw 开发规划

## 项目概述

**Daoyi-Claw** 是对现有 OpenClaw-Admin 的完整架构重构。核心理念：**Boss 是顶层总控台，基础设施统一化，双网关并行化**。

### 当前问题

| 问题 | 现状 | 目标 |
|------|------|------|
| 双 UI 重复 | OpenClaw/Hermes 各 13 页面 + 9 Store | 统一为 1 套页面 + 1 套 Store |
| Boss 归属错误 | Boss 被锁在 OpenClaw gateway | Boss 是独立顶层，不属于任何 gateway |
| Gateway 切换模型 | 同一时刻只能连接一个 gateway | 双 gateway 并行连接 |
| 三套任务管理 | Wizard(编排) + Boss(管理) + Agents(状态) | Boss 管执行，Office 管编排，各司其职 |
| 功能碎片化 | 40+ 页面，部分功能模糊 | 精简重复，保留特色功能 |

### 技术栈（不变）

- 前端：Vue 3 + TypeScript + Pinia + Vue Router + Naive UI + Vite
- 后端：Express 5 + better-sqlite3 + WebSocket (ws)
- 通信：OpenClaw Gateway (WebSocket RPC) + Hermes API (REST proxy)

---

## 新架构设计

### 信息架构

```
┌─────────────────────────────────────────────────────┐
│                  Daoyi-Claw                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  🏠 总控台 (Boss) ← 新的首页，默认着陆页            │
│     ├── 📊 仪表盘     — 全局状态总览                  │
│     ├── 📋 任务调度    — 自然语言 → 分解 → 执行闭环   │
│     ├── 👥 员工管理    — 员工 CRUD + 能力配置         │
│     ├── ⚠️  告警中心    — 异常监控 + 推送通知          │
│     └── 📈 报告中心    — 绩效/产出报告                │
│                                                     │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                                     │
│  🏢 协作空间                                          │
│     ├── 🏗  场景编排  — 多 Agent 协作场景创建+执行     │
│     │   （原 Wizard 功能）                            │
│     └── 🖥 我的办公室 — 所有员工实时状态监控面板        │
│                                                     │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                                     │
│  🔧 基础设施（统一，双 gateway 并行）                 │
│     ├── 💬 会话管理   — OpenClaw + Hermes 统一列表   │
│     ├── 🤖 模型管理   — 统一模型配置                  │
│     ├── 🔗 渠道管理   — 统一渠道配置                  │
│     ├── ⏰ 定时任务   — 统一 Cron 管理                │
│     ├── 🧠 记忆管理   — 统一记忆管理                  │
│     ├── 🛠  技能管理   — 统一技能管理                 │
│     ├── 📁 文件管理   — 统一文件浏览                  │
│     ├── 💻 终端       — 统一终端访问                  │
│     └── 💻 远程桌面   — 统一远程桌面                  │
│                                                     │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                                     │
│  ⚙️  系统                                             │
│     ├── 📊 系统监控   — 系统指标 + 健康检查            │
│     ├── 🔄 备份恢复   — 数据备份管理                  │
│     ├── 🌐 连接管理   — Gateway + Hermes 连接状态      │
│     └── ⚙️  设置       — 全局配置                     │
└─────────────────────────────────────────────────────┘
```

### 三大核心视角

| 视角 | 对应模块 | 用户心智模型 | 数据来源 |
|------|----------|-------------|----------|
| **管理** | Boss 总控台 | "我下指令，员工干活" | `boss_tasks` + `boss_agents` |
| **编排** | Office 场景编排 | "我搭建场景，Agent 协作" | `scenarios` + `tasks` |
| **监控** | MyWorld 办公室 | "看看我的员工们都在干嘛" | Gateway sessions + Boss agents |

### 路由映射（新旧对照）

| 新路由 | 新名称 | 旧来源 | 变化 |
|--------|--------|--------|------|
| `/` | Dashboard | 旧 `/` Dashboard | 重定向到 `/boss` |
| `/boss` | Boss (首页) | 旧 `/boss/*` | **升级为首页** |
| `/boss/dashboard` | BossDashboard | 旧 `/boss/dashboard` | 保持 |
| `/boss/tasks` | TaskBoard | 旧 `/boss/tasks` | 保持 |
| `/boss/agents` | AgentManager | 旧 `/boss/agents` | 保持 |
| `/boss/alerts` | AlertCenter | 旧 `/boss/alerts` | 保持 |
| `/boss/reports` | AgentReport | 旧 `/boss/reports` | 保持 |
| `/office/scenarios` | ScenarioBuilder | 旧 Office + Wizard 合并 | **合并 Wizard 场景功能** |
| `/myworld` | MyWorld | 旧 `/myworld` | **保留**，员工状态监控 |
| `/sessions` | Sessions | 旧 OpenClaw + Hermes 合并 | **统一** |
| `/models` | Models | 旧 OpenClaw + Hermes 合并 | **统一** |
| `/channels` | Channels | 旧 OpenClaw + Hermes 合并 | **统一** |
| `/cron` | Cron | 旧 OpenClaw + Hermes 合并 | **统一** |
| `/memory` | Memory | 旧 OpenClaw + Hermes 合并 | **统一** |
| `/skills` | Skills | 旧 OpenClaw + Hermes 合并 | **统一** |
| `/files` | Files | 旧 OpenClaw + Hermes 合并 | **统一** |
| `/terminal` | Terminal | 旧 OpenClaw + Hermes 合并 | **统一** |
| `/remote-desktop` | RemoteDesktop | 旧 OpenClaw + Hermes 合并 | **统一** |
| `/system` | System | 旧 OpenClaw + Hermes 合并 | **统一** |
| `/connections` | Connections | **新增** | 双 gateway 状态面板 |
| `/settings` | Settings | 旧 `/settings` | 保持 |
| ~~`/chat`~~ | — | 旧 `/chat` | 合并进 Sessions |
| ~~`/agents` (OpenClaw)~~ | — | 旧 `/agents` | 合并进 Boss 员工管理 |
| ~~`/office` (旧版)~~ | — | 旧 `/office` | 功能合并进 `/office/scenarios` |
| ~~`/monitor`~~ | — | 旧 `/monitor` (hidden) | 合并进 System |
| ~~`/hermes/*`~~ | — | 旧 13 个 Hermes 页面 | **全部删除**，功能并入统一页 |
| ~~`/wizard`~~ | — | 旧 wizard 入口 | 功能合并进 `/office/scenarios` |

### Store 架构（重构后）

| 新 Store | 来源 | 职责 |
|----------|------|------|
| `bossStore` | 旧 `boss.ts` + `boss/dispatcher.ts` | Boss 全部状态 + 调度流程 |
| `sessionStore` | 旧 OpenClaw `session.ts` + Hermes `hermes/session.ts` | 统一会话管理 |
| `modelStore` | 旧 OpenClaw `model.ts` + Hermes `hermes/model.ts` | 统一模型管理 |
| `channelStore` | 旧 OpenClaw `channel.ts` + Hermes `hermes/channel.ts` | 统一渠道管理 |
| `cronStore` | 旧 OpenClaw `cron.ts` + Hermes `hermes/cron.ts` | 统一定时任务 |
| `memoryStore` | 旧 OpenClaw `memory.ts` + Hermes `hermes/memory.ts` | 统一记忆管理 |
| `skillStore` | 旧 OpenClaw `skill.ts` + Hermes `hermes/skill.ts` | 统一技能管理 |
| `connectionStore` | 旧 `websocket.ts` + `hermes/connection.ts` | **统一连接管理**（双 gateway 并行） |
| `officeStore` | 旧 `office.ts` + `wizard.ts` | **场景编排**：scenarios + tasks + agent 协作 |
| `myworldStore` | **新增** | MyWorld 员工状态聚合 |
| `authStore` | 旧 `auth.ts` | 认证（不变） |
| `configStore` | 旧 `config.ts` | 配置（不变） |
| `themeStore` | 旧 `theme.ts` | 主题（不变） |
| `localeStore` | 旧 `locale.ts` | 国际化（不变） |
| ~~`wizardStore`~~ | — | **删除**，功能并入 officeStore |
| ~~`chatStore`~~ | — | **合并**进 sessionStore |
| ~~`agentStore`~~ | — | **合并**进 bossStore |
| ~~`hermes/*` (9个)~~ | — | **全部删除** |
| ~~`office.ts` (旧版)~~ | — | **合并**进 officeStore（含 Wizard 逻辑） |
| ~~`node.ts`~~ | — | 合并进 remote-desktop |
| ~~`terminal.ts`~~ | — | 合并进统一终端 |
| ~~`remote-desktop.ts`~~ | — | 合并进统一远程桌面 |
| ~~`backup.ts`~~ | — | 合并进系统模块 |
| ~~`monitor.ts`~~ | — | 合并进 System |

**Store 数量**：从 35+ 降至 13

### 后端架构（重构后）

```
Express Server (:3000)
│
├── /api/auth/*          认证（不变）
├── /api/boss/*          Boss CRUD + 调度 + 执行（整合）
│   ├── GET  /stats      仪表盘统计
│   ├── CRUD /agents     员工管理
│   ├── CRUD /tasks      任务管理
│   ├── CRUD /alerts     告警管理
│   ├── CRUD /reports    报告管理
│   ├── POST /dispatch   调度预览
│   ├── POST /confirm    确认执行
│   └── GET  /connections  双 gateway 连接状态 ★新增
│
├── /api/hermes/*        Hermes 代理层（保持不变）
│   ├── /api/hermes/v1/* Hermes API 代理
│   └── /api/hermes/dashboard/* Dashboard 管理
│
├── /api/gateway/*       OpenClaw Gateway 封装（规范化）
│   ├── POST /rpc        RPC 调用
│   ├── GET  /status     Gateway 状态
│   └── GET  /events     SSE 事件推送
│
├── /api/system/*        系统管理（整合）
│   ├── GET  /metrics    系统指标
│   ├── GET  /health     健康检查
│   └── CRUD /config     配置管理
│
└── SQLite (daoyi.db)
    ├── boss_agents
    ├── boss_tasks
    ├── boss_alerts
    ├── boss_reports
    └── backup_records（保留）
```

**关键变化**：
- 移除 `/api/wizard/*` 路由（场景功能保留在后端，由 Office 前端通过新接口调用）
- 保留 `scenarios`/`tasks` 表（Office 场景编排的数据基础）
- 规范化 Gateway 路由为 `/api/gateway/*`
- 新增 `/api/boss/connections` 端点（双 gateway 状态）
- 系统相关路由整合为 `/api/system/*`

---

## 开发阶段规划

### Phase 0: 基础重构（骨架搭建）

**目标**：建立新的路由、Store 架构、连接管理，确保应用可运行

| # | 任务 | 涉及文件 | 预计复杂度 |
|---|------|----------|-----------|
| 0.1 | 重命名项目标识（claw-admin → daoyi-claw） | package.json, .env, index.html, AGENTS.md | 低 |
| 0.2 | 重构 routes.ts：新路由结构 | src/router/routes.ts | 中 |
| 0.3 | 重构 AppSidebar.vue：新菜单结构 | src/components/layout/AppSidebar.vue | 中 |
| 0.4 | 创建 connectionStore：统一双 gateway 管理 | src/stores/connection.ts | 高 |
| 0.5 | 重构 DefaultLayout.vue：并行连接模式 | src/layouts/DefaultLayout.vue | 中 |
| 0.6 | 创建 AppHeader.vue 连接状态指示器 | src/components/layout/AppHeader.vue | 低 |

**验证标准**：
- 应用可启动（`npm run dev`）
- 左侧菜单显示新结构
- 双 gateway 可同时连接
- 路由导航正常

### Phase 1: Boss 总控台（核心功能）

**目标**：Boss 作为首页，所有 Boss 功能正常工作

| # | 任务 | 涉及文件 | 预计复杂度 |
|---|------|----------|-----------|
| 1.1 | 整合 bossStore + dispatcherStore | src/stores/boss.ts, src/stores/boss/dispatcher.ts | 高 |
| 1.2 | BossDashboard.vue 适配新架构 | src/views/boss/BossDashboard.vue | 中 |
| 1.3 | TaskBoard.vue 适配新架构 | src/views/boss/TaskBoard.vue | 中 |
| 1.4 | AgentManager.vue 适配新架构 | src/views/boss/AgentManager.vue | 中 |
| 1.5 | AlertCenter.vue 适配新架构 | src/views/boss/AlertCenter.vue | 低 |
| 1.6 | AgentReport.vue 适配新架构 | src/views/boss/AgentReport.vue | 低 |
| 1.7 | 后端：整合 boss 路由（移除 wizard 依赖） | server/index.js, server/boss-*.js | 高 |
| 1.8 | 后端：新增 /api/boss/connections 端点 | server/index.js | 中 |

**验证标准**：
- Boss 页面正常渲染（数据从 API 加载）
- 调度流程完整（dispatch → confirm → execute）
- 任务状态实时更新（通过 SSE）

### Phase 2: 基础设施统一（消除重复）

**目标**：合并 OpenClaw + Hermes 重复页面和 Store

| # | 任务 | 涉及文件 | 预计复杂度 |
|---|------|----------|-----------|
| 2.1 | 合并 sessionStore | src/stores/session.ts | 高 |
| 2.2 | 合并 modelStore | src/stores/model.ts | 中 |
| 2.3 | 合并 channelStore | src/stores/channel.ts | 中 |
| 2.4 | 合并 cronStore | src/stores/cron.ts | 中 |
| 2.5 | 合并 memoryStore | src/stores/memory.ts | 中 |
| 2.6 | 合并 skillStore | src/stores/skill.ts | 中 |
| 2.7 | 统一 SessionsPage.vue | src/views/sessions/SessionsPage.vue | 高 |
| 2.8 | 统一 ModelsPage.vue | src/views/models/ModelsPage.vue | 中 |
| 2.9 | 统一 ChannelsPage.vue | src/views/channels/ChannelsPage.vue | 中 |
| 2.10 | 统一 CronPage.vue | src/views/cron/CronPage.vue | 中 |
| 2.11 | 统一 MemoryPage.vue | src/views/memory/MemoryPage.vue | 中 |
| 2.12 | 统一 SkillsPage.vue | src/views/skills/SkillsPage.vue | 中 |
| 2.13 | 删除 13 个 Hermes 页面 | src/views/hermes/ | 低（纯删除） |
| 2.14 | 删除 9 个 Hermes Store | src/stores/hermes/ | 低（纯删除） |
| 2.15 | 合并 officeStore + wizardStore | src/stores/office.ts + wizard.ts | 高 |
| 2.16 | 重构 Office 页面为 ScenarioBuilder | src/views/office/OfficePage.vue | 高 |
| 2.17 | 重构 MyWorldPage.vue 为员工状态面板 | src/views/myworld/MyWorldPage.vue | 中 |
| 2.18 | 创建 myworldStore | src/stores/myworld.ts | 中 |

**验证标准**：
- 每个统一页面都能显示来自双 gateway 的数据
- 用户可选择数据源（OpenClaw/Hermes/全部）
- Hermes 目录已删除，无残留引用

### Phase 3: 系统模块整合

**目标**：整合系统相关功能，规范化后端路由

| # | 任务 | 涉及文件 | 预计复杂度 |
|---|------|----------|-----------|
| 3.1 | 统一 FilesPage.vue | src/views/files/FilesPage.vue | 中 |
| 3.2 | 统一 TerminalPage.vue | src/views/terminal/TerminalPage.vue | 中 |
| 3.3 | 统一 RemoteDesktopPage.vue | src/views/remote-desktop/RemoteDesktopPage.vue | 中 |
| 3.4 | 整合 SystemPage.vue | src/views/system/SystemPage.vue | 中 |
| 3.5 | 整合 BackupPage.vue | src/views/backup/BackupPage.vue | 低 |
| 3.6 | 新增 ConnectionsPage.vue（双 gateway 状态） | src/views/connections/ConnectionsPage.vue | 中 |
| 3.7 | 后端：规范化 Gateway 路由为 /api/gateway/* | server/index.js, server/gateway.js | 中 |
| 3.8 | 后端：整合系统路由为 /api/system/* | server/index.js | 中 |
| 3.9 | 后端：移除 wizard 相关路由（保留 scenarios/tasks 表） | server/index.js | 低 |

**验证标准**：
- 所有系统页面正常工作
- ConnectionsPage 显示双 gateway 连接状态
- 后端路由规范化，无 wizard 残留

### Phase 4: 清理和优化

**目标**：代码清理、性能优化、构建验证

| # | 任务 | 涉及文件 | 预计复杂度 |
|---|------|----------|-----------|
| 4.1 | 清理无用导入和引用 | 全局 | 中 |
| 4.2 | 类型检查通过 | 全局 | 中 |
| 4.3 | 构建通过（npm run build） | 全局 | 中 |
| 4.4 | 更新 i18n 键值 | src/locales/ | 低 |
| 4.5 | 更新环境变量 | .env | 低 |
| 4.6 | 数据库迁移脚本（如需） | server/migrations/ | 中 |
| 4.7 | 编写迁移文档 | docs/MIGRATION.md | 低 |

**验证标准**：
- `npm run build` 通过，无类型错误
- 无 console.warn 关于未找到的模块
- 构建产物大小合理

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 合并 Store 时丢失状态 | 功能异常 | Phase 2 逐 Store 合并，每个合并后立即验证 |
| 删除 Hermes 页面后残留引用 | 构建失败 | 使用 grep 搜索所有引用后再删除 |
| 双 gateway 并行连接冲突 | 数据混乱 | connectionStore 中严格隔离两个连接的命名空间 |
| Boss 调度依赖 Hermes | 功能断裂 | 保持 hermes-proxy.js 和 boss-hermes-bridge.js 不变 |

---

## 技术决策

### 1. 双 Gateway 并行 vs 切换

**决策**：并行连接

**理由**：
- Boss 需要同时访问 OpenClaw Gateway（执行任务）和 Hermes API（调度分解）
- 用户不需要手动切换，系统自动路由请求到正确的 backend
- 减少用户认知负担

**实现**：connectionStore 维护两个独立连接：
```ts
interface ConnectionState {
  openclaw: { connected: boolean; ws: WebSocket | null; ... }
  hermes: { connected: boolean; client: HermesApiClient | null; ... }
}
```

### 2. Store 合并策略

**决策**：每个 Store 内部按 gateway 区分数据源

**理由**：
- 保持单一 Store 接口，页面不需要关心数据来自哪个 gateway
- Store 内部自动合并两个数据源
- 页面可选择显示特定 gateway 的数据

**实现**：
```ts
// sessionStore 示例
const openclawSessions = ref<Session[]>([])
const hermesSessions = ref<Session[]>([])
const allSessions = computed(() => [...openclawSessions.value, ...hermesSessions.value])
```

### 3. 数据库迁移

**决策**：保留现有 wizard.db，重命名为 daoyi.db

**理由**：
- 表结构不变
- `scenarios`/`tasks` 表**永久保留**（Office 场景编排的数据基础）
- `boss_*` 表继续使用
- `backup_records` 表保留

### 4. 删除策略

**决策**：先注释隐藏，确认后删除

**理由**：
- Hermes 页面在确认统一页面工作正常后删除
- 避免过早删除导致功能丢失

### 5. Office 与 Wizard 合并

**决策**：旧 Office 页面 + Wizard Store 合并为新的 `/office/scenarios` 页面

**理由**：
- Wizard 有完整的场景编排逻辑（scenarios + tasks + agent bindings + execution）
- 旧 Office 页面是入口，Wizard 是底层逻辑，两者本质是同一功能
- 合并后：Office 负责场景创建和编排，Boss 负责任务派发，职责清晰

### 6. MyWorld 定位

**决策**：MyWorld 作为独立的"员工状态监控面板"保留

**理由**：
- 与 Boss（管理视角）和 Office（编排视角）不同，MyWorld 是纯监控视角
- 数据来源：聚合 Gateway sessions + Boss agents 的实时状态
- 用户价值：一目了然看到所有数字员工在做什么、产出如何

---

## 估算

| 阶段 | 任务数 | 预计时间 | 风险级别 |
|------|--------|----------|----------|
| Phase 0 | 6 | 中等 | 低 |
| Phase 1 | 8 | 高 | 中 |
| Phase 2 | 18 | 高 | 中 |
| Phase 3 | 9 | 中 | 低 |
| Phase 4 | 7 | 低 | 低 |
| **合计** | **49** | — | — |

---

## 下一步

请确认：
1. 更新后的产品架构（含 Office 场景编排 + MyWorld 状态监控）是否符合你的预期？
2. 确认后我将按 Phase 0 → Phase 4 的顺序启动开发。
