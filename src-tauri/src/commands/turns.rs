//! 回合命令：发消息、打断、steer（追加指令），以及 server 请求的应答。
//!
//! 应答命令（respond_*）是 client 工具闭环的地基：codex 发来请求后前端
//! 必须回一个结果，否则那一轮会一直挂在那里（见 docs/17 的断点 1）。

use serde_json::{json, Value};
use tauri::State;

use super::client;
use crate::AppState;

/// 发消息。
///
/// `input` 原样透传——协议里它不是纯文本，而是 `UserInput[]`：
/// `{type:"text"}` / `{type:"localImage", path}` / `{type:"skill", name, path}` /
/// `{type:"mention", ...}` 都在其中。**壳不解析它**：形状由前端决定、
/// 由 codex 解释，壳在这里做转换只会多一处要同步的地方（11 号板块的
/// 图片附件就靠 `localImage` 直挂，不需要先 `thread/attachment/add`）。
///
/// `client_user_message_id` 是协议自带的客户端消息 id（`turn/start` 参数）。
/// 带上它，服务端就能把这条消息与本地回显对上；不带也不影响功能，
/// 前端仍会用正文匹配兜底。
#[tauri::command]
pub async fn bridge_send_message(
    state: State<'_, AppState>,
    thread_id: String,
    input: Value,
    client_user_message_id: Option<String>,
    approval_policy: Option<Value>,
    sandbox_policy: Option<Value>,
) -> Result<Value, String> {
    let client = client(&state)?;
    let mut params = json!({
        "threadId": thread_id,
        "input": input,
    });
    if let Some(id) = client_user_message_id.filter(|s| !s.is_empty()) {
        params["clientUserMessageId"] = json!(id);
    }
    // 审批与沙箱策略：前端按权限档位算好原样透传。这两个键此前从未被
    // 接收——档位开关因此形同虚设（每次命令都走审批）。
    if let Some(policy) = approval_policy {
        params["approvalPolicy"] = policy;
    }
    if let Some(policy) = sandbox_policy {
        params["sandboxPolicy"] = policy;
    }
    // 推理档位来自当前选中的自定义模型配置；留空则用服务端默认。
    let effort = crate::commands::with_settings(&state, |settings| {
        settings
            .active_model()
            .and_then(|m| m.reasoning_effort.clone())
            .filter(|e| !e.trim().is_empty())
    })?;
    if let Some(effort) = effort {
        params["effort"] = json!(effort);
    }
    let resp = client.request("turn/start", params).await?;
    let turn_id = resp
        .pointer("/turn/id")
        .and_then(Value::as_str)
        .ok_or("turn/start 应答缺少 turn.id")?
        .to_string();
    Ok(json!({ "kind": "started", "turnId": turn_id }))
}

/// 打断指定回合。
///
/// `threadId` / `turnId` 由前端传，**必须按它们打断**，不能"打断当前那个"。
/// 子代理在各自线程里并发跑回合时，"当前那个"不等于用户点的那个——
/// 曾经这个命令不带参数、只读单槽位，于是主会话上点停止会打断子代理。
///
/// 没有活跃回合不是错误（幂等）：返回 false 表示什么都没打断。
#[tauri::command]
pub async fn bridge_interrupt(
    state: State<'_, AppState>,
    thread_id: String,
    turn_id: String,
) -> Result<bool, String> {
    let client = client(&state)?;
    // 注册表只用来判断「这一回合还在跑吗」。回合已经结束就返回 false 而不是
    // 去打一发已结束的 interrupt——那多半换来一个看不懂的协议错误。
    // 真正发出去的 turnId 用**前端给的那个**：它就是用户正在看的那个回合。
    if client.active_turn_of(&thread_id).is_none() {
        return Ok(false);
    }
    client
        .request(
            "turn/interrupt",
            json!({ "threadId": thread_id, "turnId": turn_id }),
        )
        .await?;
    Ok(true)
}

/// 运行中追加指令（steer）：不结束当前回合，模型会在下一个决策点读到。
///
/// `expectedTurnId` 是协议的**前置条件**：回合已经变了就会拒绝。这是好事——
/// 它把「追加到已经结束的回合」这种竞态挡在服务端，而不是靠前端猜。
///
/// `input` 原样透传（与 `bridge_send_message` 同理，这里也可能是带图片的
/// `UserInput[]`，不是纯文本）。`client_user_message_id` 一并带上：steer 之后
/// codex 会发正式的 `userMessage`，前端靠这个 id 把本地回显换成那一条。
#[tauri::command]
pub async fn bridge_steer(
    state: State<'_, AppState>,
    thread_id: String,
    turn_id: String,
    input: Value,
    client_user_message_id: Option<String>,
) -> Result<Value, String> {
    let mut params = json!({
        "threadId": thread_id,
        "expectedTurnId": turn_id,
        "input": input,
    });
    if let Some(id) = client_user_message_id.filter(|s| !s.is_empty()) {
        params["clientUserMessageId"] = json!(id);
    }
    let resp = client(&state)?.request("turn/steer", params).await?;
    // 应答是 { turnId }。回传它，前端能在 steer 被拒时知道是"回合已经变了"
    // 而不是笼统的失败。
    Ok(json!({
        "turnId": resp.get("turnId").unwrap_or(&Value::Null)
    }))
}

#[tauri::command]
pub async fn bridge_respond_approval(
    state: State<'_, AppState>,
    request_id: Value,
    decision: String,
) -> Result<(), String> {
    client(&state)?
        .respond_server_request(&request_id, Some(decision), None, None)
        .await
}

#[tauri::command]
pub async fn bridge_respond_tool_result(
    state: State<'_, AppState>,
    request_id: Value,
    content_items: Value,
    success: bool,
) -> Result<(), String> {
    client(&state)?
        .respond_server_request(&request_id, None, Some((content_items, success)), None)
        .await
}

/**
 * 应答 `item/tool/requestUserInput`：题目 id → 用户答案。
 *
 * 单独一条命令而不是复用审批：应答形状完全不同（`{answers}` vs
 * `{decision}`）。混用会被 codex 当成非法应答丢掉——用户点了没反应，
 * 而且那一轮永远挂着。
 */
#[tauri::command]
pub async fn bridge_respond_user_input(
    state: State<'_, AppState>,
    request_id: Value,
    answers: Value,
) -> Result<(), String> {
    client(&state)?
        .respond_user_input(&request_id, answers)
        .await
}

/**
 * 应答 `mcpServer/elicitation/request`。
 *
 * 内容原样透传：应答形状跟着请求里的 `requestedSchema` 走，协议没强制
 * 统一形状，宿主不该替 MCP 服务器猜字段。
 */
#[tauri::command]
pub async fn bridge_respond_elicitation(
    state: State<'_, AppState>,
    request_id: Value,
    content: Value,
) -> Result<(), String> {
    client(&state)?
        .respond_elicitation(&request_id, content)
        .await
}

#[tauri::command]
pub async fn bridge_respond_error(
    state: State<'_, AppState>,
    request_id: Value,
    message: String,
) -> Result<(), String> {
    client(&state)?
        .respond_server_request(&request_id, None, None, Some(message))
        .await
}
