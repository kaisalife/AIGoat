//! 线程命令：列表、起/恢复/fork、归档、改名、回滚。
//! 删除语义在 `delete.rs`（含"运行中先打断"的兜底），本文件只管会话本身。

use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, State};

use super::{client, thread_full, thread_summary};
use crate::codex::CodexClient;
use crate::AppState;

/// 列表默认条数。侧栏只显示最近这些，删工作区时另有更大的上限。
const DEFAULT_LIMIT: u64 = 50;

#[tauri::command]
pub async fn bridge_list_threads(
    state: State<'_, AppState>,
    cwd: Option<String>,
    archived: Option<bool>,
) -> Result<Value, String> {
    let client = client(&state)?;
    let list = list_threads(
        &client,
        cwd.as_deref(),
        DEFAULT_LIMIT,
        archived.unwrap_or(false),
    )
    .await?;
    Ok(Value::Array(list.iter().map(thread_summary).collect()))
}

/// `thread/list` 的统一入口。
///
/// `modelProviders: []` = 包含全部 provider 的会话（否则自定义 provider 生效后
/// 只能看到它自己的历史，会话列表会把用户以前的记录藏掉）。
/// `archived` 语义来自协议：true 只回已归档，false/缺省只回未归档——两者互斥，
/// 所以归档区要单独拉一次。删工作区时要把该工作区的会话全捞出来，所以 limit 可调。
pub async fn list_threads(
    client: &Arc<CodexClient>,
    cwd: Option<&str>,
    limit: u64,
    archived: bool,
) -> Result<Vec<Value>, String> {
    let mut params = json!({
        "limit": limit,
        "modelProviders": [],
        "sortKey": "recency_at",
        "sortDirection": "desc",
        "archived": archived,
    });
    if let Some(cwd) = cwd {
        params["cwd"] = json!([cwd]);
    }
    let resp = client.request("thread/list", params).await?;
    Ok(resp
        .get("data")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}

#[tauri::command]
pub async fn bridge_start_thread(
    app: AppHandle,
    state: State<'_, AppState>,
    cwd: String,
    config: Option<Value>,
) -> Result<Value, String> {
    let client = client(&state)?;
    let mut params = json!({ "cwd": cwd });
    if let Some(config) = &config {
        // 模型与提供商由前端的自定义配置决定；未指定时回落到启动时钉死的默认。
        if let Some(model) = config.get("model").cloned() {
            params["model"] = model;
        }
        if let Some(provider) = config.get("modelProvider").cloned() {
            params["modelProvider"] = provider;
        }
    }
    // AF 规范：子 agent 派单说明随会话注入（地址来自注册表，不硬编码）。
    if let Some(instructions) = crate::registry::build_instructions() {
        params["developerInstructions"] = json!(instructions);
    }
    let resp = client.request("thread/start", params).await?;
    let thread = resp
        .get("thread")
        .cloned()
        .ok_or("thread/start 应答缺少 thread")?;
    let _ = app;
    Ok(thread_full(&thread))
}

#[tauri::command]
pub async fn bridge_resume_thread(
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<Value, String> {
    let client = client(&state)?;
    // 旧会话的模型/provider 可能已不在当前配置里（配置被重置、换了提供商），
    // 但历史回放本身和模型无关——把当前生效模型作为覆盖项传过去，让 codex
    // 用它能加载线程并回放历史，而不是被「provider 不存在」卡死。没有配置
    // 就用占位回退模型；等用户配好真实提供商后这里自动换成真实模型。
    let (provider_id, model_id) = {
        let result =
            crate::commands::with_settings(&state, |settings| match settings.active_model() {
                Some(model) => (model.provider_id.clone(), model.id.clone()),
                None => {
                    let (provider_id, model_id) = crate::settings::launch::fallback_model();
                    (provider_id.to_string(), model_id.to_string())
                }
            })?;
        result
    };
    let mut params = json!({ "threadId": thread_id });
    params["modelProvider"] = json!(provider_id);
    params["model"] = json!(model_id);
    if let Some(instructions) = crate::registry::build_instructions() {
        params["developerInstructions"] = json!(instructions);
    }
    let resp = match client.request("thread/resume", params).await {
        Ok(resp) => resp,
        // 刚建、还没说过一句话的线程没有落盘 rollout——这不是错误，
        // 应当当作"空会话"打开，否则用户点侧栏第一行就报错。
        Err(err) if err.contains("no rollout found") => {
            return Ok(json!({
                "thread": { "id": thread_id, "path": Value::Null, "model": Value::Null },
                "history": [],
            }))
        }
        Err(err) => return Err(err),
    };
    let thread = resp
        .get("thread")
        .cloned()
        .ok_or("thread/resume 应答缺少 thread")?;
    let history = crate::map::map_history(thread.get("turns").unwrap_or(&Value::Null));
    Ok(json!({ "thread": thread_full(&thread), "history": history }))
}

#[tauri::command]
pub async fn bridge_fork_thread(
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<Value, String> {
    let client = client(&state)?;
    let resp = client
        .request("thread/fork", json!({ "threadId": thread_id }))
        .await?;
    let thread = resp
        .get("thread")
        .cloned()
        .ok_or("thread/fork 应答缺少 thread")?;
    Ok(thread_full(&thread))
}

#[tauri::command]
pub async fn bridge_archive_thread(
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<(), String> {
    client(&state)?
        .request("thread/archive", json!({ "threadId": thread_id }))
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn bridge_unarchive_thread(
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<(), String> {
    client(&state)?
        .request("thread/unarchive", json!({ "threadId": thread_id }))
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn bridge_rename_thread(
    state: State<'_, AppState>,
    thread_id: String,
    name: String,
) -> Result<(), String> {
    client(&state)?
        .request(
            "thread/name/set",
            json!({ "threadId": thread_id, "name": name }),
        )
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn bridge_compact_thread(
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<(), String> {
    client(&state)?
        .request("thread/compact/start", json!({ "threadId": thread_id }))
        .await
        .map(|_| ())
}

/// 回滚会话历史到某一回之前（03 号文件）。
///
/// `before_turn_id` 是**被排除**的那一回——它与之后的每一回都被替换掉。
///
/// 协议文档措辞很明确，值得抄进注释：**只改持久化的对话历史，不回滚本地
/// 文件改动**。所以界面上要提示用户"代码还在"，否则他会以为白干了。
///
/// 应答里的 `turns` 总是空的；补历史用返回的两个游标。
#[tauri::command]
pub async fn bridge_thread_revert(
    state: State<'_, AppState>,
    thread_id: String,
    before_turn_id: String,
) -> Result<Value, String> {
    let client = client(&state)?;
    let resp = client
        .request(
            "thread/revert",
            json!({ "threadId": thread_id, "beforeTurnId": before_turn_id }),
        )
        .await?;
    Ok(json!({
        "thread": resp.get("thread").unwrap_or(&Value::Null),
        "turnsBackwardsCursor": resp.get("turnsBackwardsCursor").unwrap_or(&Value::Null),
        "itemsBackwardsCursor": resp.get("itemsBackwardsCursor").unwrap_or(&Value::Null),
    }))
}
