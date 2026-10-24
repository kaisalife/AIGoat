//! server→client 请求 → 界面事件的映射。
//!
//! 与通知通道（`map/`）分开：请求**必须应答**，通知不用。所以这里的每一条
//! 都要在前端找到配对的应答命令，配不上就是 bug（见 00 号文件断点 1：
//! `item/tool/call` 曾经只插占位永不应答，客户端工具闭环是断的）。
//!
//! 三类请求：
//! - **审批**（5 个方法）→ `approvalRequested` → `bridge_respond_approval`
//! - **客户端工具**（`item/tool/call`）→ `toolCallRequested`
//!   → `bridge_respond_tool_result`（成功）/ `bridge_respond_error`（失败）
//! - **向用户提问**（`item/tool/requestUserInput`、`mcpServer/elicitation/request`）
//!   → 各自专属事件 → `bridge_respond_user_input` / `bridge_respond_elicitation`
//!
//! 专属事件与泛化的 `hostCapabilityRequested` 分开：这两类要展示题目、收集
//! 答案，泛化通道只会显示"宿主尚未实现能力请求 X"，用户没法作答。

use serde_json::{json, Value};

/// 映射成界面事件。返回 None = 未识别的宿主能力（走泛化通道）。
pub fn map_server_request(method: &str, params: &Value, id: &Value) -> Option<Value> {
    if let Some(event) = approval(method, params, id) {
        return Some(event);
    }
    user_input(method, params, id)
}

fn approval(method: &str, p: &Value, id: &Value) -> Option<Value> {
    let event = match method {
        "item/commandExecution/requestApproval" => json!({
            "type": "approvalRequested",
            "threadId": p.get("threadId"),
            "requestId": id,
            "approvalKind": "commandExecution",
            "itemId": p.get("itemId"),
            "reason": p.get("reason"),
            "command": p.get("command"),
            "cwd": p.get("cwd"),
        }),
        "item/fileChange/requestApproval" => json!({
            "type": "approvalRequested",
            "threadId": p.get("threadId"),
            "requestId": id,
            "approvalKind": "fileChange",
            "itemId": p.get("itemId"),
            "reason": p.get("reason"),
        }),
        "item/permissions/requestApproval" => json!({
            "type": "approvalRequested",
            "threadId": p.get("threadId"),
            "requestId": id,
            "approvalKind": "permissions",
            "itemId": p.get("itemId"),
            "reason": p.get("reason"),
            "cwd": p.get("cwd"),
            // 请求里带的面板内容一并透出，界面才知道"批什么"
            "permissions": p.get("permissions"),
        }),
        // legacy 方法名：参数形状不同（conversationId / callId / command 数组）。
        "execCommandApproval" => json!({
            "type": "approvalRequested",
            "threadId": p.get("conversationId"),
            "requestId": id,
            "approvalKind": "commandExecution",
            "itemId": p.get("callId"),
            "reason": p.get("reason"),
            "command": p.get("command").map(join_command),
            "cwd": p.get("cwd"),
        }),
        "applyPatchApproval" => json!({
            "type": "approvalRequested",
            "threadId": p.get("conversationId"),
            "requestId": id,
            "approvalKind": "fileChange",
            "itemId": p.get("callId"),
            "reason": p.get("reason"),
        }),
        _ => return None,
    };
    Some(event)
}

/// 客户端工具调用 + 向用户提问。这两类都要求宿主真的动手。
fn user_input(method: &str, p: &Value, id: &Value) -> Option<Value> {
    let event = match method {
        "item/tool/call" => json!({
            "type": "toolCallRequested",
            "threadId": p.get("threadId"),
            "turnId": p.get("turnId"),
            "requestId": id,
            "callId": p.get("callId"),
            "tool": p.get("tool"),
            "namespace": p.get("namespace"),
            "arguments": p.get("arguments"),
        }),
        "item/tool/requestUserInput" => json!({
            "type": "userInputRequested",
            "threadId": p.get("threadId"),
            "turnId": p.get("turnId"),
            "requestId": id,
            "itemId": p.get("itemId"),
            "questions": p.get("questions").unwrap_or(&json!([])),
            "isBlocking": p.get("isBlocking").unwrap_or(&json!(true)),
            "autoResolutionMs": p.get("autoResolutionMs"),
        }),
        "mcpServer/elicitation/request" => json!({
            "type": "elicitationRequested",
            "threadId": p.get("threadId"),
            "turnId": p.get("turnId"),
            "requestId": id,
            "serverName": p.get("serverName").or_else(|| p.get("name")),
            "message": p.get("message"),
            "requestedSchema": p.get("requestedSchema"),
        }),
        _ => return None,
    };
    Some(event)
}

/// legacy 审批的 command 是数组（argv），界面要一行可读文本。
fn join_command(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::String(
            items
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(" "),
        ),
        other => other.clone(),
    }
}

/// 没实现的宿主能力：明确告知，绝不假装成功。
pub fn host_capability(method: &str, id: &Value) -> Value {
    json!({
        "type": "hostCapabilityRequested",
        "requestId": id,
        "method": method,
        "reason": Value::Null,
    })
}
