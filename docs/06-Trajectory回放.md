# 06 · Trajectory 事件回放

> 抄 dsh：`packages/client/ui-trajectory/src/client/`（TrajectoryView/TrajectoryTable/TrajectoryTimeline/TrajectoryCell）｜协议：`thread/items/list`＋`thread/turns/list`＋实时事件流｜决策：**抄**（本计划最重的板块，dsh 的招牌功能）

## 1. dsh 的设计

- **append-only 事件账本**：模型看到的一切（系统提示、推理、工具调用与结果、
  子代理调度、每次上下文注入）都是账本记录，按来源（source）可区分。
- **轮次感知**：账本按回合分节。
- **固定时序总览（Timeline）**：真实时长投影的甘特条；拖选区间→表格只显示该
  时间窗内活跃的记录；滚轮缩放时间域、右键平移；流式时跟随尾部，上滚暂停跟随。
- **记录检查器（Inspector）**：点行展开 token 数/时延/输入输出/附件明细。
- **虚拟行**：长账本虚拟滚动。

## 2. codex 协议支持

| 需求 | 协议 | 状态 |
|---|---|---|
| 实时事件 | 现有 `agent-event` 流（map.rs 输出） | ✅ 已有 |
| 历史翻页 | `thread/items/list`、`thread/turns/list`（未接，17 期） | ✅ 需接 |
| token/时延 | `thread/tokenUsage/updated`＋item 事件自带时间戳 | ✅ |
| 原始上游响应 | `rawResponse/completed`、`rawResponseItem/completed`（未映射，C 期） | ✅ 需接 |
| 审核元数据 | `turn/moderationMetadata`（未映射） | ✅ 需接 |

设计取舍：**账本数据源 = AgentEvent 原始流**（ingest 前的原始事件，含
`Unhandled`），而不是 reducer 加工后的 TurnState——Trajectory 与 Chat 是
同一事件流的两个独立投影（dsh 同款架构：双注册表）。

## 3. AIGoat 改造设计

### 3.1 事件账本（核心新基建）

```
store/
├── ledger.ts              EventLedger：ring buffer + 按 threadId 隔离（≤200）
│                          push(event) / window(threadId) / subscribe()
├── ledger/
│   ├── LedgerRow.ts 类型：id/threadId/turnId/时间戳/kind/payload/token/时延
│   └── projections.ts     useProjection：turnOutline/sessionStats（≤160）
```

- `bridge/tauri.ts` 的 subscribe 处 **先 push 账本再 ingest reducer**（一源双投）。
- ring buffer 上限 5000 条/线程（超出丢最老，翻页可从 `thread/items/list`
  回补——历史行的形态是 Item 而非事件，账本行加 `origin: 'live'|'history'`）。
- Chat↔Trajectory 切换（01 的 MainView）不丢账本；切换到历史线程时按需拉
  `thread/items/list` 补历史段。

### 3.2 Trajectory 视图

```
components/trajectory/
├── TrajectoryView.tsx     账本表格 + 顶部 Timeline（≤180）
├── TrajectoryTable.tsx    虚拟行表格（行=LedgerRow）（≤200）
├── TrajectoryRow.tsx      单行：时间/kind/摘要/来源徽章（≤160）
├── TrajectoryInspector.tsx 行展开检查器：payload JSON 树 + token/时延（≤180）
├── TrajectoryTimeline.tsx 时序总览甘特条（≤200）
├── useTimeWindow.ts       拖选/缩放/平移的时间窗状态（≤160）
└── *.module.css
```

- **表格先行，甘特简化**：一期 Timeline 只做「回合块条 + 拖选时间窗过滤」，
  滚轮缩放/右键平移二期再上——先保证账本价值落地。
- **来源徽章**：`model | tool | host | unhandled` 四色 StateDot（EventLedger
  的 kind 归并），对应 dsh "按来源检查"。
- **虚拟滚动**：行高固定 32px，`content-visibility` 或手写窗口化
  （不引虚拟列表库，与零依赖策略一致）。

### 3.3 与 04 的衔接

- detailLevel=3（原始事件档）就是 Chat 内嵌的账本窗口——复用 TrajectoryRow。
- `rawResponse*` 两通知映射后进账本 `host` 来源，Inspector 可看上游原始
  JSON（调试自定义 provider 时极有用——这是 AIGoat 场景下的高频需求）。

## 4. 实施清单

- [x] EventLedger（ring buffer + 一源双投接线）
- [x] `bridge_thread_items` / `bridge_thread_turns` 两条命令
- [x] TrajectoryTable/Row + 虚拟滚动（手写窗口化，行高 32px）
- [x] 来源徽章 + Unhandled 透传入账本（四色 StateDot + 来源筛选）
- [x] TrajectoryTimeline 一期（回合块 + 拖选过滤）
- [x] 历史线程 `thread/items/list` 回补（一页 200 条，点一次拉一页）
- [x] rawResponse*/moderationMetadata 进账本（C 期已映射为 `debugEvent`，本期直接消费）
- [x] Timeline 二期（滚轮缩放 / 右键平移 / 跟随尾部）—— useView + TrajectoryTimeline：滚轮**以光标位置为锚**缩放（放大时指针下那一刻不动）、右键拖拽平移、跟随尾部（用户一拖即停）。**视口与筛选窗分成两层**：合并的话滚轮会冲掉用户的筛选条件，那比没有缩放更糟

验收：5000+ 事件回放不卡；切 Chat↔Trajectory 状态互不干扰；
Unhandled 事件可在账本查到。

### 4.1 实现期确定的五件事

1. **账本吃原始事件，不吃 reducer 产物**（06 §2 的核心决策，代码里也写死了）。
   消息流是投影——归组、折叠、丢弃；如果拿它当账本，未识别事件的细节会在
   reducer 里被压成一行灰字，而且用户切一次视图档位账本就跟着变。
   账本必须是「发生过什么」的忠实记录。
2. **一源双投的顺序：先账本后 reducer**。`slices/connection.ts` 的
   `subscribe` 里就是这个顺序——reducer 万一抛异常，账本仍然完整，
   而账本正是排查问题的第一手材料。
   刻意**没有**再 subscribe 一次：一个 Tauri listener 发两遍事件，
   看起来省事，实际会让「这条事件是谁消费的」变得难以追踪。
3. **时长不单独存，靠相邻行的到达时间差推算**。协议事件不带时间戳
   （只有历史 item 有），单独存 duration 要维护一套状态机，
   而回补历史时那些行根本没有「到达时刻」这回事。
   历史行标 `origin: 'history'`，时序总览会跳过它们。
4. **虚拟滚动手写，不引虚拟列表库**。与零 UI 依赖策略一致，而且需求很窄：
   固定行高 + 只滚不改顺序，二十行就够；通用库反而带来一堆用不上的配置。
   代价是**行高必须恒定**，所以摘要一律单行截断。
5. **回补历史一次只拉一页**（200 条）。用户点这个按钮通常是
   「刚才那轮我漏看了」，一口气翻到底会把界面卡住。要更多就再点一次。

### 4.2 未做的

- **Timeline 的缩放/平移/跟随尾部**：docs/06 §3.2 明确「表格先行，甘特简化」。
  这三项各自要在甘特条上抢指针语义，等表格的过滤能力被验证有用再说。
- **右侧常驻的记录检查器**：一期把 payload 的 JSON 预览做成**行内展开**
  （`TrajectoryTable` 里）。常驻侧栏的好处是能一直对着表格看，
  但它会占掉右栏 dock 的位置——等真有人需要边滚边看时再加。
- **按 turnId 过滤**：`thread/items/list` 支持 `turnId` 参数，命令已经透传，
  但界面这一期没给入口（时序总览的回合块只能拖选时间窗，不能点某个块）。
  两个入口指向同一件事，先做一个。
