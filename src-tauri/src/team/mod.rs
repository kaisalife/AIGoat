//! 「团队制作」（team-builder）与「外部员工创建」（external-employee-create）：
//! 默认技能 + CLI 子命令。
//!
//! 让 codex 主 agent 自主维护子代理注册表（增删改成员、调团队工作流）、
//! 并把外部开源 agent 包成符合 AF 任务单协议的 external 成员：
//! - [`skill`]：启动时把内置 SKILL.md 渲染进 `CODEX_HOME\skills\<名>\`，
//!   codex 启动/watch 自动发现，无需任何注册动作。
//! - [`cli`]：`aigoat.exe team-apply <spec.json>` / `team-list` /
//!   `agent-scaffold <目录> --name <成员名>`——codex 用自带的 shell 执行，
//!   即可改注册表、生成适配壳工程。
//! - [`scaffold`]：适配壳模板落盘（薄壳拉起上游 agent，本体不重写）。
//! - `assets\*.md`：技能模板，`{{AIGOAT_EXE}}` 占位符安装时替换为
//!   本程序绝对路径（AF 规范：教学材料写占位符、由注入器替换）。
//!
//! # 为什么走 CLI 而不是 MCP 或直改 registry.json
//!
//! codex 原生就有 shell 执行；CLI 复用 `registry::` 的全部校验与原子写，
//! 长角色提示词走文件没有命令行转义问题；技能（提示词）与能力（命令）
//! 各司其职，互不耦合。
//!
//! # 二期 TODO：跨进程并发锁
//!
//! GUI（bridge 命令）与 CLI（team-apply）并发「读-改-写」registry.json
//! 可能丢一次更新——write_json 是 tmp+rename 原子写，最坏丢更新、绝不
//! 损坏，且 `registry::watch` 的事件让 GUI 视图 3s 内自愈。窗口极窄，
//! v1 不加锁；若后续要做：cache\tmp 下锁文件（OpenOptions create_new
//! 原子占位 + 重试 + 过期抢占），包住四个注册表写入口。

pub mod cli;
pub mod materialize;
pub mod report;
pub mod scaffold;
pub mod skill;
