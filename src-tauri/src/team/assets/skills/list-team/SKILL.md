---
name: list-team
description: 查看有哪些团队、团队怎么编制和规定的：当用户问"现在有哪些团队 / 关卡组里有谁 / 那个团队的流程是什么"时使用。只读。
---

# 查看团队（list-team）

## 读取

```
"{{AIGOAT_EXE}}" team-list --out team-report.json
```

无窗口 GUI 程序：输出一律 `--out` 落盘后读文件；读完删掉临时 report。

## 读什么

`data.teams` 是全部团队：

| 字段 | 含义 |
| --- | --- |
| `name` | 团队名 |
| `workflow` | 流程 / SOP（阶段与交接物） |
| `spec` | 团队规范（全体成员共同遵守的硬约束） |
| `roster` | 花名册：从人员池挑进来的**原初成员名** |
| `members` | 团队里的成员（含副本，形如 `关卡组/sage`） |

配合 `data.rows` 可以回答"这个团队每个人的职责是什么"——按 `team` 字段归组，
再读每条的 `desc`。

## 怎么回答

- "有哪些团队" → 列出 `name` + 一句话（workflow 首行或 spec）。
- "关卡组里有谁" → `roster`（挑了谁）+ `members`（实际副本）+ 各自 `desc`。
- "这个团队怎么协作" → 原样引用 `workflow` 与 `spec`。
- 副本 `derivedStale: true` → 主动提醒"原初成员改过，建议刷新"，并问是否要 `update-team`。

## 边界

- 只读：不要顺手改。要改转 `update-team`；要解散转 `delete-team`。
- 查人不查团队用 `list-per`。
