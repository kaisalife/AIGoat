//! 目标（Goal，07 号板块）与附件（Attachment，11 号板块）的命令。
//!
//! ## Goal 的三态语义（17 号文件 §5.3 已核实）
//!
//! `ThreadGoalStatus` 是枚举 `active | paused | blocked | usageLimited |
//! budgetLimited | complete`——**没有 `paused` 布尔字段**，`paused` 是 status
//! 的一个取值。所以暂停按钮写 `set { status: "paused" }`，不是
//! `set { paused: true }`。
//!
//! `ThreadGoalSetParams` 的三个字段（objective / status / tokenBudget）
//! 都可选且可为 null，而 **null 的语义是"不动它"，不是"清空"**——想清空
//! 得用 `clear`。这层区别很容易踩，所以在前端也写了一份注释。

use serde_json::{json, Value};
use tauri::State;

/// 附件列表默认分页大小。
const DEFAULT_ATTACHMENT_LIMIT: u64 = 100;

use super::client;
use crate::AppState;

/// 读当前目标。没有目标时返回 `{goal: null}`，不是报错。
#[tauri::command]
pub async fn bridge_goal_get(
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<Value, String> {
    let client = client(&state)?;
    let resp = client
        .request("thread/goal/get", json!({ "threadId": thread_id }))
        .await?;
    // 应答形状核实过是 { goal: Goal | null }；这里只把 goal 提上来，
    // 前端不必知道它包了一层。
    Ok(resp.get("goal").unwrap_or(&Value::Null).clone())
}

/// 设置目标。三个字段都是"给了才改"。
///
/// 目标被改动后 codex 会继续跑向它——这是 Goal 的全部意义，
/// 所以这里**不**附带任何"打断当前回合"的行为。
#[tauri::command]
pub async fn bridge_goal_set(
    state: State<'_, AppState>,
    thread_id: String,
    objective: Option<String>,
    status: Option<String>,
    token_budget: Option<u64>,
) -> Result<Value, String> {
    let mut params = json!({ "threadId": thread_id });
    if let Some(objective) = objective {
        params["objective"] = json!(objective);
    }
    if let Some(status) = status {
        // 不在这里校验取值：协议才是权威，壳替它猜反而会在上游加枚举时卡住。
        params["status"] = json!(status);
    }
    if let Some(token_budget) = token_budget {
        params["tokenBudget"] = json!(token_budget);
    }
    client(&state)?
        .request("thread/goal/set", params)
        .await
        .map(|_| json!({ "ok": true }))
}

/// 清除目标。`threadEvent { kind: 'goalCleared' }` 随后会到（06 号板块已映射）。
#[tauri::command]
pub async fn bridge_goal_clear(
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<(), String> {
    client(&state)?
        .request("thread/goal/clear", json!({ "threadId": thread_id }))
        .await
        .map(|_| ())
}

/// 附件列表（会话级画廊，11 号板块）。
///
/// 游标是不透明字符串，原样透传——自己拼会在上游改分页方式时静默坏掉。
#[tauri::command]
pub async fn bridge_attachment_list(
    state: State<'_, AppState>,
    thread_id: String,
    cursor: Option<String>,
    limit: Option<u64>,
) -> Result<Value, String> {
    let mut params =
        json!({ "threadId": thread_id, "limit": limit.unwrap_or(DEFAULT_ATTACHMENT_LIMIT) });
    if let Some(cursor) = cursor {
        params["cursor"] = json!(cursor);
    }
    let client = client(&state)?;
    let resp = client.request("thread/attachment/list", params).await?;
    Ok(json!({
        "attachments": resp.get("data").unwrap_or(&json!([])),
        "nextCursor": resp.get("nextCursor").unwrap_or(&Value::Null),
    }))
}

/// 删除附件。按**稳定标识**（type + identityKey）删，不是按 id——
/// identityKey 就是 §5.1 里那个幂等键。
#[tauri::command]
pub async fn bridge_attachment_remove(
    state: State<'_, AppState>,
    thread_id: String,
    attachment_type: String,
    identity_key: String,
) -> Result<(), String> {
    client(&state)?
        .request(
            "thread/attachment/remove",
            json!({
                "threadId": thread_id,
                "attachmentType": attachment_type,
                "identityKey": identity_key,
            }),
        )
        .await
        .map(|_| ())
}

/// 登记附件。
///
/// **payload 是 `JsonValue`，由 `attachmentType` 决定形状**（17 号文件 §5.1
/// 已核实）——不是路径也不是裸 base64。所以宿主只透传，不预读文件、不校验
/// 大小：那是 codex 侧的事，壳硬加校验会在协议升级时变成阻塞点。
#[tauri::command]
pub async fn bridge_attachment_add(
    state: State<'_, AppState>,
    thread_id: String,
    attachment_type: String,
    identity_key: String,
    payload: Value,
) -> Result<Value, String> {
    let client = client(&state)?;
    client
        .request(
            "thread/attachment/add",
            json!({
                "threadId": thread_id,
                "attachmentType": attachment_type,
                "identityKey": identity_key,
                "payload": payload,
            }),
        )
        .await
        .map(|_| json!({ "ok": true }))
}
