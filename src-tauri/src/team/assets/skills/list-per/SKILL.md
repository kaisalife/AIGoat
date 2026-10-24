---
name: list-per
description: 查看有哪些人、某人的配置是什么：当用户问"现在有哪些人 / 谁负责什么 / reviewer 配了哪些技能"时使用。只读，不改任何东西。
---

# 查看人员（list-per）

## 读取

```
"{{AIGOAT_EXE}}" team-list --out team-report.json
```

无窗口 GUI 程序：输出一律 `--out` 落盘后读文件；读完删掉临时 report。

## 读什么

`data.rows` 是全部成员，每条字段：

| 字段 | 含义 |
| --- | --- |
| `name` | 名字（`团队/成员` 形式的是副本） |
| `team` | 所属团队；空 = 在人员池 |
| `derivedFrom` | 副本来源的原初成员；空 = 原初成员 |
| `derivedStale` | 副本过期（原初改过，建议重跑 update-team） |
| `kind` / `path` | codex 原生 / 外部进程（含 exe 路径） |
| `desc` | 职责——回答"谁能干什么"就看它 |
| `model` / `skills` / `mcpServers` / `prompt` | 能力面 |
| `exeExists` | external 成员的 exe 是否真的在 |

## 怎么回答

- "现在有哪些人" → 按 `description` 归类列出：人员池里的人 + 各团队的副本。
- "reviewer 配了什么" → 报 `desc`、`kind`、`model`、`skills`、`mcpServers`。
- "谁负责评审" → 在 `desc` 里搜职责关键词，别只看名字。
- 发现 `derivedStale: true` → 主动提醒："原初成员改过，副本已过期，要我刷新吗"。

## 边界

- 只读：不要顺手改东西。用户明确要改时，转 `update-per` / `update-team`。
- `team-list` 也返回团队（`data.teams`），查团队用 `list-team` 的口径。
