//! Trajectory 账本的翻页来源（06 号板块）。
//!
//! 实时事件走 `agent-event` 流，但**已经结束的会话**那些事件前端没赶上：
//! 打开一个三天前的会话，账本是空的。所以要能从服务端把历史拉回来。
//!
//! 两条命令的形状刻意保持一致（都返回 `{items, nextCursor}`），前端
//! 账本因此能用同一段代码翻页，不用为两种游标各写一套。

use serde_json::{json, Value};
use tauri::State;

use super::client;
use crate::AppState;

/// 单页条数。太大首批渲染慢，太小翻页次数多——200 是个折中值。
const DEFAULT_LIMIT: u64 = 200;

/// 拉一个线程的条目（账本的历史段）。
///
/// `cursor` 透传协议给的**不透明游标**，前端不要自己拼——那是最容易在
/// 上游改分页方式时静默坏掉的地方。
#[tauri::command]
pub async fn bridge_thread_items(
    state: State<'_, AppState>,
    thread_id: String,
    cursor: Option<String>,
    limit: Option<u64>,
    turn_id: Option<String>,
) -> Result<Value, String> {
    let mut params = json!({
        "threadId": thread_id,
        "limit": limit.unwrap_or(DEFAULT_LIMIT),
        // 升序：从最早的开始，账本是 append-only 的时间线
        "sortDirection": "asc",
    });
    if let Some(cursor) = cursor {
        params["cursor"] = json!(cursor);
    }
    // 指定 turnId 时只要那一轮的条目（时序总览按回合切窗时用）
    if let Some(turn_id) = turn_id {
        params["turnId"] = json!(turn_id);
    }
    let client = client(&state)?;
    let resp = client.request("thread/items/list", params).await?;
    Ok(json!({
        "items": resp.get("data").unwrap_or(&json!([])),
        "nextCursor": resp.get("nextCursor").unwrap_or(&Value::Null),
    }))
}

/// 拉一个线程的回合列表（时序总览的回合块）。
///
/// `itemsView` 默认就是 summary：一轮里每个 item 的正文对甘特条没用，
/// 要正文的话前端已经在实时流里收过了。
#[tauri::command]
pub async fn bridge_thread_turns(
    state: State<'_, AppState>,
    thread_id: String,
    cursor: Option<String>,
    limit: Option<u64>,
) -> Result<Value, String> {
    let mut params = json!({
        "threadId": thread_id,
        "limit": limit.unwrap_or(DEFAULT_LIMIT),
        // 降序：最近的回合在前（用户关心"刚才那轮"）
        "sortDirection": "desc",
        "itemsView": "summary",
    });
    if let Some(cursor) = cursor {
        params["cursor"] = json!(cursor);
    }
    let client = client(&state)?;
    let resp = client.request("thread/turns/list", params).await?;
    Ok(json!({
        "turns": resp.get("data").unwrap_or(&json!([])),
        "nextCursor": resp.get("nextCursor").unwrap_or(&Value::Null),
    }))
}
