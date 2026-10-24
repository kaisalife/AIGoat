---
name: team-builder
description: 团队制作：当用户要求组建团队、新增/删除/修改团队成员、调整团队协作流程（工作流/SOP）、或查看当前团队构成时使用。通过 aigoat 命令行维护子代理注册表，改动会实时同步到 AIGoat 界面的「团队」面板。
---

# 团队制作（team-builder）

AIGoat 把「团队成员」（子 agent）登记在一张注册表里：成员可编入团队，团队
可带一段工作流（SOP）。改完注册表，AIGoat 右栏「团队」面板会在几秒内自动
刷新，无需重启。本技能教你用 `aigoat` 命令行安全地改这张注册表。

## 什么时候用

- 「帮我建一个团队 / 加一个成员 / 把 XX 移出团队」
- 「用现有的人组一个关卡组」（挑人组建团队，见第三步第 5 条）
- 「修改 XX 的职责 / 模型 / 技能 / 角色提示词」
- 「给游戏组写一套协作流程 / 一份规范」
- 「现在团队里有哪些人？」

用户消息里出现的 `@团队名`（AIGoat 输入框 `@` 弹层插入的记号）表示**点名
该团队协作**：把消息按该团队的工作流分派给团队成员，没有对应团队时提示
用户先用本技能建队。

## 第一步：先看现状

```
"{{AIGOAT_EXE}}" team-list --out team-report.json
```

读 `team-report.json`：`data.rows` 是成员清单（name/kind/desc/team/model/
skills/mcpServers/prompt），`data.teams` 是团队与工作流。**改之前先看，
避免覆盖用户已有的安排。**

注意：本程序是无窗口 GUI 程序，stdout 没接管道时拿不到输出，所以命令
一律带 `--out <文件>` 落盘后再读文件。

## 第二步：写变更单（spec）

在**当前工作目录**下写一个 JSON 文件（如 `.aigoat-team-spec.json`），形状：

```json
{ "ops": [ ... ] }
```

`ops` 按顺序执行，共三种 op（字段一律 camelCase）：

1. 新增或覆盖成员（幂等，同名即更新，重复执行安全）：

```json
{ "op": "upsert", "name": "reviewer", "kind": "codex",
  "desc": "素材质量评审：产出通过/不通过与整改清单",
  "team": "游戏组", "model": null, "skills": [], "mcpServers": [],
  "prompt": "你是素材评审员：只做质量判定，不改文件…" }
```

2. 删除成员：`{ "op": "remove", "name": "old-member" }`
3. 设置团队工作流（空串 = 清除）：

```json
{ "op": "workflow", "team": "游戏组",
  "workflow": "1. 策划产出 GDD\n2. 美术按 GDD 出图\n3. reviewer 验收" }
```

4. 设置团队规范（空串 = 清除）。规范是**全体成员共同遵守的硬约束**，
   与流程分开：流程讲顺序，规范讲"所有人都必须怎样"：

```json
{ "op": "spec", "team": "游戏组",
  "spec": "命名用蛇形；交付物一律写进 assets/<类别>/；评审不通过不得进入下一阶段" }
```

5. 组建团队编制（**从人员池挑人**，原初成员不动）：

```json
{ "op": "materialize", "team": "关卡组",
  "members": ["reviewer", "builder"], "prune": true }
```

**先建人，再组队**——团队只能从人员池挑人：

- 人员池 = `team-list` 里 `team` 为空的**原初成员**（`derivedFrom` 为空）。
- `members` 必须都来自人员池。挑已属于别的团队的人、或挑副本
  （`团队/成员`）都会报错——不要绕过报错去硬写，先如实告诉用户。
- 团队里出现的是**副本** `关卡组/reviewer`：继承原初的 kind/path/model/
  skills/mcpServers，`prompt` = 原角色 + 团队规范 + 团队流程。
- **原初员工不被消耗**：它仍在人员池里，可被多个团队分别挑中。
- 花名册会存进团队：下次不传 `members` 就按已存花名册重建（界面「特化」按钮走这条）。
- 幂等：重跑覆盖同名副本；`prune: true` 清掉已不在花名册里的副本。
- 过期判断：`team-list` 里副本 `derivedStale: true` 表示原初被改过，重跑即可。
  codex 原生副本要重连才生效。

完整例子——先确认池里有谁，再组队：

```json
{ "ops": [
  { "op": "materialize", "team": "关卡组", "members": ["sage", "forge", "judge"] },
  { "op": "workflow", "team": "关卡组", "workflow": "1. sage 出关卡文档\n2. forge 搭场景\n3. judge 验收" },
  { "op": "spec", "team": "关卡组", "spec": "所有产出一律落盘，不靠对话转述" }
] }
```

字段说明：

- `name`：成员名，只能字母 / 数字 / `-` / `_`；是注册表主键，不可改名
  （改名 = 删旧建新）。
- `kind`：`"codex"`（codex 原生协作成员，最常用，默认）或 `"external"`
  （外部 exe，必须给 `path`：已构建 exe 的绝对路径，不存在会失败）。
  `"codex"` 可配 `model`（留空跟随主会话）/ `skills`（技能名数组）/
  `mcpServers`（server id 数组）/ `prompt`（角色提示词）。
- `desc`：**最重要**——主 agent 派单时只看这一句决定「何时派」，必须写清
  职责与触发场景，不要只写头衔。
- `team`：**默认留空 = 进人员池**。只有用户明确说"直接编进某团队"时才填；
  填了就不在池里，别的团队不能再挑 TA。

## 第三步：应用变更单

```
"{{AIGOAT_EXE}}" team-apply .aigoat-team-spec.json --out team-report.json
```

- 退出码 0 = 全部成功；1 = 有失败。**不要**因为失败就原样重跑，先读报告。
- 报告形状：

```json
{ "status": "ok | partial | error", "message": "…",
  "data": { "applied": [ … ], "failed": [ { "index": 0, "op": "…", "name": "…", "error": "中文原因" } ], "teams": [ … ] } }
```

- `partial`：成功的那些已生效；失败的按 `error` 修正 spec 后重跑
  （upsert 幂等，重跑安全）。
- 全部处理完后**删除两个临时文件**（spec 与 report），不在用户工程里留垃圾。

## 生效时机（要主动告诉用户）

- `external` 成员：立即生效，派单说明随**新会话**注入。
- `codex` 原生成员：能力面写成 codex 角色文件，**下一次连接生效**——
  改完提醒用户点一次「重连」。
- AIGoat 右栏「团队」面板几秒内自动出现 / 更新这些卡片，可让用户自己核对。

## 边界

- `skills` 只能填已存在的技能名（AIGoat 右栏「技能」面板可见），不要编造。
- `mcpServers` 只能填已在 codex 配置里的 server id（右栏「MCP」面板可见）。
- 大改（整队重建、一次删多个成员）之前先复述计划，请用户确认再执行。
