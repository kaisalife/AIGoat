//! 子 Agent（AF 规范注册表）命令。
//!
//! 地址只存在 `~/.agent-registry/registry.json`；这里只是把注册表
//! 包装成界面能直接用的形状，注入逻辑在 `registry.rs`。
//!
//! 成员分两类：外部进程（任务单协议）与 codex 原生（collab）。codex 原生
//! 成员的能力面经 `-c agents.*` 随**下一次连接**注入（见
//! `registry::launch_overrides`），改完注册表要点一次重连才对 codex 生效。

use serde::Deserialize;
use serde_json::{json, Value};

/// 界面提交的成员规格（camelCase，与前端契约一致）。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubAgentSpecInput {
    pub path: Option<String>,
    pub desc: Option<String>,
    pub kind: Option<String>,
    pub team: Option<String>,
    pub model: Option<String>,
    pub skills: Option<Vec<String>>,
    pub mcp_servers: Option<Vec<String>>,
    pub prompt: Option<String>,
}

impl SubAgentSpecInput {
    fn into_spec(self) -> crate::registry::AgentSpec {
        crate::registry::AgentSpec {
            path: self.path.unwrap_or_default(),
            desc: self.desc.unwrap_or_default(),
            kind: crate::registry::AgentKind::parse(&self.kind.unwrap_or_default()),
            team: self.team,
            model: self.model,
            skills: self.skills.unwrap_or_default(),
            mcp_servers: self.mcp_servers.unwrap_or_default(),
            prompt: self.prompt,
        }
    }
}

/// 已登记的子 agent + 本机状态（exe 是否存在、能力清单/派单细则位置）。
#[tauri::command]
pub fn bridge_subagents_list() -> Result<Value, String> {
    Ok(json!(crate::registry::rows()))
}

/// 登记到 `~/.agent-registry/registry.json`（唯一地址来源）。
#[tauri::command]
pub fn bridge_subagents_register(name: String, spec: SubAgentSpecInput) -> Result<Value, String> {
    let registry = crate::registry::upsert(&name, &spec.into_spec())?;
    Ok(json!({ "agents": registry.agents }))
}

#[tauri::command]
pub fn bridge_subagents_remove(name: String) -> Result<Value, String> {
    let registry = crate::registry::remove(&name)?;
    Ok(json!({ "agents": registry.agents }))
}

/// 修改已登记子 agent（名称不可改）。
#[tauri::command]
pub fn bridge_subagents_update(name: String, spec: SubAgentSpecInput) -> Result<Value, String> {
    let registry = crate::registry::update(&name, &spec.into_spec())?;
    Ok(json!({ "agents": registry.agents }))
}

/// 预览将注入会话的派单说明（设置界面展示，便于核对主 agent 到底看到什么）。
#[tauri::command]
pub fn bridge_subagents_instructions() -> Result<Value, String> {
    Ok(json!({ "instructions": crate::registry::build_instructions() }))
}

/// 团队清单（名 + 工作流 + 成员）。团队不是成员，是成员之上的编组。
#[tauri::command]
pub fn bridge_teams_list() -> Result<Value, String> {
    Ok(json!(crate::registry::teams()))
}

/// 设置某团队的工作流 / SOP（空串清除）。注入说明里随会话下发。
#[tauri::command]
pub fn bridge_teams_set_workflow(team: String, workflow: String) -> Result<Value, String> {
    crate::registry::set_team_workflow(&team, &workflow)?;
    Ok(json!({ "teams": crate::registry::teams() }))
}
