//! `item/started` 与 `item/completed` 的映射。
//!
//! 载荷构造在 `item_kinds.rs`，增量流在 `deltas.rs`。本文件只回答一个问题：
//! **哪种 item 在生命周期的哪一侧发不发电**。
//!
//! 返回 `Some(Value::Null)` 表示「这类 item 的这一侧刻意不发事件」，
//! 调用方静默丢弃；返回 `None` 才是真正的未知类型，落 `unhandled` 透传。

use serde_json::{json, Value};

use super::item_kinds as kinds;

pub fn map(method: &str, p: &Value) -> Option<Value> {
    match method {
        "item/started" => map_item_event(p, false),
        "item/completed" => map_item_event(p, true),
        _ => None,
    }
}

pub fn map_item_event(p: &Value, completed: bool) -> Option<Value> {
    let item = p.get("item")?;
    let item_type = item.get("type").and_then(Value::as_str)?;
    let base = json!({
        "threadId": p.get("threadId").unwrap_or(&Value::Null),
        "turnId": p.get("turnId").unwrap_or(&Value::Null),
        "itemId": item.get("id").unwrap_or(&Value::Null),
    });
    // 未见过的 item 类型 = 未建模，落 None 让调用方走 unhandled。
    let mut event = map_typed_item(item_type, item, &base, completed)?;
    // 把公共字段并进事件（itemId 已带，threadId/turnId 需要补齐）。
    if let Value::Object(map) = &mut event {
        map.entry("threadId").or_insert(base["threadId"].clone());
        map.entry("turnId").or_insert(base["turnId"].clone());
    }
    Some(event)
}

fn map_typed_item(item_type: &str, item: &Value, base: &Value, completed: bool) -> Option<Value> {
    let event = match item_type {
        // 正文只在 completed 整段定稿；started 由 delta 流建条目。
        "agentMessage" if completed => json!({
            "type": "textComplete",
            "itemId": base["itemId"],
            "text": item.get("text").unwrap_or(&Value::Null),
        }),
        // 用户消息只回显一次，避免 started/completed 渲染两条。
        "userMessage" if !completed => json!({
            "type": "userMessage",
            "itemId": base["itemId"],
            "content": item.get("content").unwrap_or(&json!([])),
            // 协议在此项上不一定回传，但回传时前端要靠它把本地回显认领掉，
            // 少一次正文匹配（正文重复时会误认领）。必须透传。
            "clientUserMessageId": item.get("clientUserMessageId"),
        }),
        // 推理没有完成事件，靠回合边界收口。这类"另一半"静默丢弃，
        // 不能落进 unhandled——它们是已建模类型，只是这一侧不发事件。
        "userMessage" | "agentMessage" | "reasoning" => Value::Null,

        "commandExecution" => kinds::command_event(item, base, completed),
        "fileChange" if completed => json!({
            "type": "fileEdit",
            "itemId": base["itemId"],
            "changes": kinds::map_changes(item.get("changes")),
            "status": item.get("status").unwrap_or(&json!("completed")),
        }),
        "mcpToolCall" => kinds::mcp_event(item, base, completed),
        "webSearch" => kinds::simple_tool_event(base, completed, "webSearch", "webSearch"),
        "dynamicToolCall" => kinds::dynamic_tool_event(item, base, completed),
        "collabAgentToolCall" => kinds::collab_event(item, base, completed),

        // 子 Agent 只在开始时发一次，避免 started/completed 重复。
        "subAgentActivity" if !completed => json!({
            "type": "subAgentActivity",
            "itemId": base["itemId"],
            "kind": item.get("kind").unwrap_or(&Value::Null),
            "agentThreadId": item.get("agentThreadId").unwrap_or(&Value::Null),
            "agentPath": item.get("agentPath").unwrap_or(&Value::Null),
        }),
        "plan" if completed => json!({
            "type": "planItem",
            "itemId": base["itemId"],
            "text": item.get("text").unwrap_or(&Value::Null),
        }),
        "contextCompaction" if completed => json!({
            "type": "contextCompacted",
            "itemId": base["itemId"],
        }),
        "enteredReviewMode" if !completed => kinds::review_event(item, base, "entered"),
        "exitedReviewMode" if !completed => kinds::review_event(item, base, "exited"),
        "imageView" if !completed => json!({
            "type": "imageView",
            "itemId": base["itemId"],
            "path": item.get("path").unwrap_or(&Value::Null),
        }),
        "imageGeneration" if completed => json!({
            "type": "imageGeneration",
            "itemId": base["itemId"],
            "status": item.get("status").unwrap_or(&Value::Null),
            "revisedPrompt": item.get("revisedPrompt"),
            "result": item.get("result").unwrap_or(&Value::Null),
            "savedPath": item.get("savedPath"),
            // 失败原因必须在实时流里带上：它决定卡片是否显示「生成失败」。
            // 之前只透传了成功路径的字段，导致失败的生成在实时流里看起来和
            // 成功一样（重连基线却带 failure）。
            //
            // 字段集**必须与 `map/history.rs` 的 imageGeneration 一致**（那是
            // 重连基线），否则「刚打开会话」与「重连之后」的图片卡长得不一样。
            // `transparentBackground` 曾只在这里发、基线不发、且前端无人消费，
            // 是半截字段，已移除。
            "failure": item.get("failure"),
        }),
        "hookPrompt" if !completed => json!({
            "type": "hook",
            "itemId": base["itemId"],
            "fragments": item.get("fragments").unwrap_or(&json!([])),
        }),
        "functionCallOutput" if completed => json!({
            "type": "functionCallOutput",
            "itemId": base["itemId"],
            "name": item.get("name").unwrap_or(&Value::Null),
            "namespace": item.get("namespace").unwrap_or(&Value::Null),
            "output": item.get("output").unwrap_or(&Value::Null),
        }),
        // sleep：Agent 主动等待，界面提示一句。
        "sleep" if completed => json!({
            "type": "sleep",
            "itemId": base["itemId"],
            "durationMs": item.get("durationMs").unwrap_or(&json!(0)),
        }),
        // 上面这些类型在「另一半」生命周期刻意不发事件，静默丢弃而不是
        // 冒充未建模通知——未建模只留给真正没见过的类型。
        "subAgentActivity" | "plan" | "contextCompaction" | "enteredReviewMode"
        | "exitedReviewMode" | "imageView" | "imageGeneration" | "hookPrompt"
        | "functionCallOutput" | "sleep" | "fileChange" => Value::Null,
        _ => return None,
    };
    Some(event)
}

pub use kinds::map_changes;
