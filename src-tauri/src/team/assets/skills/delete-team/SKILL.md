---
name: delete-team
description: 解散团队：当用户说"解散 XX 组 / 不要这个团队了 / 把团队删掉"时使用。副本删除，原初成员回到人员池；删人不属于本技能。
---

# 解散团队（delete-team）

## 怎么改注册表

```
"{{AIGOAT_EXE}}" team-list --out team-report.json
"{{AIGOAT_EXE}}" team-apply spec.json --out report.json
```

无窗口 GUI 程序：输出一律 `--out` 落盘后读文件；用完删掉临时 spec 与 report。

## 步骤

1. `team-list` 确认团队存在，并看清它有哪些副本（`data.teams[].members`）。
2. 写变更单：

```json
{ "ops": [ { "op": "team-remove", "team": "关卡组" } ] }
```

3. apply，读报告；`status=ok` 才算解散。

## 语义（要主动告知用户）

- **副本删除**：团队里的 `团队/成员` 全部移除。
- **原初成员回到人员池**：人不会被删除，能力与提示词一个字段都不动，可以再被别的团队挑。
- 团队的流程与规范随笔记载一起消失。
- codex 原生副本的角色文件会被清理，重连后生效。

## 边界

- 只是想"把人移出团队"→ 用 `update-team` 改编制（`prune: true`），不要解散团队。
- 想删掉人本身 → `delete-per`，与团队无关。
- 大团队解散前先列出成员名单，请用户确认。
