---
name: delete-per
description: 删除一个人（子 agent 成员）：当用户说"删掉 reviewer / 把 XX 去了 / 不要这个人了"时使用。只删人，不删团队；解散团队用 delete-team。
---

# 删除一个人（delete-per）

## 怎么改注册表

```
"{{AIGOAT_EXE}}" team-list --out team-report.json
"{{AIGOAT_EXE}}" team-apply spec.json --out report.json
```

无窗口 GUI 程序：输出一律 `--out` 落盘后读文件；用完删掉临时 spec 与 report。

## 步骤

1. `team-list` 确认这个人存在，并看 `derivedFrom`：
   - `derivedFrom` 为空 = 原初成员（能删）；
   - 非空 = 团队副本，属于某个团队，应让用户去 `update-team` / `delete-team` 处理。
2. 写变更单：

```json
{ "ops": [ { "op": "remove", "name": "reviewer" } ] }
```

3. apply，读报告；`status=ok` 才算删掉。

## 删之前要提醒用户的事

- 如果这个人被某些团队挑过（团队里存在 `团队/人名` 的副本），**副本不会自动消失**，
  仍会以旧能力出现在那些团队里。建议同时对该团队执行 `materialize`（带 `prune: true`），
  或直接 `team-remove` 解散该团队。
- codex 原生成员的角色文件会被一并清理，重连后生效。

## 边界

- 删的是人，不是团队；也不要为了"把人移出团队"去删人——那用 `update-team` 重挑人。
- 大删（一次删多个）之前先复述名单，请用户确认。
