# 「团队制作」默认技能 + 团队可视化 tab 实现方案

## Context

用户需求：给 AIGoat 新增默认技能「团队制作」（team-builder），让 codex 主 agent 通过提示词自主新增/删除/修改团队成员；团队要可视化，支持人工编辑与提示词编辑双通道，交互友好。

现状盘点（已探索确认）：
- 注册表存储层 `src-tauri\src\registry\mod.rs` 已有完整的 upsert/update/remove/set_team_workflow（校验+原子写+codex 角色文件同步）
- 设置中心「子 Agent」域已有人工编辑通道（SubAgentForm / TeamsSection）
- **缺口 1**：codex 无法调用 Tauri bridge 命令——需一条执行通道
- **缺口 2**：右栏 dock 无「团队」可视化 tab（现有 subagent tab 是运行时子代理事件流查看器，保留不动）

已拍板决策：
- 调用通道 = **CLI 子命令**（用户确认"codex 原生就有命令执行，技能教它跑命令即可"）
- 可视化 = **新「团队」tab**

整体链路：
```
codex 读技能 → 写 spec.json → 跑 aigoat.exe team-apply spec.json --out report.json
    → registry::upsert/remove/set_team_workflow（复用全部校验）
AIGoat 主进程 watcher（3s 轮询 registry.json）→ emit 'registry-changed'
    → 前端「团队」tab 自动 reload → 卡片墙更新
```

## 文件清单

| 文件 | 动作 | 预估行数 |
|---|---|---|
| `src-tauri\src\team\mod.rs` | 新增 | ~25 |
| `src-tauri\src\team\skill.rs` | 新增 | ~90 |
| `src-tauri\src\team\assets\SKILL.md` | 新增 | ~130（技能模板资产） |
| `src-tauri\src\team\cli.rs` | 新增 | ~180 |
| `src-tauri\src\registry\watch.rs` | 新增 | ~70 |
| `src-tauri\src\main.rs` | 修改 | +8 |
| `web\src\components\dock\tabRegistry.ts` | 修改 | +1（DockTabId 加 'team'） |
| `web\src\components\dock-tabs\registerBuiltinTabs.tsx` | 修改 | +7 |
| `web\src\components\team\TeamTab.tsx` | 新增 | ~165 |
| `web\src\components\team\TeamMemberCard.tsx` | 新增 | ~95 |
| `web\src\components\team\TeamWorkflowCard.tsx` | 新增 | ~90 |
| `web\src\components\team\TeamTab.module.css` | 新增 | ~90 |

CI 门禁核对：不加 bridge 命令、不改 map 层、不加 client.ts 接口方法 → check_bridge_wiring / check_field_contract / check_emit_fields 全不触发。

## Rust 侧

### team\mod.rs
模块门面：`pub mod cli; pub mod skill;` + 头注释说明分工、二期并发锁 TODO。

### team\skill.rs — 技能安装（幂等）
- `const SKILL_TEMPLATE: &str = include_str!("assets/SKILL.md");`
- `install()`：`current_exe()` → 替换 `{{AIGOAT_EXE}}` 占位符 → 写 `cache\codex\skills\team-builder\SKILL.md`
- 幂等：渲染后内容与现文件一致就跳过（覆盖模板升级 + exe 挪位置两种重写时机）
- 落盘复用 `crate::settings::config::write_text`（pub(crate)，tmp+rename 原子写，自动建父目录）
- **不写 `skills\.system\`**（codex 内置技能区，启动时被清空重写）

### team\assets\SKILL.md — 技能模板
frontmatter：`name: team-builder` + description（何时触发：组建团队/增删改成员/调工作流/查构成）。
正文要点：
1. 触发话术举例
2. 先查现状：`{{AIGOAT_EXE}} team-list --out report.json`（GUI 子系统 exe，stdout 仅在父进程捕获时可靠，一律 --out 落盘再读）
3. 变更四步：team-list 摸底 → 当前工作区写临时 spec（如 .aigoat-team-spec.json，用完删）→ team-apply → 读 report 逐条核对，partial 时按 failed[].error 修正重跑（upsert 幂等）
4. spec 格式：`{ "ops": [...] }`，camelCase：
   - `{ "op": "upsert", "name", "kind": "external"|"codex", "desc", "team", "path"(external 必填), "model"/"skills"/"mcpServers"/"prompt"(codex) }`
   - `{ "op": "remove", "name" }`
   - `{ "op": "workflow", "team", "workflow" }`（空串=清除）
   - 强调 desc 是主 agent 派单唯一依据，写"何时派"
5. report 形状：`{ "status": "ok|partial|error", "data": { "applied", "failed": [{index,op,name,error}], "teams" } }`；退出码 0/1 与 AF 任务单协议一致
6. 生效时机：external 改完即生效（随新会话注入）；codex 原生成员能力面**下次连接生效，提醒用户点重连**
7. 可视化指路：右栏「团队」tab，几秒内自动刷新

### team\cli.rs — 子命令执行
- `pub fn run(args) -> Option<i32>`：None = GUI 启动；Some(退出码) = CLI 调用
- 自带 `SpecFile/Op`（serde camelCase）+ `into_spec()`（不复用 commands::SubAgentSpecInput——其 into_spec 私有且跨层引用不干净，重复 15 行换模块解耦）
- `team-apply <spec> --out <report>`：逐条执行 op → registry::upsert/remove/set_team_workflow；单条失败不中断；全成 status=ok exit 0，部分 partial / 全败 error exit 1
- `team-list [--out <report>]`：输出 `{ "rows": rows(), "teams": teams() }`
- 参数错/读不了 spec → report 写 `{status:"error", data:{message}}`，exit 1

### main.rs — 接线（+8 行）
```rust
mod team;
// main() 开头 cache::init() 之后：
team::skill::install();
if let Some(code) = team::cli::run(std::env::args().skip(1)) {
    std::process::exit(code);
}
// setup 闭包尾部：
crate::registry::watch::spawn(handle.clone());
```

### registry\watch.rs — 注册表变更感知
- `pub const REGISTRY_EVENT: &str = "registry-changed"`
- 常驻 std::thread：每 3s 读 registry.json 内容与上次比对，变了 `app.emit(REGISTRY_EVENT, json!({}))`；读失败（rename 竞态窗口）跳过本轮
- emit 参照 `commands\terminal.rs` 现有 emit 用法；独立事件通道，不进 agent-event 流

### 并发锁：v1 不做（记录于 mod.rs 注释）
write_json 本身原子写，最坏丢一次并发更新、绝不损坏；watcher 3s 自愈；竞态窗口极窄。二期做 cache\tmp 锁文件方案。

## 前端侧

### tabRegistry.ts / registerBuiltinTabs.tsx
- DockTabId 加 `| 'team'`
- lazy 声明 + `registerTab({ id: 'team', title: '团队', glyph: '⚑', source: 'builtin', multi: false, badge: NoBadge, render: TeamTab })`
- BUILTIN_TAB_ORDER 在 'mcp' 后插 'team'（+ 菜单直达）

### components\team\TeamTab.tsx
- 数据复用 `useSubAgents`（跨目录 import `../settings/useSubAgents`——settings/ 实为子代理域宿主，不迁移 hook，加注释说明归属）
- 挂载时监听 `registry-changed`：动态 import('@tauri-apps/api/event') 的 cancelled/unlisten 形状照抄 `web\src\bridge\tauri.ts` subscribe（L37-74）
- 按 team 字段分组卡片墙（未编队单独一组）；form 状态机 new/edit；`SubAgentForm` 跨目录复用（props 映射照抄 SubagentsDomain.tsx:119-141）
- 空状态引导：给出示例提示词（「用 team-builder 技能，加一个 codex 原生成员 reviewer，负责素材评审，编入游戏组」）+ 手工登记按钮 + "codex 改动后几秒内自动刷新"说明

### TeamMemberCard.tsx
名称 + 类型徽章（codex 原生/外部进程）+ 团队名 + desc + external exe 状态（就绪/缺失）+ codex 能力面摘要；编辑（回调父层开 form）+ 注销（ConfirmBar 二次确认，复用 domains/shared）。

### TeamWorkflowCard.tsx
团队工作流内嵌编辑：默认显示文本（截断+title），编辑展开 textarea，dirty 才可保存，调 setWorkflow。与 TeamsSection 的 TeamEditor 同构但轻量独立（不绑 settings 样式体系），注释注明参照来源。

### TeamTab.module.css
卡片墙 grid（auto-fill, minmax(260px,1fr)）+ 成员卡 + 徽章 + 确认条；颜色全走 tokens 变量。

## 实现顺序

1. Rust CLI 闭环：team\mod.rs → assets\SKILL.md → skill.rs → cli.rs → main.rs 接线
2. watcher：registry\watch.rs + main.rs spawn
3. 前端：tabRegistry.ts → registerBuiltinTabs.tsx → team\ 四文件
4. 门禁与验证

## 验证

自动：`cargo fmt --all` → `cargo clippy --all-targets -- -D warnings`（src-tauri）→ `pwsh tools\verify.ps1`。

手工：
1. 启动 GUI → `cache\codex\skills\team-builder\SKILL.md` 生成且占位符已替换；再启一次 mtime 不变（幂等）
2. 右栏 + 菜单出现「团队」tab，空状态有引导文案
3. CLI 直跑：`aigoat.exe team-list --out r.json` 退出码 0；含非法名+合法 upsert 的 spec 跑 team-apply → 退出码 1、failed 带中文错误、合法条目已落盘（partial 语义）
4. codex 会话发提示词建成员 → 团队 tab 约 3s 内自动出现卡片；GUI 手工编辑/注销双向一致
5. codex 原生成员改动后重连生效（角色文件出现在 cache\codex\agents\）

## 风险

- R1 并发丢更新（已接受，write 原子 + watcher 自愈，二期加锁）
- R2 GUI 子系统 stdout：report 一律 --out 落盘（SKILL.md 强制）
- R3 exe 挪位置：下次启动自动纠正技能内路径
- R4 spec 临时文件写在当前工作区（codex 沙箱可能不让写 cache\tmp）
- R5 skills\team-builder\ 为 AIGoat 托管名，用户同名技能会被覆盖（注释写明）
- R6 main.rs 存量已超 200 行，本次仅 +8 行不做顺手重构
