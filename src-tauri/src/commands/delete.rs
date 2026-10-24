//! 会话删除：单个、批量、以及"正在运行的会话先打断再删"的兜底。
//!
//! 单独成文件是因为这里有整套删除语义（重试 + 错误翻译），
//! 混在 threads.rs 里会让那份清单失去可读性。

use serde_json::{json, Value};
use std::sync::Arc;
use tauri::State;

use super::client;
use crate::codex::CodexClient;
use crate::AppState;

/// 中断是异步落地的，太快重试仍会被拒——这个间隔是试出来的，不是随意的。
const INTERRUPT_SETTLE: std::time::Duration = std::time::Duration::from_millis(200);

#[tauri::command]
pub async fn bridge_delete_thread(
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<(), String> {
    let client = client(&state)?;
    delete_thread(&client, &thread_id).await
}

/**
 * 删一个会话。
 *
 * codex 拒绝删除正在跑的会话——这是最容易撞上的坑（"我要删的会话删不掉"）。
 * 命中运行中的回合时先打断再重试一次：用户点删除的意图很明确，不该让他
 * 先去按停止再回来删一遍。
 */
pub async fn delete_thread(client: &Arc<CodexClient>, thread_id: &str) -> Result<(), String> {
    let params = json!({ "threadId": thread_id });
    let first = match client.request("thread/delete", params.clone()).await {
        Ok(_) => return Ok(()),
        Err(err) => err,
    };
    // 只看**这个**线程在不在跑。以前这里读全局单槽位，于是子代理在跑的时候，
    // 删主会话会被判成"没在跑"而直接返回 codex 的原始错误——用户看到的是
    // 一句莫名的话，而真正的原因是另一个线程正忙着。
    let Some(turn_id) = client.active_turn_of(thread_id) else {
        return Err(delete_hint(&first));
    };
    client
        .request(
            "turn/interrupt",
            json!({ "threadId": thread_id, "turnId": turn_id }),
        )
        .await
        .map_err(|e| format!("无法停止正在运行的会话：{e}"))?;
    tokio::time::sleep(INTERRUPT_SETTLE).await;
    client
        .request("thread/delete", params)
        .await
        .map(|_| ())
        .map_err(|err| delete_hint(&err))
}

/// codex 的原话通常是英文 JSON-RPC 错误，这里补一句用户能照做的下一步。
fn delete_hint(err: &str) -> String {
    let lowered = err.to_lowercase();
    if lowered.contains("in progress") || lowered.contains("running") || lowered.contains("active")
    {
        format!("会话正在运行，已尝试停止仍无法删除：{err}")
    } else {
        format!("删除失败：{err}")
    }
}

/// 批量删除会话：逐个删，单个失败不影响其余。
/// 返回 deleted / failed 两组，界面据此如实回报，不会因为一个失败就前功尽弃。
#[tauri::command]
pub async fn bridge_threads_batch_delete(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<Value, String> {
    let client = client(&state)?;
    let mut deleted = Vec::new();
    let mut failed = Vec::new();
    for id in ids {
        match delete_thread(&client, &id).await {
            Ok(()) => deleted.push(id),
            Err(error) => failed.push(json!({ "id": id, "error": error })),
        }
    }
    Ok(json!({ "deleted": deleted, "failed": failed }))
}
