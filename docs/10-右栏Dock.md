# 10 · 右栏 Dock（终端 / 文件 / 预览 / 面板）

> 抄 dsh：`packages/client/ui-sidebar-right/`（tab 注册表/shell）＋`ui-sidebar-terminal/`＋`ui-sidebar-files/`＋`ui-sidebar-documentpreview/`＋`ui-dockkit`（布局引擎）｜协议：`command/exec/*`＋process/*＋本地 fs｜决策：**改**（dockkit 简化：单列多 tab，不做完整布局引擎）

## 1. dsh 的设计

- **tab 类型注册表**：右栏 tab 按 `dsh-resource://` 地址 glob 分发到实现
  （extension/builtin/fallback 优先级带）——任何模块可注册新 tab 类型。
- **每会话布局**：≤2 水平 pane + 浮动面板 + 全屏；localStorage 按 sessionId
  持久化；操作序列可 undo。
- **终端**：多实例 tab、shell 选择、**重载后进程恢复**、tab 补全。
- **文件树**：工作区逐级目录、watch 刷新。
- **文档预览**：MD/代码/图片/PDF/Office/HTML 多渲染器、wrap 切换、重载。
- **guide 空态页**：无 tab 时的"罗盘"引导。

## 2. codex 协议支持

| 需求 | 协议 | 状态 |
|---|---|---|
| 用户终端 | `command/exec`（spawn）＋`exec/{write,resize,terminate}`＋`command/exec/outputDelta`＋`process/{outputDelta,exited}` | ❌ 桥未接（17 期 4 命令） |
| 文件树/读写 | 本地 `bridge_fs_*`（保留；协议 fs/* 不接——现有本地实现已工作，换协议无增益有风险） | ✅ 已有 |
| 文件变更刷新 | 本地实现轮询/手动；协议 `fs/changed` 需 watch 链路——一期不接，手动刷新按钮 | ✅ 本地 |
| 预览 | 本地渲染 | ✅ 本地 |

**终端两个大坑**（写进代码注释，来自 PLAN.md 的实测结论）：
1. `command/exec` **响应推迟到进程退出才返回**，且排在所有 outputDelta 之后
   ——"等响应再显示输出"是死路，UI 必须纯事件驱动（outputDelta 到即渲染）。
2. `command/exec` 是**用户终端**，不受回合沙箱约束，与消息流里的
   `commandExecution` Item（Agent 沙箱命令）是两套东西——UI 上必须可区分
   （终端 tab 头标注「用户终端」）。
3. 无"进程启动成功"回执事件：spawn 后前端记 pending 实例，首个
   outputDelta 或 process/exited 到达即定态。

## 3. AIGoat 改造设计

### 3.1 Dock 骨架（替代现 SidebarRight + Panels）

```
components/dock/
├── DockShell.tsx          右栏容器：tab 条 + 活动面板区（≤180）
├── DockTabs.tsx           tab 条：图标/标题/关闭/+ 菜单（≤160）
├── tabRegistry.ts         tab 类型注册表（≤160）：
│   { id, title, icon, render, priority }
├── DockGuide.tsx          空态引导页（≤100）
├── useDockStore.ts        每线程布局：openTabs/activeTab/宽度，存安装目录
│                          ui-state.json 的 `dock.<threadId>` 段
│                          （bridge_ui_state 读写、防抖写盘）（≤160）
└── *.module.css

components/dock-tabs/
├── TerminalTab.tsx        终端（多实例）（≤200）
├── TerminalInstance.tsx   单实例：xterm 等宽流式渲染（≤200，不引 xterm.js，
│                          自研 TerminalBlock 流式 + ANSI 基础色）
├── FilesTab.tsx           文件树（现 Explorer 86 迁入）（≤180）
├── PreviewTab.tsx         文档预览（现 EditorDrawer 157 改造）（≤200）
├── SkillsTab.tsx          技能面板（现 Panels 拆出）（≤160）
├── McpTab.tsx             MCP 面板（≤160）
├── PermissionsTab.tsx     权限与沙箱（≤180）
├── ReviewTab.tsx          复核队列（11 板块）（≤180）
├── SubagentTab.tsx        子代理只读（09 板块）（≤140）
└── *.module.css
```

### 3.2 关键设计

- **注册表优先级**：`builtin` 固定类型 + 预留 `extension` 段（未来 AF 相关
  tab 可插）——学 dsh 的分发思想，砍掉 glob 地址匹配（类型少，直查表即可）。
- **每线程持久化**：`useDockStore` keyed by threadId，落**安装目录**
  `ui-state.json` 的 `dock` 段（00 铁律「配置落盘」；不用 localStorage——
  WebView 存储落 C 盘 AppData）；切换线程恢复各自布局；线程删除时清对应
  dock 条目（防泄漏，随防抖写盘一并生效）。
- **宽度与 track**：dock 宽度归 01 的布局 store；dock 面板 absolute 锚定
  右缘（track 语义），全屏态隐藏拖拽把手。
- **终端**：
  - 多实例：tab 内再分实例（tab=「终端」，实例=子 tab 或下拉切换，取子 tab）。
  - 输入：行缓冲回车发送 `command/exec/write`（无 readline，标注局限）；
    Ctrl+C 发 interrupt 字符；`exec/resize` 随面板尺寸节流发送。
  - 重载恢复：**不做**（dsh 靠宿主进程保活；Tauri 重载即 WebView 刷新，
    Rust 侧进程仍在——17 期在 Rust 层存活动实例清单，前端重载后
    `bridge_terminal_list` 重挂输出流，列为二期）。
- **文件树/预览**：现有 Explorer/EditorDrawer 逻辑迁移；预览渲染器
  MD（marked）/代码（CodeMirror 只读）/图片（ImageLightbox）三种先行
  （PDF/Office 后期评估，不引重库）。
- **旧 Panels.tsx(172)/usePanels(65)** 拆入各 tab 后退役；
  右栏数据 `store/resources.ts`(122) 改事件驱动（C 期后）。

## 4. 实施清单

- [x] tabRegistry + DockShell/Tabs/Guide + 每线程持久化
- [x] FilesTab/PreviewTab 迁移（`Explorer`/`EditorDrawer`/`Panels`/`usePanels` 全部退役）
- [x] Skills/Mcp/Permissions/Context 四 tab 迁移
      （顺带退役 `ResourcesDialog` —— 技能与钩子已经是「技能」tab，
      同一份内容留两个入口只会让人不知道该去哪）
- [x] `bridge_terminal_{exec,write,resize,terminate}` 四命令
- [x] outputDelta/process/* 事件映射（依赖 C 期）+ TerminalTab
- [x] 终端多实例 + resize 节流（60ms）
- [x] （二期）Rust 侧实例清单 + 重载重挂 `bridge_terminal_list` ——
      Rust 侧 `AppState.terminals: HashSet<String>`（**运行期状态，不落盘**：
      落盘会在下次启动时列出早就死掉的进程）+ `bridge_terminal_list/
      _track/_untrack`；前端 `terminalReattach.ts` 重载后重建显示条目。
      挂回来的终端**没有输出可补**（输出走事件流，那时已断），所以标成
      「已重连」的空会话——至少用户知道那进程还活着、还能往里打字

验收：终端可交互（含 Ctrl+C）、输出流式不丢行、resize 生效；切换线程
布局各自恢复；关闭最后一个 tab 出现 guide 页；旧 Panels 无残留引用。

### 4.1 实现期间确定的四件事

1. **右栏开关顺带改了 `Ctrl+E` 的语义**。原来它开关的是左栏里的文件树列，
   现在文件树是 dock 的一个 tab，快捷键改成「打开 / 切到文件面板」，
   顶栏那颗按钮同理。两处的 tooltip 文案都由 `shortcuts.ts` 的注册表生成，
   不会再出现「提示写 Ctrl+E、实际按了没反应」。
2. **`EditorDrawer` 的可拖动高度条去掉了**。高度归右栏的拖拽把手管；
   两个拖拽区域上下叠着必然打架（拖右栏把手时高度条也在动）。
3. **摘要（tab 上的小字）给的是组件而不是字符串**。摘要要读各自的 store
   切片，写成 `summary: () => string` 就得在非组件函数里调 hook。
   改成 `badge?: ComponentType` 之后每个 tab 自己订阅自己那一个字段，
   tab 条上七个子组件也不会互相带着重渲染。
4. **布局表放在 store 内部**，不是模块级变量。外部对象改了不通知订阅者，
   切会话时 tab 条就不会跟着变——这个坑踩过一次。

### 4.2 终端两个大坑的落法

- **「等应答再显示输出」是死路**（`command/exec` 的应答推迟到进程退出）。
  `bridge_terminal_exec` 立刻返回 `{processId, status:"pending"}`，把等待
  丢进 `tokio::spawn`；进程退出时由 Rust 侧补发一条 `terminalEvent`
  （`exited: true` + 退出码），界面从事件流知道结果。
- **`processId` 必须前端自带**：协议里凡是要 `write`/`resize`/`terminate`
  的场合都按它关联，服务端在缺省时用的内部 id 不暴露给客户端
  （见 [17 号文件 §5.6](17-后端命令层扩展.md)）。所以命令层对空 id 直接
  报错，而不是替前端编一个。

Ctrl+C 发的是 `\x03`（tty 的行中断字符）而不是 terminate：前者让进程
自己收尾（能留下 atexit 输出），后者是强杀。

### 4.3 未做的（有意）

- **readline**：方向键翻历史、Tab 补全都没有，回车发送整行缓冲区。
  完整的行编辑要么引 xterm.js，要么自己实现一套光标状态机——先把
  「能跑起一个 shell」做扎实，要补的时候 `TerminalInstance.tsx` 是唯一改动点。
- **重载重挂**：Tauri 重载即 WebView 刷新，进程还在但输出流接不回来。
  需要 Rust 侧存活动实例清单，文档已标为二期。
- **PDF / Office 预览**：解析器比整个终端 tab 都大，不引重库。
