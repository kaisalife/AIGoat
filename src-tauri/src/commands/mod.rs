//! Tauri 命令层：前端 `bridge_*` 命令的实现。
//!
//! 每个命令 = 一次 codex app-server 调用 + 一层形状映射。
//! 字段名与 `web/src/bridge/client.ts` 的返回类型严格对齐。
//!
//! 按职责分组（≤200 行约束见 docs/17）：
//! - `threads.rs`      线程的增删改查、归档、改名、压缩
//! - `delete.rs`       单个/批量删除，含"运行中先打断"的兜底
//! - `turns.rs`        回合（发消息/打断/steer）与 server 请求应答
//! - `review.rs`       复核、权限档位、沙箱就绪
//! - `workspaces.rs`   工作区登记与切换
//! - `settings_cmds.rs` 模型配置、通用偏好、ui-state.json
//! - `registry.rs`     子 Agent（AF 规范注册表）
//! - `resources.rs`    MCP/技能/钩子/config 只读展示
//! - `fs_cmds.rs`      本地文件读写

use serde_json::{json, to_value, Value};
use std::sync::Arc;
use tauri::State;

use crate::codex::CodexClient;
use crate::settings;
use crate::AppState;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ThreadSummary<'a> {
    id: &'a Value,
    model: &'a Value,
    preview: &'a Value,
    updated_at: Option<i64>,
    status: Value,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ThreadFull<'a> {
    id: &'a Value,
    path: &'a Value,
    model: &'a Value,
    created_at: Option<i64>,
    updated_at: Option<i64>,
    preview: &'a Value,
}

pub mod delete;
pub mod fs_cmds;
mod goal;
mod ledger;
pub mod registry;
pub mod resources;
pub mod review;
pub mod settings_cmds;
mod terminal;
pub mod threads;
pub mod turns;
mod verdict;
pub mod workspaces;

// 重新导出：main.rs 的 generate_handler! 按 `commands::bridge_*` 找命令。
pub use delete::*;
pub use fs_cmds::*;
pub use goal::*;
pub use ledger::*;
pub use registry::*;
pub use resources::*;
pub use review::*;
pub use settings_cmds::*;
pub use terminal::*;
pub use threads::*;
pub use turns::*;
pub use verdict::*;
pub use workspaces::*;

/// 取已连接的 codex 客户端。没连接就报错——不静默去 spawn，
/// 否则每个命令都会拖起一个新子进程。
pub(super) fn client(state: &AppState) -> Result<Arc<CodexClient>, String> {
    state
        .client
        .lock()
        .map_err(|e| format!("client lock poisoned: {e}"))?
        .clone()
        .ok_or_else(|| "尚未连接 codex app-server".to_string())
}

/// 取 settings 的可变借用。统一处理 poisoning，避免每个调用点都写一遍。
pub(super) fn with_settings<F, R>(state: &AppState, f: F) -> Result<R, String>
where
    F: FnOnce(&mut settings::Settings) -> R,
{
    let mut guard = state
        .settings
        .lock()
        .map_err(|e| format!("settings lock poisoned: {e}"))?;
    Ok(f(&mut guard))
}

/// Thread → 前端 ThreadSummary（updatedAt 从秒转毫秒）。
pub(super) fn thread_summary(thread: &Value) -> Value {
    let summary = ThreadSummary {
        id: thread.get("id").unwrap_or(&Value::Null),
        model: thread.get("model").unwrap_or(&Value::Null),
        preview: thread.get("preview").unwrap_or(&Value::Null),
        updated_at: thread
            .get("updatedAt")
            .and_then(Value::as_i64)
            .map(|s| s * 1000),
        status: status_payload(thread.get("status")),
    };
    to_value(summary).unwrap()
}

/// `ThreadStatus`（内嵌 tag 形状）→ 前端的 `{type, activeFlags}`。
fn status_payload(status: Option<&Value>) -> Value {
    let Some(status) = status else {
        return Value::Null;
    };
    let kind = status.get("type").and_then(Value::as_str).unwrap_or("idle");
    let mut out = json!({ "type": kind });
    if let Some(flags) = status.get("activeFlags") {
        out["activeFlags"] = flags.clone();
    }
    out
}

/// Thread → 前端 Thread（时间转毫秒，补 path）。
pub(super) fn thread_full(thread: &Value) -> Value {
    let full = ThreadFull {
        id: thread.get("id").unwrap_or(&Value::Null),
        path: thread.get("path").unwrap_or(&Value::Null),
        model: thread.get("model").unwrap_or(&Value::Null),
        created_at: thread
            .get("createdAt")
            .and_then(Value::as_i64)
            .map(|s| s * 1000),
        updated_at: thread
            .get("updatedAt")
            .and_then(Value::as_i64)
            .map(|s| s * 1000),
        preview: thread.get("preview").unwrap_or(&Value::Null),
    };
    to_value(full).unwrap()
}

/// 握手信息 → 前端 ConnectInfo。
pub(super) fn connect_info_json(client: &Arc<CodexClient>) -> Result<Value, String> {
    let info = client
        .connect_info()
        .ok_or_else(|| "initialize 未完成".to_string())?;
    let home_dir = std::env::var("USERPROFILE").unwrap_or_default();
    Ok(json!({
        "userAgent": info.user_agent,
        "codexHome": info.codex_home,
        "platformFamily": info.platform_family,
        "platformOs": info.platform_os,
        "homeDir": home_dir,
    }))
}

/// 懒启动连接：首次 spawn codex app-server 并握手，已连接则复用。
///
/// **复用前先验活**：codex 子进程可能在运行中崩溃 / 被外部杀掉，此时
/// `state.client` 里那根管道已断。直接复用会让"重新连接"看着成功、之后
/// 每个请求都失败——所以死连接一律丢弃并重新 spawn。
#[tauri::command]
pub async fn bridge_connect(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let existing = state
        .client
        .lock()
        .map_err(|e| format!("client lock poisoned: {e}"))?
        .clone();
    if let Some(client) = existing {
        if client.is_alive() {
            return connect_info_json(&client);
        }
        // 死连接：先摘掉，再 drop（Drop 回收子进程与线程）。
        *state
            .client
            .lock()
            .map_err(|e| format!("client lock poisoned: {e}"))? = None;
        drop(client);
    }
    let settings = state
        .settings
        .lock()
        .map_err(|e| format!("settings lock poisoned: {e}"))?
        .clone();
    let client = CodexClient::launch_and_connect(app.clone(), &settings).await?;
    *state
        .client
        .lock()
        .map_err(|e| format!("client lock poisoned: {e}"))? = Some(client.clone());
    connect_info_json(&client)
}
