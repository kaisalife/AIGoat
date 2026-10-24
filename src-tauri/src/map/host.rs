//! host / terminal / debug 三条通道。
//!
//! - **host**：宿主侧资源状态（MCP 生命周期、钩子、技能/项目变更、文件监听）。
//!   右栏的 MCP/钩子/技能 tab 直接消费。前端早就有 `HostEvent` 形状，
//!   Rust 侧本期才真正开始产生它。
//! - **terminal**：`command/exec` 与 `process/*` 的输出（10 号板块）。
//!   独立成事件而不并进 host：输出是高频的，并进去会让右栏资源面板
//!   跟着每帧重渲染。
//! - **debug**：原始响应与审核元数据（06 号账本）。不进消息流——
//!   给用户看没意义，但出问题时"上游到底发了什么"是唯一能查的东西。

use serde_json::{json, Value};

pub fn map(method: &str, p: &Value) -> Option<Value> {
    if let Some(event) = host(method, p) {
        return Some(event);
    }
    if let Some(event) = terminal(method, p) {
        return Some(event);
    }
    debug(method, p)
}

fn host(method: &str, p: &Value) -> Option<Value> {
    let (kind, fields): (&str, Value) = match method {
        // MCP 服务器生命周期：右栏 MCP tab 的连接状态来源。
        "mcpServer/startupStatus/updated" => (
            "mcpProgress",
            json!({
                "name": p.get("name"),
                "status": p.get("status"),
                "error": p.get("error"),
                "threadId": p.get("threadId"),
            }),
        ),
        "mcpServer/event/stream/notification" => (
            "mcpProgress",
            json!({
                "name": p.get("name"),
                "method": p.get("method"),
                "params": p.get("params"),
                "threadId": p.get("threadId"),
            }),
        ),
        // OAuth 一期不接（17 号文件明确不接），但登录完成仍要报一声：
        // 用户点了授权之后看不到任何反馈会以为按钮坏了。
        "mcpServer/oauthLogin/completed" => (
            "mcpProgress",
            json!({
                "name": p.get("name"),
                "status": p.get("success").and_then(Value::as_bool).map(|b| if b { "ok" } else { "failed" }),
                "error": p.get("error"),
                "threadId": p.get("threadId"),
            }),
        ),
        // 钩子：started/completed 成对，右栏显示"正在跑哪个钩子"。
        "hook/started" => (
            "output",
            json!({
                "threadId": p.get("threadId"),
                "turnId": p.get("turnId"),
                "runId": p.get("runId"),
                "eventName": p.get("eventName"),
                "handlerType": p.get("handlerType"),
                "status": p.get("status"),
                "phase": "started",
                "startedAt": p.get("startedAt"),
            }),
        ),
        "hook/completed" => (
            "output",
            json!({
                "threadId": p.get("threadId"),
                "turnId": p.get("turnId"),
                "runId": p.get("runId"),
                "eventName": p.get("eventName"),
                "handlerType": p.get("handlerType"),
                "status": p.get("status"),
                "statusMessage": p.get("statusMessage"),
                "durationMs": p.get("durationMs"),
                "phase": "completed",
                "completedAt": p.get("completedAt"),
            }),
        ),
        // 技能/项目清单变化：右栏要提示刷新。
        "skills/changed" => (
            "skillsChanged",
            json!({ "cwd": p.get("cwd"), "threadId": p.get("threadId") }),
        ),
        "project/changed" => (
            "projectChanged",
            json!({ "projectId": p.get("projectId"), "threadId": p.get("threadId") }),
        ),
        // 工作区文件监听。与本地 bridge_fs_* 不是一回事：那是命令，
        // 这是 codex 告诉我们它侧的文件变了。
        "fs/changed" => (
            "fsChanged",
            json!({
                "watchId": p.get("watchId"),
                "changedPaths": p.get("changedPaths"),
                "changeType": p.get("changeType"),
                "threadId": p.get("threadId"),
            }),
        ),
        // 命令行交互（用户在终端里输入了东西）：10 号板块用来同步 TTY。
        "item/commandExecution/terminalInteraction" => (
            "terminalInteraction",
            json!({
                "threadId": p.get("threadId"),
                "turnId": p.get("turnId"),
                "itemId": p.get("itemId"),
                "stdin": p.get("stdin"),
            }),
        ),
        // 模糊文件搜索会话：08 号文件二期消费，先透传不丢。
        "fuzzyFileSearch/sessionUpdated" => (
            "output",
            json!({
                "sessionId": p.get("sessionId"),
                "query": p.get("query"),
                "files": p.get("files"),
                "phase": "updated",
                "threadId": p.get("threadId"),
            }),
        ),
        "fuzzyFileSearch/sessionCompleted" => (
            "output",
            json!({
                "sessionId": p.get("sessionId"),
                "query": p.get("query"),
                "files": p.get("files"),
                "phase": "completed",
                "threadId": p.get("threadId"),
            }),
        ),
        _ => return None,
    };
    Some(crate::map::wrap("hostEvent", method, kind, fields))
}

fn terminal(method: &str, p: &Value) -> Option<Value> {
    let event = match method {
        "command/exec/outputDelta" => json!({
            "type": "terminalEvent",
            "execId": p.get("execId").or_else(|| p.get("id")),
            "threadId": p.get("threadId"),
            "turnId": p.get("turnId"),
            "stream": p.get("stream"),
            "delta": p.get("delta"),
            "capReached": p.get("capReached"),
        }),
        "process/outputDelta" => json!({
            "type": "terminalEvent",
            "execId": p.get("processId").or_else(|| p.get("id")),
            "threadId": p.get("threadId"),
            "stream": p.get("stream"),
            "delta": p.get("delta"),
            "capReached": p.get("capReached"),
            "origin": "process",
        }),
        "process/exited" => json!({
            "type": "terminalEvent",
            "execId": p.get("processId").or_else(|| p.get("id")),
            "threadId": p.get("threadId"),
            "exitCode": p.get("exitCode"),
            "exited": true,
        }),
        _ => return None,
    };
    Some(event)
}

fn debug(method: &str, p: &Value) -> Option<Value> {
    let payload = match method {
        "rawResponse/completed" => {
            json!({ "responseId": p.get("responseId"), "response": p.get("response") })
        }
        "rawResponseItem/completed" => {
            json!({ "responseId": p.get("responseId"), "item": p.get("item") })
        }
        "turn/moderationMetadata" => {
            json!({ "usage": p.get("usage"), "usageMetadata": p.get("usageMetadata") })
        }
        _ => return None,
    };
    Some(json!({
        "type": "debugEvent",
        "method": method,
        "threadId": p.get("threadId").unwrap_or(&Value::Null),
        "turnId": p.get("turnId").unwrap_or(&Value::Null),
        "payload": payload,
    }))
}
