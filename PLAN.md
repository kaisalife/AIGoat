# 前端全面适配 codex-cli-rs 能力 —— 实施计划

> **前提（已确认）**：`codex-rs` / Codex CLI **一行不改**，能力以 `codex app-server generate-ts`
> 输出为准。协议基线钉在 `proto/manifest.json`，纳入范围钉在 `proto/scope.json`。
> 本计划只做**消费侧**适配。

## 0. 已定取舍（2026-10-01 拍板）

| 取舍 | 排除内容 | 排除项数 |
|---|---|---:|
| **账号体系**整体不对接（含订阅） | `account/*` 全 9 项（`read` / `login/start` / `login/cancel` / `logout` / `rateLimits/read` / `rateLimitResetCredit/consume` / `sendAddCreditsNudgeEmail` / `usage/read` / `workspaceMessages/read`）、`account/chatgptAuthTokens/refresh`、通知 `account/{login/completed,updated,rateLimits/updated}` | 9 client + 1 请求 + 3 通知 |
| 实时语音**不需要** | 通知 `thread/realtime/*`（started/closed/error/sdp/item*/transcript*/outputAudio） | 11 通知 |
| 应用市场**不需要** | `app/*`、`marketplace/*`、`plugin/{install,installed,list,read,reconcile,uninstall,share/*}`、通知 `app/list/updated` | 14 client + 1 通知 |
| **远程控制**不需要 | 通知 `remoteControl/status/changed` | 1 通知 |
| **外部 agent 配置迁移**不需要 | `externalAgentConfig/{detect,import,import/readHistories,import/recordHistory}` + 2 个导入进度通知 | 4 client + 2 通知 |
| **反馈上报**不需要 | `feedback/upload`——往厂商云上传数据，既非 agent 能力也不本地 | 1 client |

**合计排除 50 项**（31 client + 1 server 请求 + 18 通知 + 0 Item），
纳入范围 **155 项**。

> 后三项是按「与实际 agent 能力相关、优化体验、不需要连接其云端」这一标准
> 追加剔除的，与前两项同类。`feedback/upload` 由我归入并已标注理由。

两处判断说明，如有异议一句话就能改：

1. **把 plugin/marketplace 一并算作"应用市场"。** codex 里 `app/*`（Apps）和
   `plugin/* + marketplace/*`（插件生态）是两套；我按"生态面整体不做"处理。
   若只想砍 `app/*`、`plugin/skill/read` 保留（它服务于技能读取），分母变 164。
2. **`modelProvider/authRecovery{Started,Completed}` 保留。** 它是自定义 provider 的
   API key 失效恢复，与账号体系无关；纯自主 provider 场景下这条恰好有用。

### 移除 `account/read` 的连带影响（如实说明）

`account/read` 原是免登录的**运行期自检**入口。移除后：

- **免登录保证不受影响**，它从来不是靠这个探测实现的，而是三重构造性约束：
  1. 配置强制 `requires_openai_auth = false`（`config.rs` 显式写出，非依赖默认）
  2. `LaunchOptions::launch` 启动子进程时 `env_remove` 掉
     `OPENAI_API_KEY` / `CODEX_API_KEY` / `CODEX_ACCESS_TOKEN`
  3. 凭证只从 provider 的 `env_key` 读取
- **失去的是"事后发现凭证泄漏"的能力**。桥接层里的 `account_read` /
  `Session::auth_status` 保留为**可选诊断**（集成测试仍覆盖它以证明上述约束生效），
  但**不属于前端契约**，前端不调用、不展示。

## 1. 真实覆盖率（按取舍后重算）

| 协议面 | 权威 | 排除 | **纳入范围** | 已建模 | 现状 |
|---|---:|---:|---:|---:|---:|
| client → server 方法 | 99 | 31 | **68** | 68 | **100%** |
| server → client 请求 | 8 | 1 | **7** | 7 | **100%** |
| 通知 | 79 | 18 | **61** | 61 | **100%** |
| ThreadItem 类型 | 19 | 0 | **19** | 19 | **100%** |
| **合计** | 205 | 50 | **155** | 155 | **100%** |

（P0–P4 完成后的实测值，可用 `python tools/scope_report.py` 复算。
协议基线由 `proto/manifest.json` 钉住，`tools/gen_protocol_manifest.py --check`
在上游版本变化时退出码 1，可挂 CI。）

重算脚本：`python tools/scope_report.py`（会重新生成 `proto/scope.json`）。

## 2. 分期与出口覆盖

| 期 | 范围 | 出口覆盖 | 状态 |
|---|---|---:|---|
| **P0** | `item/tool/call`、`attestation/generate` 两个 server→client 请求 | 20% | ✅ 已完成 |
| **P1** | 线程生命周期 25 方法 + 回合细节 22 通知 + 4 Item | 52% | ✅ 已完成 |
| **P2** | 文件系统 9 + 终端 4 + 技能 4 方法，9 通知，3 Item | 69% | ✅ 已完成 |
| **P3** | 复核/权限/沙箱 4 方法，10 通知，3 Item（收口方案阶段六） | 80% | ✅ 已完成 |
| **P4** | MCP 5 + 配置 6 + 模型 2 + 钩子 1 方法，10 通知 | **100%** | ✅ 已完成 |

**P0–P4 全部完成：纳入范围 155 项，已建模 155 项 = 100%**
（`python tools/scope_report.py` 可复算。）

### 已完成：P0

**修掉的 bug**：`item/tool/call` 曾被归为 `ApprovalKind::Other`，在 `Auto` 模式下
回 `{"decision":"accept"}`。Agent 会认为工具已成功执行，并基于**虚构结果**继续推理。

现在的语义分流（`events/approvals.rs` 的 `RequestKind`）：

| 类别 | 方法 | 应答 |
|---|---|---|
| 审批 | 5 个审批方法 + 2 个 legacy 方法名 | 按策略 accept/decline/manual |
| 客户端工具 | `item/tool/call` | 走 `ToolRegistry` **真正执行**，回 `{contentItems, success}` |
| 宿主能力 | `attestation/generate` | 明确回 `-32601`，绝不假装成功 |

关键约束：**没有执行器就回 `success: false`，绝不回 accept**。执行器 panic 会被
`tokio::spawn` 隔离成 `JoinError` 并降级为失败，而不是拖垮 app-server 连接。

### 已完成：P1

**client 方法 25 项**全部建模并接入 `CodexClient`：

- 生命周期：`thread/read`、`delete`、`unarchive`、`loaded/list`、`unsubscribe`、
  `name/set`、`metadata/update`、`compact/start`、`revert`、`inject_items`、`shellCommand`
- 翻页：`thread/items/list`、`thread/turns/list`
- 附件：`thread/attachment/{add,list,remove}`
- 目标：`thread/goal/{get,set,clear}`、`thread/approveGuardianDeniedAction`
- 分区：`threadSection/{create,delete,list,update}`、`thread/section/move`

**通知 22 项**映射为 `AgentEvent::ThreadEvent`（17 种线程事件）+ 计划 / diff /
`serverRequest/resolved` / 推理分段。
**Item 4 种**：`plan`、`contextCompaction`、`enteredReviewMode`、`exitedReviewMode`。

两个语义要点写进了代码注释：

- `thread/revert` **只回退对话历史，不回退本地文件改动**；会话层会先中断正在跑的
  回合，否则回合会基于已被替换的历史继续。
- `thread/shellCommand` **保留 shell 语法且不受线程沙箱策略约束**，与
  `command/exec`（用户终端）不是一回事。暴露给模型前宿主需自行确认这一取舍。

`ContextCompacted` 事件在注释里明确标注：**前端必须告知用户**，更早的历史已被摘要。

### 已完成：P2

**client 方法 17 项**：

- 文件系统 9 项：`fs/{readFile,writeFile,readDirectory,createDirectory,remove,copy,getMetadata,watch,unwatch}`
- 用户终端 4 项：`command/exec`、`exec/write`、`exec/resize`、`exec/terminate`
- 技能 4 项：`skills/{list,config/write,extraRoots/set}`、`plugin/skill/read`

**通知 9 项**映射为 `AgentEvent::HostEvent`；**Item 3 种**：`hookPrompt`、`sleep`、
`functionCallOutput`。

三个容易踩的坑写进了代码注释：

- `command/exec` **没有退出通知**。响应推迟到进程退出才返回，且排在所有
  `command/exec/outputDelta` 之后。写「等退出事件」的代码会永远等不到。
- `command/exec` 与回合内的 `commandExecution` item 是**两套东西**：前者是宿主
  终端、不受回合沙箱约束。
- `fs/changed` **不携带变更种类**，只有 `watchId` + `changedPaths`。要区分
  created/modified/deleted 需再调 `fs/getMetadata`，不要凭路径猜。

**额外交付：内置 `fs` 工具执行器**（`tools/fs_executor.rs`）。M1 只建立了派发
机制，没有执行器时模型调 `fs/readFile` 只会拿到「no client tool executor
registered」。接上之后闭环成立：模型 → codex 回调客户端 → 客户端调 `fs/*` →
结果回灌模型。

带**根目录白名单**（`RootScope`）：codex 侧的沙箱管的是回合内命令，管不到
客户端进程，所以这个边界必须宿主自己划。越界路径返回明确失败并告知模型该换
哪个目录，而不是静默放行。另有单文件读入上限（默认 256 KB），超限截断并
明确标注，避免把整份文件塞进上下文。

### 已完成：P3

**client 方法 4 项**：`review/start`、`permissionProfile/list`、
`windowsSandbox/readiness`、`windowsSandbox/setupStart`。
**通知 10 项**映射为 `AgentEvent::GuardEvent`；**Item 3 种**：`subAgentActivity`、
`imageGeneration`、`imageView`。

**ThreadItem 类型至此 19/19 = 100% 覆盖。**

方案阶段六的三件事都有了入口：

- **审查 diff**：`review_*` 系列（未提交改动 / 基线分支 / 单个提交 / 自定义指令）。
  返回的 `reviewThreadId` 告诉你复核跑在哪个线程。
- **沙箱冲突可见化**：`windowsSandbox/readiness`。三种状态
  `ready | notConfigured | updateRequired` 语义完全不同——
  `updateRequired`（装了但版本过期）表现和没装很像但修法完全不一样，
  因此代码注释明确要求**不能合并成同一个「不可用」**。
- **多 Agent**：`subAgentActivity` 带 `agent_thread_id` 与 `agent_path`，
  前端拿 threadId 去订阅对应 thread 即可看到子 Agent 的全部事件——
  协作不需要额外后端能力。

权限档位的 `allowed == false` 标注了**应当置灰而不是隐藏**：隐藏会让用户
以为功能不存在，置灰才能解释「为什么不让我选」。

另外，协议把 guardian 那组（`review` / `action`）全部标为 **[UNSTABLE]**，
因此按不透明 `Value` 承接而不是硬编码字段——上游改形状时我们只是少展示几个
字段，不会解码失败。

### 已完成：P4

**client 方法 14 项**：

- MCP 5 项：`mcpServerStatus/list`、`mcpServer/{tool/call,resource/read,oauth/login}`、`config/mcpServer/reload`
- 配置 5 项：`config/{read,value/write,batchWrite}`、`configRequirements/read`、`config/mcpServer/reload`
- 实验特性 2 项：`experimentalFeature/{list,enablement/set}`
- 模型 2 项：`model/list`、`modelProvider/capabilities/read`
- 钩子 1 项：`hooks/list`

**通知 10 项**映射为 `AgentEvent::Host4Event`：MCP 启动状态 / OAuth 完成 /
事件流、钩子运行、上游原始响应、回合审核元数据、模糊文件搜索。

两个直接影响 UI 正确性的语义写进了注释：

- **`WriteStatus::okOverridden` 不是成功。** 它表示值写下去了但被更高优先级
  层（系统 / MDM / 企业策略）覆盖，**当前并不生效**。配合 `origins`
  （每个键最终来自哪一层），设置面板才能解释「为什么我改的值没生效」。
- **`supported_reasoning_efforts` 应当作为推理档位的唯一来源。** 写死一份
  白名单会在模型目录更新后失效——这是模型选择器从硬编码改为读服务端后
  最容易漏掉的一环。

另：`config/batchWrite` 的 `reloadUserConfig` **不会热重载会话静态设置**
（模型、推理强度、service tier），这一点也在注释里标了。

---

## 收尾：运行时验证与两道防线

P0–P4 全程只验证了编译。补上运行时验证后**抓到一个编译永远发现不了的 bug**，
因此新增两道防线：

### 防线一：`examples/probe.rs` —— 对真实 codex 的只读探针

逐项调用 P1–P4 新增的读取类方法（不写配置、不改状态）。首次运行 **13/14 通过**，
失败的是 `model/list`：

```
✖ model/list  app-server returned an error: failed to decode `model/list` response: missing field `effort`
```

真相：`ReasoningEffortOption` 的字段是 `reasoningEffort`，不是我抄的 `effort`。
**类型合法、编译通过、只有运行时解码才炸。**

修复后 **14/14 通过**（`model/list` 返回 7 个模型，默认 `gpt-6-astra`）。

### 防线二：`tools/check_wire_parity.py` —— 线格式字段级 parity

逐字段双向比对 Rust 结构体与 TS 声明：

- **多余字段**（Rust 有、协议没有）→ 判为失败。这类一定是抄错或改名漏了
- **未建模字段**（协议有、Rust 没有）→ 仅提示。多数是可选字段，serde 默认忽略

它抓到 3 处真问题，其中一处比上面那个更阴险：

| 问题 | 后果 |
|---|---|
| `ReasoningEffortOption.effort` 应为 `reasoningEffort` | 运行时解码失败 |
| `McpServerToolCall{Params,Response}.meta` 线上叫 `_meta` | **调用成功但功能静默失效** |
| `HookMetadata` 多套了一层 `handler` 对象 | 变体字段读不到 |

`_meta` 那个最危险：类型合法、编译通过、调用返回成功，只是服务端读不到
我们发的字段。这类 bug 没有任何常规手段能发现。

检查器自身带自检（对几个已知形状的类型断言抽取结果，不符就拒绝给出结论）。
开发过程中它自己就错过两次：单行声明只匹配到首个字段、局部变量遮蔽了类型名。

### 一键校验

```powershell
.\tools\verify.ps1 -Codex <codex.exe>
```

依次跑：编译 → clippy → fmt → 协议漂移 → 线格式 parity → 运行时探针。
任一失败非零退出，可直接挂 CI。

### 顺带发现

**真实 codex 在免登录会话下仍会发 `account/rateLimits/updated`。**
账号体系在范围外，它正确落进 `Unhandled` 透传——这正是宽容解析设计的价值：
上游发什么我们没建模的，都不会打断事件流。

**顺序是硬约束**：P1 必须先于 P2/P3。`AgentEvent` 契约在 P1 定型，P2/P3 只往里加变体；
反过来做会反复重排事件结构。

---

### P0　先修一个会静默产出错误结果的 bug（1 天，阻塞一切）

**`item/tool/call` 不是审批。** 它是服务端要求客户端**真正执行一个工具**
（`DynamicToolCallParams` → `DynamicToolCallResponse`，含 `status` / `contentItems`）。

现状路径（已逐行核实）：`events.rs` 未匹配该方法 → 落入 `ApprovalKind::Other` →
`session.rs::approval_response` 走 `_ =>` 分支 → 回 `{"decision":"accept"}`。

后果：Agent 认为工具已成功执行，并基于**虚构结果**继续推理。静默错误，比崩溃难发现。

交付：
- `ApprovalKind` 拆出独立 `DynamicToolCall`，与审批彻底分流
- 新增 `ToolExecutor` trait + `Session::dispatch_tool_call`，把执行权交给前端
- **拿不到执行器时回 `declined`，绝不回 accept**
- `Auto` 策略只作用于真正的审批类（command / fileChange / permissions / userInput / elicitation）
- `attestation/generate` 同样不是审批：归入"宿主能力请求"，无实现时明确回错误而非 accept

验收：`cargo test --workspace` 全绿；新增"无执行器 / 有执行器"两条用例，且断言回合能正常收尾。

---

### P1　线程 + 回合完整（1–2 周）→ 52%

**client 方法 25**：`thread/{read,delete,unarchive,loaded/list,compact/start,revert,
name/set,metadata/update,items/list,turns/list,inject_items,unsubscribe,shellCommand,
approveGuardianDeniedAction}`、`thread/attachment/{add,list,remove}`、
`thread/goal/{get,set,clear}`、`threadSection/{create,delete,list,update}`、`thread/section/move`

**通知 22**：`thread/{started,closed,deleted,archived,unarchived,reverted,name/updated,
status/changed,queue/changed,settings/updated,compacted,project/updated,attachment/updated,
environment/connected,environment/disconnected}`、`thread/goal/{updated,cleared}`、
`turn/plan/updated`、`turn/diff/updated`、`item/plan/delta`、
`item/reasoning/summaryPartAdded`、`serverRequest/resolved`

**Item 4**：`plan`、`contextCompaction`、`enteredReviewMode`、`exitedReviewMode`

前端可交付：会话归档区 / 删除 / 重命名 / **上下文压缩的显式提示**（用户必须知道历史被压了）/
分区（section）组织、回合内 diff 流、计划面板、复核模式切换指示。

---

### P2　宿主能力代管：文件 / 终端 / 技能（2 周）→ 70%

**client 17**：`fs/{readFile,writeFile,readDirectory,createDirectory,copy,remove,getMetadata,
watch,unwatch}`、`command/exec`、`command/exec/{write,resize,terminate}`、
`skills/{list,config/write,extraRoots/set}`、`plugin/skill/read`

**通知 9**：`fs/changed`、`project/changed`、`skills/changed`、
`command/exec/outputDelta`、`process/{outputDelta,exited}`、
`item/{commandExecution/terminalInteraction,fileChange/outputDelta,mcpToolCall/progress}`

**Item 3**：`hookPrompt`、`sleep`、`functionCallOutput`

两点务必分清：
- `command/exec/*` 是**用户终端**，`commandExecution` item 是 **Agent 沙箱内命令**，两套不要混用。
- `fs/*` 应成为编辑器/文件树/资源浏览器的**唯一**文件通道，不要各处再写一套。
  `fs/changed` 驱动编辑器重载，比方案 4.4.1 里"依赖各模块自己的文件监听器"可靠。

---

### P3　多 Agent / 复核 / 沙箱（1–2 周）→ 80%

**client 4**：`review/start`、`permissionProfile/list`、
`windowsSandbox/{readiness,setupStart}`

**通知 10**：`autoApprovalReview/strictReviewRequired`、
`item/autoApprovalReview/{started,completed}`、
`windowsSandbox/setupCompleted`、`windows/worldWritableWarning`、
`model/{rerouted,verification,safetyBuffering/updated}`、
`modelProvider/authRecovery{Started,Completed}`

**Item 3**：`subAgentActivity`、`imageGeneration`、`imageView`

这一期把方案阶段六从"待验证"变成"已适配"：

- **多 Agent Pools**：靠多 thread 并发 + `collabAgentToolCall` / `subAgentActivity`，
  **不需要改后端**。每 Agent 一个 `Session`、独立事件通道、独立审批策略，汇总成协作看板。
  桥接层已验证多 `Session` 无共享状态（有测试）。
- **复核**：`review/start` + diff 审查视图 + 通过/驳回，驳回理由回灌 Agent。
- **沙箱可视化**：把 `windowsSandbox/readiness` 结果显式呈现。这直接服务方案的风险项
  「沙箱冲突」——用户不用猜为什么命令被拦。`modelProvider/authRecovery*` 在此呈现
  **"自定义 provider 的 API key 失效，请重新配置"**——注意这是 provider 鉴权，
  不是账号体系，所以仍在范围内（见 §0）。

---

### P4　长尾（→ 100%）

| 能力 | client | 通知 |
|---|---:|---:|
| MCP 管理 | 5（`mcpServer/{oauth/login,resource/read,tool/call}`、`mcpServerStatus/list`、`config/mcpServer/reload`） | 3 |
| 配置读写 | 6（`config/{read,value/write,batchWrite}`、`configRequirements/read`、`experimentalFeature/{list,enablement/set}`） | — |
| 模型 | 2（`model/list`、`modelProvider/capabilities/read`） | — |
| 钩子 / 反馈 | 2（`hooks/list`、`feedback/upload`） | 2 |
| 外部 agent 迁移 | 4（`externalAgentConfig/*`） | 2 |
| 模糊文件搜索 | — | 2（`fuzzyFileSearch/session*`）→ 配 `item/mention` |
| 调试通道 | — | 3（`rawResponse/completed`、`rawResponseItem/completed`、`turn/moderationMetadata`） |
| 远程控制 | — | 1（`remoteControl/status/changed`） |

其中 `config/*` 价值不低：设置面板可视化比让用户手改 `config.toml` 可靠。

---

## 3. 每期统一出口条件

```
cargo test --workspace                                # 全绿
cargo clippy --workspace --all-targets -- -D warnings  # 干净
cargo fmt --all --check                                # 干净
python tools/gen_protocol_manifest.py --codex <codex.exe> --check   # 退出码 0，无漂移
cargo run --example chat -- --json                    # 能演示该期新增能力
```

## 4. 现有环境基线（已实测，非推断）

用 `codex-cli 0.156.1` + 自定义 provider `spark-x2.5-4b`（免登录）实跑通过：
握手、`thread/start` 回显自定义 provider、纯文本回合 149 事件、
prompt cache 命中 10240/10287、**完整 Agent 循环**（模型调 shell →
审批事件到达并被自动应答 → 命令执行 → 结果回灌 → 最终作答）、`willRetry` 瞬时错误自愈。

另外 `account/read` 返回 `requiresOpenaiAuth=false` 已实测确认；但按 §0 的取舍，
它只是**可选诊断**，不属于前端契约。

未实测：Windows 沙箱越权拦截行为、WorkZ worktree 与 Codex 沙箱的冲突（方案阶段六实测项，
参数已就位，P3 会覆盖可观测部分）。