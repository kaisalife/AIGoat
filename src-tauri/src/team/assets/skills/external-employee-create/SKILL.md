---
name: external-employee-create
description: 外部员工创建：当用户要求把 GitHub 上的某个开源 agent（Python/Node/Go 等）变成团队成员、做成无头子 agent、或"接入这个 agent 让它能被派活"时使用。用 AIGoat 的适配壳模板把它包成符合 AF 任务单协议的 external 成员，上游本体不重写。
---

# 外部员工创建（external-employee-create）

目标：把某个开源 agent 变成 AIGoat 团队里的一个 **external 员工**——无界面、
一次性进程、任务单进、报告出。做法是**薄适配壳**：一个已写好的 Rust 小程序
收任务单、拉起上游原进程、把结果转成标准报告。上游代码不改、不重写。

## 先判定能不能做（做不了就停下来说明）

| 能做 | 做不了 |
| --- | --- |
| 有 CLI 或库入口，能一次跑完一个任务 | 只有 GUI / 需要人点击 |
| 依赖能用 pip / npm / cargo 正常装 | 必须常驻服务或依赖 GPU 服务端 |
| 结果能落到 stdout 或文件 | 只能流式输出、没有结束信号 |

不确定时先读 README 与 `--help`，把判断理由写给用户。不要硬套模板。

## 第一步：取源码

把上游放到目标工程内的统一位置（别散落在用户项目里）：

```
<目标工程>/.aigoat/agents/<成员名>/vendor/
```

记录安装依赖的命令（pip install -r / npm i / cargo build），后面要写进说明。
许可证是 GPL/AGPL 时提示用户：仅本机内化使用，不随项目分发。

## 第二步：生成骨架

```
"{{AIGOAT_EXE}}" agent-scaffold <目标工程>/.aigoat/agents/<成员名> --name <成员名> --desc "<一句话职责>" --out scaffold-report.json
```

读报告：`created` 是新建的文件，`skipped` 是已存在而保留的（幂等，重跑安全）。
`detected` 里回显了三个被 AIGoat 探测的路径，确认它们与实际落盘一致。

生成的结构：

```
<目录>/
├─ src-tauri/                     # 名字不能改：AIGoat 靠它反推工程根
│  ├─ Cargo.toml
│  └─ src/main.rs                 # 适配壳，不用改
├─ adapter.json                   # 唯一要手改的文件
├─ docs/agent-card.json           # 能力清单：把 capabilities 改成真实能力
└─ .trae/skills/<成员名>-agent/SKILL.md   # 派单细则
```

## 第三步：填 adapter.json

壳的行为全由这份映射决定，**改它不用重编 Rust**：

```json
{ "command": "python",
  "args": ["vendor/main.py", "--prompt", "{prompt}", "--out", "{workspace}/out.json"],
  "input": "arg",
  "output": "file-json",
  "outputPath": "{workspace}/out.json",
  "timeoutSec": 600,
  "cwd": "{workspace}",
  "env": {} }
```

| 字段 | 说明 |
| --- | --- |
| `command` | 上游可执行名或绝对路径 |
| `args` | 参数模板，支持 `{prompt}` `{name}` `{type}` `{workspace}` `{task}` `{params.<key>}` |
| `input` | `arg`（默认，占位符注入）/ `stdin-text`（prompt 灌 stdin） |
| `output` | `stdout-json` / `stdout-text` / `file-json` |
| `outputPath` | `file-json` 必填 |
| `timeoutSec` | 默认 600，0 = 不限 |
| `cwd` | 默认 `{workspace}` |
| `env` | 追加环境变量（API key 放这里，让用户自己填） |

拿不准上游输出时先用 `stdout-text` 保底：壳把纯文本塞进 `data.text`，主 agent
自己归纳。确认上游能稳定输出 JSON 后再升级成 `stdout-json` / `file-json`。

## 第四步：构建

```
cargo build --release --manifest-path <目录>/src-tauri/Cargo.toml
```

产物：`<目录>/src-tauri/target/release/<成员名>.exe`。构建失败先看是不是模板
代码的问题——模板已经能编译，通常是 Cargo 环境（toolchain / 网络）问题。

## 第五步：冒烟（必须做）

手写一份最小任务单，真跑一次：

```json
{ "type": "task", "name": "smoke", "workspace": "<目标工程绝对路径>",
  "prompt": "用一句话说明你能做什么", "params": {} }
```

```
"<目录>/src-tauri/target/release/<成员名>.exe" --agent task.json --out report.json
```

要求：退出码 0、`status == "ok"`、`data` 有实际内容。失败时读 `error.code`
（处置表见 `<目录>/.trae/skills/<成员名>-agent/SKILL.md`）**修正后再跑，
不要原样重试**。

## 第六步：入册

在**当前工作目录**写 spec，然后 apply：

```json
{ "ops": [ { "op": "upsert", "name": "<成员名>", "kind": "external",
  "path": "<目标工程>/.aigoat/agents/<成员名>/src-tauri/target/release/<成员名>.exe",
  "desc": "<何时派：一句话写清职责与触发场景>",
  "team": "<团队名>" } ] }
```

```
"{{AIGOAT_EXE}}" team-apply .aigoat-team-spec.json --out team-report.json
```

- `desc` 是主 agent 判断"何时派"的唯一依据，必须写清场景，不能只写头衔。
- external 成员**立即生效**，派单说明随新会话注入。
- 完成后删掉临时的 spec 与 report，不在用户工程里留垃圾。
- 让用户到 AIGoat 右栏「团队」tab 核对：卡片应显示就绪、能力清单与派单细则。
   若显示"当前不存在"，说明 `path` 指错了，回到第五步确认 exe 真实路径。

## 边界

- 一次只内化一个 agent，不要批量循环装一堆。
- 依赖安装失败 → 报告具体命令与错误尾部，不静默降级、不假装成功。
- 上游需要 API key → 让用户填进 `adapter.json` 的 `env`，不要编造凭据。
- 上游是长驻服务型 → 在判定阶段拒收，不要尝试做进程托管。
- 内化后上游升级：重新 `git pull` vendor 并重跑第五步冒烟即可，壳与注册表都不用动。
