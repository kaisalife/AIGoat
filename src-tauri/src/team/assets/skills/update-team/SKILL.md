---
name: update-team
description: 修改团队：当用户说"把 XX 加进/移出某团队 / 改团队流程 / 改团队规范 / 刷新团队副本"时使用。改成员本人的配置请用 update-per。
---

# 修改团队（update-team）

团队有三样东西可改：**编制**（挑了谁）、**流程**（workflow）、**规范**（spec）。
原初成员不受影响——改的是团队里的副本。

## 怎么改注册表

```
"{{AIGOAT_EXE}}" team-list --out team-report.json        # 先读团队现状
"{{AIGOAT_EXE}}" team-apply spec.json --out report.json  # 再写变更
```

- 无窗口 GUI 程序：输出一律 `--out` 落盘后读文件。
- 变更单：`{ "ops": [ ... ] }`，字段 camelCase；退出码 0 / 1。
- 用完删掉临时 spec 与 report。

## 三种改法

### 1. 改流程（阶段顺序）

```json
{ "op": "workflow", "team": "关卡组", "workflow": "1. sage 出关卡\n2. forge 搭场景\n3. judge 验收" }
```

### 2. 改规范（全体硬约束）

```json
{ "op": "spec", "team": "关卡组", "spec": "交付物一律写进 assets/；评审不通过不得进入下一阶段" }
```

### 3. 改编制（加人 / 移人 / 换人）

`members` 是**完整名单**（不是增量），并且只能从人员池挑；
`prune: true` 会把不在名单里的副本一并删掉：

```json
{ "op": "materialize", "team": "关卡组", "members": ["sage", "judge"], "prune": true }
```

- "把 forge 移出" = 名单里去掉 forge + `prune: true`。
- "加个人" = 先把 ta 加到名单，再确认 ta 在人员池（`team` 为空、`derivedFrom` 为空）。
- 不传 `members` 时按已存花名册重建（用于刷新副本，不改编制）。

## 什么时候必须刷新

`team-list` 里副本出现 `derivedStale: true`，说明原初成员被改过。跑一次
`materialize`（不带 `members`）即可让副本跟上，然后告知用户。

## 边界

- 改"人本身"（职责/模型/技能）用 `update-per`；这里只管团队。
- 用户要求解散整个团队 → `delete-team`。
- codex 原生副本刷新后要重连才生效。
