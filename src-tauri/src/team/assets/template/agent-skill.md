---
name: {{NAME}}-agent
description: {{NAME}} 的派单细则：任务单参数、上游调用映射、错误码处置。
---

# {{NAME}} 派单细则

{{DESC}}

本成员由**薄适配壳**提供：壳（Rust，已编译成 exe）收任务单，按 `adapter.json`
拉起上游开源 agent，把结果转成标准报告。上游本体没有被重写。

## 调用

```
"<exe 绝对路径>" --agent <task.json> --out <report.json>
```

退出码 0 = 成功，1 = 失败。**以报告 `status` 为准**，不要只看退出码。

## 任务单

```json
{ "type": "task", "name": "产物名", "workspace": "目标工程绝对路径",
  "prompt": "自然语言需求", "params": { } }
```

| 字段 | 说明 |
| --- | --- |
| `type` | 能力类型，见 `docs/agent-card.json` |
| `name` | 产物命名（稳定 id 由报告回传） |
| `workspace` | 目标工程根；上游的 cwd 默认就是它 |
| `prompt` | 自然语言需求，会按 `adapter.json` 注入上游 |
| `params` | 结构化参数，可被 `{params.<key>}` 引用 |

## 报告

```json
{ "status": "ok|error", "message": "...", "data": { }, "error": { "code": "..." } }
```

`data` 三种形状，取决于 `adapter.json` 的 `output`：

- `stdout-json` / `file-json` → `data.upstream` 是上游原始 JSON；`file-json` 另有 `upstreamPath`
- `stdout-text`（降级路径）→ `data.text` 是上游纯文本，由你自行归纳

## 错误码处置

| code | 含义 | 怎么办 |
| --- | --- | --- |
| `usage` | 缺 `--agent` | 检查调用命令 |
| `task-read` | 任务单读不了 / JSON 坏 | 修任务单（UTF-8 无 BOM） |
| `adapter-read` | `adapter.json` 缺失或写错 | 到工程根修映射，再重派 |
| `spawn` | 上游启动失败 | 确认依赖已装、`command` 可用 |
| `timeout` | 超时被终止 | 缩小任务或调大 `timeoutSec`，**不要原样重试** |
| `upstream-failed` | 上游非 0 退出 | 读 `message` 尾部日志，修参数 |
| `output-parse` | 上游输出不是约定的 JSON | 改 `output` 约定或修上游输出 |
| `output-read` | 找不到上游产物文件 | 检查 `outputPath` 与上游实际写盘位置 |

## 边界

- 一次只做一件事；需要多阶段就多次派单，用落盘产物衔接。
- 上游失败时如实报告，不要编造产物。
