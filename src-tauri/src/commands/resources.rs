//! 右栏资源面板的只读数据源：MCP 服务器、技能、钩子、codex 配置键。
//!
//! 全是 `*list` / `read` 形态，不改任何状态——右栏的「刷新」按钮直接重取。

use serde_json::{json, Value};
use tauri::State;

use super::client;
use crate::AppState;

/// 取 `data` 数组，统一空值处理。
async fn list_items(
    state: &State<'_, AppState>,
    method: &str,
    params: Value,
) -> Result<Vec<Value>, String> {
    let client = client(state)?;
    let resp = client.request(method, params).await?;
    Ok(resp
        .get("data")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}

#[tauri::command]
pub async fn bridge_mcp_servers(state: State<'_, AppState>) -> Result<Value, String> {
    // detail: Minimal 只取连接状态，不拉工具目录，右栏刷新更快。
    let list = list_items(
        &state,
        "mcpServerStatus/list",
        json!({ "detail": "Minimal" }),
    )
    .await?;
    Ok(Value::Array(
        list.iter()
            .map(|s| {
                json!({
                    "name": s.get("name").unwrap_or(&Value::Null),
                    "runtimeStatus": s.get("runtimeStatus").unwrap_or(&Value::Null),
                    "authStatus": s.get("authStatus").unwrap_or(&Value::Null),
                    "toolCount": s.get("tools").and_then(Value::as_object).map(|t| t.len()).unwrap_or(0),
                })
            })
            .collect(),
    ))
}

#[tauri::command]
pub async fn bridge_skills(state: State<'_, AppState>, cwd: String) -> Result<Value, String> {
    let list = list_items(&state, "skills/list", json!({ "cwds": [cwd] })).await?;
    Ok(Value::Array(
        list.iter()
            .map(|entry| {
                let skills: Vec<Value> = entry
                    .get("skills")
                    .and_then(Value::as_array)
                    .map(|skills| {
                        skills
                            .iter()
                            .map(|s| {
                                json!({
                                    "name": s.get("name").unwrap_or(&Value::Null),
                                    "description": s.get("description").unwrap_or(&Value::Null),
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                json!({ "cwd": entry.get("cwd").unwrap_or(&Value::Null), "skills": skills })
            })
            .collect(),
    ))
}

#[tauri::command]
pub async fn bridge_hooks(state: State<'_, AppState>, cwd: String) -> Result<Value, String> {
    let list = list_items(&state, "hooks/list", json!({ "cwds": [cwd] })).await?;
    Ok(Value::Array(
        list.iter()
            .flat_map(|entry| {
                entry
                    .get("hooks")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default()
            })
            .map(|h| {
                json!({
                    "key": h.get("key").unwrap_or(&Value::Null),
                    "eventName": h.get("eventName").unwrap_or(&Value::Null),
                    "handlerType": h.get("handlerType").unwrap_or(&Value::Null),
                    "enabled": h.get("enabled").unwrap_or(&json!(false)),
                })
            })
            .collect(),
    ))
}

/// 只回键名：config 值里可能有凭据，前端也不需要。
#[tauri::command]
pub async fn bridge_config(
    state: State<'_, AppState>,
    cwd: Option<String>,
) -> Result<Value, String> {
    let client = client(&state)?;
    let mut params = json!({});
    if let Some(cwd) = cwd {
        params["cwd"] = json!(cwd);
    }
    let resp = client.request("config/read", params).await?;
    let keys: Vec<Value> = resp
        .pointer("/config")
        .and_then(Value::as_object)
        .map(|config| config.keys().map(|k| json!(k)).collect())
        .unwrap_or_default();
    Ok(Value::Array(keys))
}

// ---------------------------------------------------------------------------
// MCP 服务器 / 技能的**配置面**（子 Agent 域的编辑界面用）。
// 协议（codex-rs app-server v2，已核对源码）：
// - `config/read` → { config: {...} }，mcp_servers 定义在其中
// - `config/value/write` → { keyPath, value, mergeStrategy: replace|upsert }
// - `config/mcpServer/reload` → 无参（写完热重载连接）
// - `skills/config/write` → { name?, path?, enabled } → { effectiveEnabled }
// - `skills/extraRoots/set` → { extraRoots: [...] }
// ---------------------------------------------------------------------------

/// 从 config 读响应里取 mcp_servers 定义表（兼容两种键名风格）。
fn servers_from_config(config: &Value) -> Value {
    config
        .get("mcp_servers")
        .or_else(|| config.get("mcpServers"))
        .cloned()
        .unwrap_or(json!({}))
}

#[tauri::command]
pub async fn bridge_mcp_definitions_read(state: State<'_, AppState>) -> Result<Value, String> {
    let client = client(&state)?;
    let resp = client.request("config/read", json!({})).await?;
    let servers = servers_from_config(&resp);
    let mut out = Vec::new();
    if let Some(map) = servers.as_object() {
        for (id, def) in map {
            let kind = if def.get("command").is_some() {
                "stdio"
            } else if def.get("url").is_some() {
                "http"
            } else {
                "unknown"
            };
            out.push(json!({
                "id": id,
                "kind": kind,
                "command": def.get("command").cloned().unwrap_or(Value::Null),
                "args": def.get("args").cloned().unwrap_or(json!([])),
                "url": def.get("url").cloned().unwrap_or(Value::Null),
                "raw": def,
            }));
        }
    }
    Ok(Value::Array(out))
}

/// 写入/新增一个 MCP 服务器定义（replace：整条覆盖），写完热重载。
#[tauri::command]
pub async fn bridge_mcp_definition_write(
    state: State<'_, AppState>,
    id: String,
    definition: Value,
) -> Result<Value, String> {
    if id.trim().is_empty() {
        return Err("MCP 服务器 id 不能为空".into());
    }
    let client = client(&state)?;
    let resp = client
        .request(
            "config/value/write",
            json!({
                "keyPath": format!("mcp_servers.{}", id.trim()),
                "value": definition,
                "mergeStrategy": "replace",
            }),
        )
        .await?;
    let _ = client.request("config/mcpServer/reload", json!({})).await;
    Ok(resp)
}

/// 删除一个 MCP 服务器定义：MergeStrategy 没有 remove，这里写 `null` 交由
/// codex 裁决——若当前版本不支持，错误原样透传给界面。
#[tauri::command]
pub async fn bridge_mcp_definition_remove(
    state: State<'_, AppState>,
    id: String,
) -> Result<Value, String> {
    let client = client(&state)?;
    let resp = client
        .request(
            "config/value/write",
            json!({
                "keyPath": format!("mcp_servers.{}", id.trim()),
                "value": Value::Null,
                "mergeStrategy": "replace",
            }),
        )
        .await?;
    let _ = client.request("config/mcpServer/reload", json!({})).await;
    Ok(resp)
}

/// 技能开关（按名；`skills/list` 给出的就是名字）。
#[tauri::command]
pub async fn bridge_skills_config_write(
    state: State<'_, AppState>,
    name: String,
    enabled: bool,
) -> Result<Value, String> {
    let client = client(&state)?;
    let resp = client
        .request(
            "skills/config/write",
            json!({ "name": name.trim(), "enabled": enabled }),
        )
        .await?;
    Ok(resp)
}

/// 技能额外根目录（codex 在这些目录里发现技能）。
#[tauri::command]
pub async fn bridge_skills_roots_set(
    state: State<'_, AppState>,
    extra_roots: Vec<String>,
) -> Result<Value, String> {
    let client = client(&state)?;
    let roots: Vec<Value> = extra_roots
        .iter()
        .map(|r| json!(r.trim()))
        .filter(|r| r != &json!(""))
        .collect();
    let resp = client
        .request("skills/extraRoots/set", json!({ "extraRoots": roots }))
        .await?;
    Ok(resp)
}

/// 当前生效的技能配置（`skills` 表原样返回：含 config 规则），
/// 界面据此计算每个已发现技能的启用状态。
#[tauri::command]
pub async fn bridge_skills_config_read(state: State<'_, AppState>) -> Result<Value, String> {
    let client = client(&state)?;
    let resp = client.request("config/read", json!({})).await?;
    let config = resp.get("config").cloned().unwrap_or(json!({}));
    Ok(config
        .get("skills")
        .or_else(|| config.get("skills_config"))
        .cloned()
        .unwrap_or(json!({})))
}
