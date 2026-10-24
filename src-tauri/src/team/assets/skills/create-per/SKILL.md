---
name: create-per
description: 新建一个人（子 agent 成员）：当用户说"加一个人 / 新建成员 / 招一个 XX / 加个 reviewer"时使用。默认进人员池（不编入团队）；把 GitHub 开源 agent 包成员工请用 external-employee-create。
---

# 新建一个人（create-per）

"人" = 注册表里的**原初成员**，可以不属于任何团队（人员池）。团队只能从人员池
挑人，挑的是副本——所以这里建的人不会被"用掉"，可被多个团队同时挑中。

## 怎么改注册表

```
"{{AIGOAT_EXE}}" team-list --out team-report.json        # 先读现状
"{{AIGOAT_EXE}}" team-apply spec.json --out report.json  # 再写变更
```

- 本程序是无窗口 GUI 程序，stdout 不可靠：一律 `--out` 落盘后读文件。
- 变更单：`{ "ops": [ ... ] }`，字段 camelCase；退出码 0 成功 / 1 有失败。
- `status=partial`：成功的已生效，按 `failed[].error` 修正后重跑（幂等）。
- 用完删掉临时 spec 与 report，不在用户工程里留垃圾。

## 步骤

1. **先 `team-list`**：确认名字没被占用（`upsert` 是整条覆盖，同名会顶掉旧配置）。
2. 写变更单（**不填 `team` = 进人员池**）：

```json
{ "ops": [ { "op": "upsert", "name": "reviewer", "kind": "codex",
  "desc": "素材质量评审：产出通过/不通过与整改清单",
  "model": null, "skills": [], "mcpServers": [],
  "prompt": "你是素材评审员：只做质量判定，不改文件" } ] }
```

3. `team-apply`，读报告确认 `status=ok`。
4. 告诉用户：人已进人员池，可被任意团队挑中；**codex 原生成员要重连一次才生效**。

## 字段

| 字段 | 说明 |
| --- | --- |
| `name` | 主键，只能字母数字与 `-` `_`；**不可改名**（改名 = 删旧建新） |
| `kind` | `codex`（默认，原生协作成员）；`external` 必须给 `path`（已构建 exe） |
| `desc` | **最重要**：主 agent 靠这一句判断"何时派"，写清职责与触发场景 |
| `team` | 留空 = 人员池。非空 = 直接编入某团队（通常不要这样建） |
| `model` | codex 专用；留空跟随主会话 |
| `skills` | codex 专用：技能名数组（右栏「技能」里可见的名字） |
| `mcpServers` | codex 专用：server id 数组 |
| `prompt` | codex 专用：角色提示词 |

## 边界

- `skills` / `mcpServers` 只能填真实存在的名字，不要编造。
- 名字里不要用 `/`：那是团队副本的保留格式。
- 想内化开源 agent（Python/Node 等）→ 用 `external-employee-create` 技能。
