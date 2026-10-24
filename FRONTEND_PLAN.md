# 前端实施计划

> 桥接层（`crates/codex-bridge`）已把 codex app-server 的协议面做到 100% 建模。
> 本文件规划**宿主前端**——把那条 `AgentEvent` 事件流变成一个能用的 IDE。

## 0. 形态决策

| 方案 | 结论 |
|---|---|
| Tauri 外壳（Rust 命令层 + WebView） | **生产形态**，但不是第一步 |
| Vite + React 独立前端 | **第一步**。同一份代码，装进 Tauri 只是换个壳 |

理由：

1. **前端代码与外壳无关。** 传输层收敛到一个 `BridgeClient` 接口，换壳只换
   adapter 实现，不动组件。这本来就是该有的分层。
2. **Tauri 需要先装 cargo-tauri 并编译数百个 crate**。在协议层还没完全验证的
   时候就把编译时间和调试难度叠上来，不划算。
3. **前端需要能独立看到。** 协议层已验证，但"事件流变成界面"这一步还没人验证过。
   先让界面跑起来，用 mock 事件流驱动，看着不对就改。

`BridgeClient` 的三个实现，按落地顺序：

| Adapter | 用途 | 依赖 |
|---|---|---|
| `MockAdapter` | 前端开发与视觉验证，回放脚本化事件流 | 无 |
| `TauriAdapter` | 生产，通过 Tauri 命令调用桥接层 | Tauri 外壳 |
| `HttpAdapter` | 远程 / 容器内，走本地网关 | 网关进程 |

---

## 1. 布局

按 IDE 的实际使用重心分配面积：**中间是主角，左右都是辅助**。

```
┌────────────────────────────────────────────────────────────────────────┐
│ 顶栏  项目·分支 │ 模型选择器 │ 沙箱·审批 │ 连接状态 │ 设置               │  48px
├──────────────┬──────────────────────────────────────┬──────────────────┤
│ 左栏 280px    │ 中栏 自适应（主区）                  │ 右栏 320px       │
│              │                                      │                  │
│ ▸ 新建会话    │ ┌ 计划面板 ─────────────────────┐   │ 上下文            │
│ ▸ 技能        │ │ 可折叠 · 步骤状态实时更新      │   │  token 用量       │
│ ▸ 钩子        │ └────────────────────────────────┘   │  模型改派提示     │
│              │ ┌ 回合头部 ─────────────────────┐   │──────────────────│
│ 会话列表      │ │ 状态 · 耗时 · 模型 · 子 Agent │   │ 权限与沙箱        │
│  · 进行中     │ └────────────────────────────────┘   │  档位 · 就绪状态  │
│  · 今日       │                                      │──────────────────│
│  ─────────    │  消息流（滚动）                      │ MCP servers       │
│ 归档区        │   · 用户消息                        │  · 状态 · 认证    │
│              │   · 推理（折叠）                     │──────────────────│
│              │   · 工具卡片                        │ 复核队列          │
│              │   · 审批卡片                        │  · diff 审查      │
│              │   · 计划 / 文件变更 / 子 Agent       │                  │
│              │   · 未建模通知（折叠，不打扰）        │                  │
│              │                                      │                  │
│              │ ┌ 输入区 ───────────────────────┐   │                  │
│              │ │ @文件 @技能 引用 │ 发送/停止   │   │                  │
│              │ └──────────────────────────────┘   │                  │
├──────────────┴──────────────────────────────────────┴──────────────────┤
│ 状态栏  线程 · 回合 · 模型 · token · 沙箱 · 提示                        │  28px
└────────────────────────────────────────────────────────────────────────┘
```

几条布局原则，写下来是为了后面别走样：

- **中间永不被挤掉。** 左右栏都可折叠，折叠状态持久化到 localStorage。
- **右栏按需出现。** 没有待审批 / 没有沙箱异常时，权限与沙箱区块折叠成一行摘要，
  不占垂直空间——绝大多数时候用户不需要看它。
- **状态栏只放"现在是什么状态"**，不放可点击的操作，避免和顶栏抢。
- **底部固定、消息流独立滚动。** 输入区始终可见，长会话里不用滚到底才能打字。

---

## 2. 数据层

```
事件方向  app-server ──► BridgeClient ──► store ──► 组件
调用方向  组件 ──► store.action() ──► BridgeClient ──► app-server
```

`BridgeClient` 接口（前后端唯一的接缝）：

```ts
interface BridgeClient {
  connect(): Promise<ConnectInfo>
  // 线程
  listThreads(filter?): Promise<ThreadSummary[]>
  startThread(cwd: string, config?: unknown): Promise<Thread>
  resumeThread(id: string): Promise<Thread>
  forkThread(id: string): Promise<Thread>
  archiveThread(id: string): Promise<void>
  renameThread(id: string, name: string): Promise<void>
  // 回合
  sendMessage(threadId: string, input: UserInput[]): Promise<string>
  interrupt(threadId: string, turnId: string): Promise<void>
  steer(threadId: string, turnId: string, input: UserInput[]): Promise<void>
  // 事件（单一通道）
  subscribe(handler: (e: AgentEvent) => void): Unsubscribe
  // server -> client 请求（审批 / 工具调用）
  respond(requestId: unknown, payload: unknown): Promise<void>
}
```

### 2.1 事件契约映射

`AgentEvent` 的 40 余个变体映射到界面，规则：

| AgentEvent | 界面表现 |
|---|---|
| `TextDelta` | 追加到当前助手消息（流式，打字机效果） |
| `TextComplete` | **覆盖**该条消息的正文（流式可能重复或回退） |
| `ReasoningDelta` | 折叠的"思考中"区块，`isSummary` 决定用哪种标题 |
| `ToolCallStart` | 工具卡片出现，转圈 |
| `ToolCallDelta` | 卡片内流式输出（节流渲染） |
| `ToolCallEnd` | 卡片定格，显示状态 / 退出码 / 耗时，可展开全文 |
| `FileEdit` | 文件变更卡片 + diff 预览 |
| `PlanUpdated` / `PlanDelta` | 顶部计划面板 |
| `TurnDiffUpdated` | 回合 diff 区块 |
| `ApprovalRequested` | 审批卡片（阻塞输入区，视觉上突出） |
| `ToolCallRequested` | 工具执行中遮罩（宿主侧执行，不打断） |
| `HostCapabilityRequested` | 一行警示条 |
| `ContextCompacted` | **显式提示条**：历史已压缩 |
| `ReviewMode` | 进入 / 退出复核模式的分隔线 |
| `SubAgentActivity` | 子 Agent 徽章，点击跳转其 thread |
| `ImageView` / `ImageGeneration` | 图片缩略图 / 生成结果卡 |
| `ThreadEvent` | 更新会话列表条目（归档 / 改名 / 状态） |
| `GuardEvent` | 沙箱告警（world-writable 要显著）、模型改派提示 |
| `HostEvent` | 右栏 MCP / 钩子状态 |
| `Host4Event` | 右栏调试通道 / 模糊搜索（默认折叠） |
| `ServerRequestResolved` | 审批卡片从"等待"转"已处理"，**不靠超时兜底** |
| `Error` | 错误条，`willRetry` 时用轻提示不打断 |
| `Unhandled` | 折叠的"调试信息"，不打扰用户 |

**核心原则**：`Unhandled` 永远存在但不打扰。上游新增任何东西都不会让界面崩，
也不会让用户看到未知控件。

---

## 3. 模块拆分

每个文件 ≤300 行，与桥接层同一约束。

```
web/src/
├── main.tsx                     应用入口
├── App.tsx                      顶层布局与键盘快捷键
├── bridge/
│   ├── types.ts                 AgentEvent 等类型（与 Rust 侧同源）
│   ├── client.ts                BridgeClient 接口
│   ├── mock.ts                  MockAdapter：脚本化事件流
│   └── tauri.ts                 TauriAdapter（第二期）
├── store/
│   ├── index.ts                 zustand store 装配
│   ├── threads.ts               会话列表与生命周期
│   ├── turns.ts                 回合状态与消息组装
│   ├── queue.ts                 消息队列与 steering
│   └── settings.ts              模型 / 沙箱 / 权限 / 右栏折叠状态
├── components/
│   ├── layout/                  TopBar / SidebarLeft / SidebarRight / StatusBar / Panel
│   ├── chat/                    MessageList / MessageItem / Composer / PlanPanel
│   ├── cards/                   ToolCard / ApprovalCard / FileEditCard / SubAgentBadge
│   ├── panels/                  ContextMeter / PermissionsPanel / McpPanel / ReviewQueue
│   └── common/                  Button / Tabs / Collapsible / Badge / Spinner / Empty
├── styles/
│   ├── tokens.css               设计变量（颜色 / 间距 / 字体 / 圆角）
│   ├── base.css                 重置与排版基线
│   └── *.css                    按区块分文件
└── hooks/
    ├── useBridge.ts             连接与订阅
    ├── useKeyboard.ts           快捷键
    └── useMediaQuery.ts         响应式断点
```

---

## 4. 视觉基线

不引 UI 框架——设计变量 + 手写 CSS，换来完全可控的视觉，且没有框架的隐式样式。

**深色为主**（IDE 场景长时间使用），浅色主题通过 CSS 变量切换。

| 维度 | 取向 |
|---|---|
| 配色 | 中性灰蓝基底 + 单一强调色；语义色只用于状态（成功 / 警告 / 危险 / 信息） |
| 层次 | 靠**边框 + 极低对比底色**，不用重投影 |
| 字体 | UI 用系统栈；代码 / diff 用等宽栈 |
| 密度 | 中等偏紧，行高 1.6，间距用 4px 基准 |
| 圆角 | 统一 6px（控件）/ 10px（卡片） |
| 动效 | 只用于状态切换，时长 120–180ms，不做装饰性动画 |

**不做的**：渐变、玻璃拟态、大面积阴影、超过两种强调色、超过 14px 的圆角。

---

## 5. 分期

| 期 | 内容 | 可见产出 |
|---|---|---|
| **F0** | 工程骨架 + 设计变量 + 应用外壳布局 | 三栏布局 + 顶栏 + 状态栏 |
| **F1** | MockAdapter + 事件 store + 消息流 | 完整事件流渲染（mock 驱动） |
| **F2** | 工具卡片 / 审批卡片 / 计划面板 / 文件变更 | 交互卡片 |
| **F3** | 左栏会话管理 + 右栏面板（上下文 / 权限 / 沙箱 / MCP） | 信息架构完整 |
| **F4** | TauriAdapter + 外壳命令层 | 接真实 codex |

每期出口：`npm run build` 通过 + 类型检查零错误 + 界面无横向滚动 / 无溢出。

---

## 6. 与桥接层的对应

| 前端需要 | 桥接层提供 | 状态 |
|---|---|---|
| 事件流 | `Session::subscribe_events` | ✅ |
| 线程 CRUD | `Session::{create,read,list,fork,archive,rename}_thread` | ✅ |
| 回合控制 | `Session::{chat_send,steer,stop}` | ✅ |
| 审批应答 | `Session::{respond_approval,handle_server_request}` | ✅ |
| 工具执行 | `Session::enable_fs_tools` | ✅ |
| 模型目录 | `Session::{models,reasoning_efforts_for}` | ✅ |
| 沙箱状态 | `Session::{windows_sandbox_status,sandbox_is_ready}` | ✅ |
| 权限档位 | `Session::permission_profiles` | ✅ |
| 复核 | `Session::review_*` | ✅ |
| 技能 / 钩子 | `Session::{skills,hooks}` | ✅ |
| 配置读写 | `Session::{config,write_config}` | ✅ |

**前端不需要桥接层之外的任何新接口。** 这是 P0–P4 做到 100% 的直接收益。