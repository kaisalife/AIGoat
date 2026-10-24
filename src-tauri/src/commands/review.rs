//! 复核、权限档位、沙箱就绪——右栏与交付物的只读/触发入口。

use serde_json::{json, Value};
use tauri::State;

use super::client;
use crate::AppState;

/// `review/start`：让模型开一个复核会话审自己的改动。
/// 前端 ReviewTarget 与协议 ReviewTarget 同形，直接透传。
#[tauri::command]
pub async fn bridge_review(
    state: State<'_, AppState>,
    thread_id: String,
    target: Value,
) -> Result<Value, String> {
    let client = client(&state)?;
    let resp = client
        .request(
            "review/start",
            json!({ "threadId": thread_id, "target": target }),
        )
        .await?;
    let review_thread_id = resp
        .get("reviewThreadId")
        .cloned()
        .ok_or("review/start 应答缺少 reviewThreadId")?;
    Ok(json!({ "reviewThreadId": review_thread_id }))
}

#[tauri::command]
pub async fn bridge_permission_profiles(
    state: State<'_, AppState>,
    cwd: Option<String>,
) -> Result<Value, String> {
    let client = client(&state)?;
    let mut params = json!({});
    if let Some(cwd) = cwd {
        params["cwd"] = json!(cwd);
    }
    let resp = client.request("permissionProfile/list", params).await?;
    let list = resp
        .get("data")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(Value::Array(
        list.iter()
            .map(|p| {
                json!({
                    "id": p.get("id").unwrap_or(&Value::Null),
                    "description": p.get("description").unwrap_or(&Value::Null),
                    // false 时前端应当置灰而不是隐藏——隐藏会让用户以为功能不存在。
                    "allowed": p.get("allowed").unwrap_or(&json!(true)),
                })
            })
            .collect(),
    ))
}

#[tauri::command]
pub async fn bridge_sandbox_readiness(state: State<'_, AppState>) -> Result<String, String> {
    let client = client(&state)?;
    let resp = client
        .request("windowsSandbox/readiness", json!({}))
        .await?;
    Ok(resp
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("notConfigured")
        .to_string())
}
