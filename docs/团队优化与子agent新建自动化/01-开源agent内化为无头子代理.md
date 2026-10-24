# 01 · 开源 Agent 内化为无头子代理

## 一、目标与边界

让 codex 通过新默认技能 `external-employee-create`（外部员工创建），把 GitHub 上的开源 agent（Python /
Node / Go 皆可）内化成 AIGoat 团队里的一个 external 员工：无界面、一次性进程、
任务单进、报告出，调用开销只多一次进程启动。

**边界（写进技能，避免承诺做不到的事）**

| 可以做 | 做不到 / 不做 |
| --- | --- |
| 有 CLI 或库入口、能无头跑完一个任务 | 只有 GUI / 需要人在环点击的 |
| 依赖能用 pip / npm / cargo 正常安装 | 需要 GPU 常驻服务、强制联网鉴权且无 token |
| 输出能落到 stdout 或文件 | 只能流式吐字节、没有终止信号的 |

不承诺"任意 GitHub agent 一键内化"：技能第一步就是判定它是否可无头化，不合格
如实报告，不硬套。

## 二、为什么是适配壳，不是重写

用户提法是"转换成 Rust 实现无头模式"。字面重写不成立：上游 agent 多为 Python /
Node，重写等于逐个定制、且永远跟不上上游。

采用**薄适配壳（adapter shell）**：一个 Rust 小程序，注册为 external 员工，收到
任务单后拉起上游原进程，把结果转成标准报告。上游本体原地不动——这正是
`registry/mod.rs` 头注释里 AF 规范的要求。

| 方案 | 工作量 | 通用性 | 上游升级 |
| --- | --- | --- | --- |
| Rust 重写本体 | 每个 agent 一套 | 无 | 手工追 |
| Rust 适配壳 | 一次模板，换 agent 只改 JSON | 有 | 跟着上游走 |

## 三、契约：沿用 AF 任务单协议

与现有 external 成员完全一致，派单说明（`registry/instructions.rs`）无需改动。

```
<exe> --agent <task.json> --out <report.json>     退出码 0 成功 / 1 失败
```

- 任务单：`{ "type", "name", "workspace", "params": { ... }, "prompt"? }`，UTF-8 无 BOM
- 报告：`{ "status": "ok|error", "message", "data", "error": { "code" } }`
- 壳负责：读任务单 → 拉起上游 → 收结果 → 组装报告。退出码只看报告 `status`。

## 四、模板工程结构

`agent-scaffold` 生成的目录，**`src-tauri` 这个名字是硬约束**：`registry/rows.rs`
的 `project_root()` 靠 `src-tauri/target/release/<exe>` 反推工程根，进而探测能力
清单与派单细则。目录名不对，界面就看不到这些文件。

```
<目标目录>/
├─ src-tauri/
│  ├─ Cargo.toml          # name = <成员名>，产物 target/release/<成员名>.exe
│  └─ src/main.rs         # 适配壳，≤ 200 行
├─ adapter.json           # 上游调用映射：唯一需要人/模型手改的文件
├─ docs/agent-card.json   # 能力清单（派单前 codex 读）
└─ .trae/skills/<成员名>-agent/SKILL.md   # 派单细则（错误处置、参数表）
```

最后两处路径必须与 `rows.rs` 第 43-55 行的探测逻辑逐字一致，否则 `team-list`
报告里 `capabilityManifest` / `skillDoc` 为空。

## 五、适配壳设计（src-tauri/src/main.rs）

执行顺序，全部同步阻塞，无异步运行时、不引新 crate 类型（只用 serde / serde_json）：

1. 解析 `--agent <task.json>` `--out <report.json>`，缺参直接写 error 报告并退 1。
2. 读任务单 → 找 `adapter.json`：exe 同级 → 工程根（`target/release` 上三级）→ 当前目录，
   取第一个存在的（壳被挪走也能靠工程根兜住）。
3. 渲染上游命令：`command` + `args` 里占位符替换。
4. `std::process::Command` 拉起，`cwd` 默认 `workspace`，注入 `env`。
5. 超时看护：`try_wait()` + 50ms `sleep` 轮询，超时 `kill()` 并报
   `error.code = "timeout"`（std 没有 `wait_timeout`，不再引入 crate）。
6. 按 `output` 约定取结果：
   - `stdout-json`：解析后整段塞进 `data.upstream`
   - `stdout-text`：塞进 `data.text`，交 codex 自行归纳
   - `file-json`：读 `outputPath` 指定的文件
7. 写报告（原子写复用 `settings::config::write_text` 的等价实现；模板内自带，
   不依赖 AIGoat 内部模块）。
8. 非 0 退出 → `status=error`，`message` 带上游 stderr 尾部 2KB。

### adapter.json 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `command` | 是 | 上游可执行名或绝对路径（`python` / `node` / 已构建 exe） |
| `args` | 是 | 参数模板，支持 `{prompt}` `{name}` `{workspace}` `{task}` `{params.<key>}` |
| `input` | 否 | `arg`（默认，占位符注入）/ `stdin-text`（把 prompt 灌 stdin）/ `file` |
| `output` | 是 | `stdout-json` / `stdout-text` / `file-json` |
| `outputPath` | 条件 | `output=file-json` 时必填，支持同一套占位符 |
| `timeoutSec` | 否 | 默认 600；0 = 不限 |
| `cwd` | 否 | 默认 `{workspace}` |
| `env` | 否 | 追加环境变量表 |

换 agent 只改这个 JSON，Rust 不重编——这是"通用性"的落点。

### 性能

单次派单 = 一次进程创建 + 一次 JSON 读写，壳自身常驻内存可忽略；真正的耗时在上游
agent 冷启动。刻意不做：常驻守护、连接池、HTTP 服务、异步运行时。

## 六、新 CLI 子命令 `agent-scaffold`

```
aigoat agent-scaffold <目标目录> --name <成员名> [--desc <一句话职责>] [--out report.json]
```

- 幂等：已存在的文件不覆盖，只补缺失项；报告里逐条列 `created` / `skipped`。
- `--name` 必须符合注册表名字规则（ASCII 字母数字 / `-` / `_`）。
- 输出仍是 `--out` 落盘（GUI 子系统 exe 的 stdout 不可靠，沿用 `team/cli.rs`
  现有约定），退出码 0/1。

## 七、新默认技能 `external-employee-create`（外部员工创建）

`SKILL.md` 必须写成可执行流程，不是介绍文。七步：

1. **判定**：看上游 README，确认有 CLI/库入口、能离线单次跑完；不合格就停下来说明。
2. **取源码**：克隆/下载到 `<工程>/.aigoat/agents/<名>/vendor/`，装依赖（记录命令）。
3. **生成骨架**：`aigoat agent-scaffold .aigoat/agents/<名> --name <名>`。
4. **填 adapter.json**：把上游真实参数填进 `args`，先用 `stdout-text` 保底。
5. **构建**：`cargo build --release --manifest-path .aigoat/agents/<名>/src-tauri/Cargo.toml`。
6. **冒烟**：手写一份最小任务单跑一次，确认退出码 0 且 `data` 有内容；失败按
   `error.code` 修 `adapter.json` 再跑，**不要原样重试**。
7. **入册**：`aigoat team-apply` 写 `upsert`，`kind=external`，`path` 指向
   `.../target/release/<名>.exe`，`desc` 写清"何时派"。

配套要求（写进技能的边界节）：

- 许可证：GPL/AGPL 只做本机内化，不分发；不确定就提示用户。
- 依赖安装失败 → 报告具体命令与错误尾部，不静默降级。
- 上游要求 API key → 让用户配到 `env`，不替用户编造。
- 一次内化一个 agent；不要批量循环装一堆。

## 八、代码改动清单

| 文件 | 动作 | 要点 |
| --- | --- | --- |
| `src-tauri/src/team/skill.rs` | 改 | 单技能硬编码 → 表驱动 `install_all()`，条目为 `(目录名, include_str! 模板)`；仍保持幂等比对与 ≤200 行 |
| `src-tauri/src/team/assets/skills/external-employee-create/SKILL.md` | 新 | 上面七步流程；`{{AIGOAT_EXE}}` 占位符由安装器替换 |
| `src-tauri/src/team/report.rs` | 新 | 从 `cli.rs` 抽出 `split_out` / `finish` / `error_report` 并加 `option_value`，三个子命令共用（`cli.rs` 借此压回 200 行内） |
| `src-tauri/src/team/scaffold.rs` | 新 | 模板落盘 + 幂等 + 报告；含 `#[cfg(test)]` 幂等与非法名用例 |
| `src-tauri/src/team/assets/template/` | 新 | `src-tauri/Cargo.toml`、`src-tauri/src/main.rs`、`adapter.json`、`agent-card.json`、`agent-skill.md`（派单细则模板，落盘时改名 `SKILL.md`） |
| `src-tauri/src/team/cli.rs` | 改 | `run()` 的 match 加 `agent-scaffold` 分支（约 20 行）；参数解析与落盘复用 `report.rs` |
| `src-tauri/src/team/mod.rs` | 改 | 注册 `pub mod scaffold;`，`install_all()` 替换原 `install()` |
| `src-tauri/src/main.rs` | 改 | 一处调用改名：`skill::install()` → `skill::install_all()`；CLI 分流本身不用动 |

前端零改动：技能与 CLI 都在 codex 侧，界面只看注册表结果（新成员自动出现在
「团队」tab）。

## 九、验证

1. `cd src-tauri; cargo test` —— `scaffold.rs` 的幂等用例（生成 → 再生成 → 只 skipped）。
2. `cargo fmt --check` / `cargo clippy -- -D warnings`。
3. 端到端冒烟：用仓库里一段 10 行 Python 脚本当上游（读 prompt、打印 JSON），
   依次跑 scaffold → 填 adapter → build → 手写任务单调用，确认报告结构正确。
4. `powershell -File tools\verify.ps1` 十道关。
5. `cargo build --release` 后跑 `aigoat team-list --out`，确认新成员 `exeExists=true`、
   `capabilityManifest` / `skillDoc` 非空。

## 十、风险与取舍

| 风险 | 处置 |
| --- | --- |
| 上游输出无结构，映射不了 | 允许 `stdout-text` 直传，codex 自己归纳；技能里明确这是降级路径 |
| 上游是长驻服务型 agent | 判定阶段拒收，不做进程托管（与"性能最小化"冲突） |
| 模板工程名与探测路径不一致 | 生成时强制 `src-tauri`，并在报告里回显两个被探测路径 |
| 每个 agent 都带一份 vendor 源码，磁盘膨胀 | 技能要求放 `<工程>/.aigoat/agents/`，一处集中，便于清理 |
| 超时 kill 不彻底（子进程树） | Windows 下 `taskkill /T` 由技能在失败处置里提示；壳只保证自身退出 |
