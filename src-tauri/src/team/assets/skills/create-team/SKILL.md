---
name: create-team
description: 组建团队：当用户说"用现有人组一个团队 / 挑几个人进 XX 组 / 建个关卡组"时使用。只能从人员池挑人，团队里生成副本，原初员工不动。改已有团队用 update-team。
---

# 组建团队（create-team）

团队 = 人员池里挑出来的**副本** + 一段流程（workflow）+ 一段规范（spec）。

- 副本名 `团队/成员`，继承原初的 kind/path/model/skills/mcpServers；
  `prompt` = 原角色 + 团队规范 + 团队流程。
- **原初员工不被消耗**：仍在人员池，可被多个团队分别挑中。

## 怎么改注册表

```
"{{AIGOAT_EXE}}" team-list --out team-report.json        # 先看池里有谁
"{{AIGOAT_EXE}}" team-apply spec.json --out report.json  # 再组队
```

- 无窗口 GUI 程序：输出一律 `--out` 落盘后读文件。
- 变更单：`{ "ops": [ ... ] }`，字段 camelCase；退出码 0 / 1。
- 用完删掉临时 spec 与 report。

## 步骤

1. **`team-list` 读人员池**：`team` 为空且 `derivedFrom` 为空的才是池里的人。
   **不要凭印象编名字**；挑已属于别的团队的人、或挑副本都会报错——那时如实
   告诉用户"只能从人员池挑"，不要绕过。
2. 一次写完：挑人 + 流程 + 规范。

```json
{ "ops": [
  { "op": "materialize", "team": "关卡组", "members": ["sage", "forge", "judge"] },
  { "op": "workflow", "team": "关卡组", "workflow": "1. sage 出关卡文档\n2. forge 搭场景\n3. judge 验收" },
  { "op": "spec", "team": "关卡组", "spec": "所有产出一律落盘，不靠对话转述" }
] }
```

3. apply，读报告里的 `data.applied`；副本数应与挑的人数一致。
4. 告诉用户：团队已建好、谁是副本、原初成员仍在池里；**codex 原生副本要重连才生效**。

## workflow 与 spec 的区别

| 字段 | 回答什么问题 | 写法 |
| --- | --- | --- |
| `workflow` | 先做什么、后做什么、谁交给谁 | 有序阶段 + 交接物（落盘路径） |
| `spec` | 所有人都必须怎样 | 硬约束：命名、目录、验收口径 |

## 边界

- 团队名不要带 `/`（会和副本名冲突）。
- 池里没人 → 先用 `create-per` 建人，再回来组队。
- 用户想改已有团队的成员/流程 → 用 `update-team`，不要重复 `create-team`。
