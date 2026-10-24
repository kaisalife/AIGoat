//! 注入会话的派单说明（AF 规范）。
//!
//! 规范要求「渐进披露」：这里只放协议 + 能力速查 + 按需读取的文档路径；
//! 完整参数表与错误处置留在子 agent 工程里，让主 agent 按需读文件。
//!
//! 单独成文件是因为它是一段**长文本模板**，与注册表的增删改完全无关。
//!
//! 成员分两类，派活方式完全不同，所以分节写死、不混排：
//! - **codex 原生**：由 codex 的多代理协作（`spawn_agent`）在 codex 进程内
//!   拉起，能力面（model/skills/mcp_servers/prompt）经 `-c agents.*` 写进
//!   codex 配置（见 `settings/launch.rs::registry_overrides`）。
//! - **外部进程**：AF 规范的无头一次性进程，任务单协议派活。
//!
//! 两组同属一个**编队**（`team` 字段），总览放最前面——主 agent 先看到
//! "有谁、怎么分工"，再看各成员的协议细节。

use std::collections::BTreeMap;

use super::rows::rows;
use super::SubAgentRow;

/// 生成注入会话的派单说明（薄薄一节，常驻只留派单决策必需的信息）。
pub fn build_instructions() -> Option<String> {
    let list = rows();
    if list.is_empty() {
        return None;
    }
    let native: Vec<&SubAgentRow> = list
        .iter()
        .filter(|r| r.kind == super::AgentKind::Codex)
        .collect();
    let external: Vec<&SubAgentRow> = list
        .iter()
        .filter(|r| r.kind != super::AgentKind::Codex)
        .collect();
    if native.is_empty() && external.is_empty() {
        return None;
    }

    let mut out = String::new();
    out.push_str("## 子 Agent 派单（AF 规范）\n\n");
    push_team_overview(&mut out, &list);
    push_mentions(&mut out);
    push_collaboration_protocol(&mut out);
    if !native.is_empty() {
        push_native_section(&mut out, &native);
    }
    if !external.is_empty() {
        push_external_section(&mut out, &external);
    }
    Some(out)
}

/// 编队总览：team → 工作流（若有）+ 成员名清单（跨协议混编）。
fn push_team_overview(out: &mut String, list: &[SubAgentRow]) {
    let teams = super::teams();
    let mut grouped: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for row in list {
        let key = row.team.as_deref().unwrap_or("未编队");
        grouped.entry(key).or_default().push(&row.name);
    }
    // 只有一个人在编队、且流程与规范都空时，总览没有信息量。
    let any_workflow = teams
        .iter()
        .any(|t| !t.workflow.trim().is_empty() || !t.spec.trim().is_empty());
    if grouped.len() == 1 && grouped.values().all(|m| m.len() == 1) && !any_workflow {
        return;
    }
    out.push_str("### 编队与工作流\n\n");
    for (team, members) in &grouped {
        out.push_str(&format!("- **{team}**：{}\n", members.join("、")));
        if let Some(row) = teams.iter().find(|t| t.name == *team) {
            // 规范在前、流程在后：规范是全体硬约束，主 agent 派单时要先知道。
            let spec = row.spec.trim();
            if !spec.is_empty() {
                out.push_str("  - 团队规范（全体成员必须遵守）：\n");
                for line in spec.lines() {
                    out.push_str(&format!("    {line}\n"));
                }
            }
            let workflow = row.workflow.trim();
            if !workflow.is_empty() {
                out.push_str("  - 工作流：\n");
                for line in workflow.lines() {
                    out.push_str(&format!("    {line}\n"));
                }
            }
        }
    }
    out.push('\n');
}

/// 消息里的点名记号。
///
/// 这两个记号由 AIGoat 输入框（`@` 弹层、`/team`、`/per`）插入，**不是文件名**。
/// 写在常驻说明里而不是技能里：技能按需加载，等它被加载时可能已经错过这条消息。
fn push_mentions(out: &mut String) {
    out.push_str("### 消息里的点名记号\n\n");
    out.push_str(
        "- `@团队名`：点名整队协作——按该团队的工作流分派给团队成员。\n\
         - `@成员名`：用这位成员的能力处理这条消息（codex 原生成员用 `spawn_agent` \
         派给 TA；外部成员按任务单协议调用 TA 的 exe）。\n\
         - 两者都是输入框插入的记号，不是文件路径；与成员重名时以注入的成员清单为准。\n\n",
    );
}

/// 通用协作规程（参考 MetaGPT / GameGPT 的 SOP 思路）：把"成员清单"变成
/// "可调度的流水线"——交接靠落盘产物、每阶段有验收门、跨域冲突上抛、
/// 用户是总监。这一段对所有团队都适用，与具体成员无关。
fn push_collaboration_protocol(out: &mut String) {
    out.push_str("### 协作规程\n\n");
    out.push_str(
        "- **按阶段派单，交接靠产物**：上一阶段的产出是下一阶段的输入；交接用\
         **落盘文档的路径**（GDD / 数值表 / 技术方案 / 素材 / 报告），不要用对话转述。\n\
         - **一次只推进一个阶段**：前置产物没就位就先补齐，不要跳到后面的角色。\n\
         - **领域边界**：每个成员只在自己的领域内做决定；跨领域冲突（如美术与性能\
         取舍）**上抛给用户裁决**，不要替用户拍板。\n\
         - **验收门**：每个阶段产出后，用评审角色对照上游文档逐条验收并出报告，\
         **通过才进入下一阶段**；不通过就返工并指明环节。\n\
         - **用户是总监**：不可逆或影响范围大的决定（改范围 / 删内容 / 大改架构）\
         先给出选项与取舍，由用户决定。\n\
         - **不编造产出**：成员不可用或失败时如实说明并给出替代方案，禁止假装它完成了。\n\n",
    );
}

/// codex 原生成员：collab 派活说明。
fn push_native_section(out: &mut String, native: &[&SubAgentRow]) {
    out.push_str("### 团队成员 · codex 原生（collab）\n\n");
    out.push_str(
        "这些成员由 codex 的多代理协作（`spawn_agent`）在 codex 进程内拉起，\
         与你共享同一运行时：沙箱与审批策略一致。成员定义写在 \
         `~/.codex/agents/<名>.toml` 角色文件里（技能经 `[skills.config]` \
         按名启用，模型与角色指令按角色覆写）。\n\n",
    );
    for row in native {
        out.push_str(&format!("#### {}\n\n", row.name));
        if row.desc.trim().is_empty() {
            out.push_str("- 职责：（注册表未写描述）\n");
        } else {
            out.push_str(&format!("- 职责：{}\n", row.desc.trim()));
        }
        if let Some(model) = row.model.as_deref().filter(|m| !m.trim().is_empty()) {
            out.push_str(&format!("- 模型：{model}\n"));
        }
        if !row.skills.is_empty() {
            out.push_str(&format!("- 技能：{}\n", row.skills.join("、")));
        }
        if !row.mcp_servers.is_empty() {
            out.push_str(&format!("- MCP：{}\n", row.mcp_servers.join("、")));
        }
        if let Some(prompt) = row.prompt.as_deref().filter(|p| !p.trim().is_empty()) {
            out.push_str(&format!("- 角色提示词要点：{prompt}\n"));
        }
        // 团队特化副本的注册表名含 `/`（`团队/成员`），角色文件名做了转义——
        // 派活时要给 codex 的是 slug，不是显示名。
        if super::slug(&row.name) != row.name {
            out.push_str(&format!(
                "- codex 调用名：`{}`（显示名里的 / 在角色文件里转义为 __）\n",
                super::slug(&row.name)
            ));
        }
        out.push_str(
            "- 派活：用协作工具 `spawn_agent`（name 与成员名一致），结果经 \
             subAgentActivity / 结果项回传，验收口径同你的产出。\n",
        );
        out.push_str(
            "- 若协作工具不可用或该成员未被当前 codex 版本接受：跳过并在答复中\
             说明，**不要编造它的产出**。\n\n",
        );
    }
}

/// 外部进程成员：AF 任务单协议（原有内容原样保留）。
fn push_external_section(out: &mut String, external: &[&SubAgentRow]) {
    out.push_str("### 团队成员 · 外部进程（任务单协议）\n\n");
    out.push_str(
        "以下能力由独立的子 agent 进程提供（无头、一次性、无会话状态）。\n\
         你的职责是：把需求翻译成任务单 → 派活 → 用退出码判成败 → 从报告取产物并验收。\n\
         规格与验收在你，工艺在子 agent。\n\n",
    );
    out.push_str(
        "### 工作目录约定\n\n\
         任务单的 `workspace` 一律填**目标项目根目录**（游戏工程的绝对路径）：\
         子 agent 会把产物写进 `<workspace>/assets/<类别>/`、`<workspace>/exports/...` 等\
         工程内目录，报告 `data` 回传的路径直接可用于后续 Godot 集成。\
         任务单与报告等临时文件写在同一目录下（如 `<workspace>/workflow/`）。\n\n",
    );
    out.push_str("### 通用协议\n\n");
    out.push_str(
        "- 调用：`<exe> --agent <task.json> --out <report.json>`；退出码 0 成功 / 1 失败\n\
         - 任务单：`{ \"type\": <能力类型>, \"name\": <产物命名>, <工作上下文>, \"params\": { ... } }`；UTF-8 无 BOM\n\
         - 报告：`{ \"status\", \"message\", \"data\", \"error\": { \"code\" } }`；失败时读 `error.code` **修正参数后重派**，不要原样重试\n\
         - 引用只认 `data` 回传的稳定 id 或路径，不认名称；请求值 ≠ 实际结果，以报告 `data` 为准\n\n",
    );
    out.push_str("### 可用子 Agent\n\n");
    for row in external {
        out.push_str(&format!("#### {}\n\n", row.name));
        if row.desc.trim().is_empty() {
            out.push_str("- 何时派：（注册表未写描述，按需读能力清单判断）\n");
        } else {
            out.push_str(&format!("- 何时派：{}\n", row.desc.trim()));
        }
        if row.exe_exists {
            out.push_str(&format!(
                "- 调用：`{}` --agent <task.json> --out <report.json>\n",
                row.path
            ));
        } else {
            out.push_str(&format!(
                "- 调用：`{}`（**当前不存在**，先到子 agent 工程里构建 release 再派单）\n",
                row.path
            ));
        }
        if let Some(manifest) = &row.capability_manifest {
            out.push_str(&format!("- 能力清单（派单前读）：`{}`\n", manifest));
        }
        if let Some(skill) = &row.skill_doc {
            out.push_str(&format!("- 派单细则与错误处置（按需读）：`{}`\n", skill));
        }
        out.push('\n');
    }
}
