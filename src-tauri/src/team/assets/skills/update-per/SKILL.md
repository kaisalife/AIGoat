---
name: update-per
description: 修改一个人（子 agent 成员）的配置：当用户说"改一下 XX 的职责 / 换个模型 / 给 TA 加个技能 / 调提示词 / 换个团队"时使用。改团队编制请用 update-team。
---

# 修改一个人（update-per）

## 怎么改注册表

```
"{{AIGOAT_EXE}}" team-list --out team-report.json        # 先读出完整配置
"{{AIGOAT_EXE}}" team-apply spec.json --out report.json  # 再写变更
```

- 无窗口 GUI 程序：输出一律 `--out` 落盘后读文件。
- 变更单：`{ "ops": [ ... ] }`，字段 camelCase；退出码 0 / 1。
- 用完删掉临时 spec 与 report。

## 铁律：`upsert` 是整条覆盖

只改一个字段，也要把**其余字段原样带上**；漏掉的字段会被清空（external 成员
会立刻变成 exe 缺失）。所以必须：

1. `team-list` 找到这个人，读出 `kind / path / desc / team / model / skills /
   mcpServers / prompt` 全部字段；
2. 写一条 `upsert`，只改用户要求的那项，其余照抄；
3. apply。

```json
{ "ops": [ { "op": "upsert", "name": "reviewer", "kind": "codex",
  "desc": "素材质量评审：产出通过/不通过与整改清单",
  "team": null, "model": "gpt-5-codex", "skills": ["create-per"],
  "mcpServers": [], "prompt": "你是素材评审员：只做质量判定，不改文件" } ] }
```

## 常见改法

| 用户说 | 改哪个字段 |
| --- | --- |
| 换个模型 | `model` |
| 给 TA 加技能 / 去掉技能 | `skills`（整份数组，不是增量） |
| 加 MCP | `mcpServers`（整份数组） |
| 改职责 / 派单场景 | `desc`（最常改，主 agent 靠它决策） |
| 改角色设定 | `prompt` |
| 是外部员工，换 exe | `path`（必须指向真实存在的文件） |

## 注意

- **改名不支持**：名字是主键；改名 = 先 `remove` 再 `upsert`，并提醒用户历史引用会断。
- 改完提示：external 成员立即生效；**codex 原生成员要重连一次**。
- 如果这人被团队挑中过，副本不会自动跟着变——提醒用户再跑一次 `update-team`
  （`materialize`）刷新副本，或直接替他刷新。
