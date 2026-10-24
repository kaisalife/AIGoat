//! thread/resume 的历史回放：把 `Thread.turns[].items[]` 压成消息流条目。
//!
//! 与 `threads.rs` 分开是因为它面向的是**另一个入口**：`thread/start` /
//! `thread/resume` 的应答（一次性的整体快照），而不是通知流。
//! 两者形状不同（数组 vs 单事件），合成一个文件会让"流式增量"和
//! "历史快照"两种心智模型混在一起。

use serde_json::{json, Value};

use super::item_kinds::map_changes;

pub fn map_history(turns: &Value) -> Value {
    let mut entries = Vec::new();
    let Some(turns) = turns.as_array() else {
        return Value::Array(entries);
    };
    for turn in turns {
        let Some(items) = turn.get("items").and_then(Value::as_array) else {
            continue;
        };
        for item in items {
            if let Some(entry) = history_entry(item) {
                entries.push(entry);
            }
        }
    }
    Value::Array(entries)
}

/// 单个历史 item → 消息流条目。未知类型返回 None（跳过，不塞占位）。
///
/// **必须与前端 `baselineMap.ts` 的 `mapItem` 覆盖同一组类型**：两边都是
/// 「把一段历史变成消息流条目」，一边服务 resume 回放、一边服务重连基线。
/// 之前这里只映射了 8 类，动态/协作工具、图片、压缩、子代理活动、复核模式、
/// sleep 全被丢掉——于是切会话（resume）后这些内容消失，重连后才又出现。
fn history_entry(item: &Value) -> Option<Value> {
    let kind = item.get("type").and_then(Value::as_str)?;
    let entry = match kind {
        "userMessage" => json!({ "kind": "user", "text": flatten_content(item.get("content")) }),
        "agentMessage" => json!({ "kind": "assistant", "text": text_of(item, "text") }),
        "reasoning" => json!({ "kind": "reasoning", "text": reasoning_text(item) }),
        "commandExecution" => json!({
            "kind": "tool",
            "toolKind": "command",
            "name": text_of(item, "command"),
            "status": norm_status(item),
            "output": text_of(item, "aggregatedOutput"),
            "exitCode": item.get("exitCode"),
            "durationMs": item.get("durationMs"),
        }),
        "mcpToolCall" => json!({
            "kind": "tool",
            "toolKind": "mcp",
            "name": text_of(item, "tool"),
            "status": norm_status(item),
            // result 可能是对象，界面按 JSON 文本显示。
            "output": item
                .get("result")
                .cloned()
                .or_else(|| item.get("error").cloned())
                .unwrap_or(json!("")),
        }),
        "dynamicToolCall" => json!({
            "kind": "tool",
            "toolKind": "dynamicTool",
            "name": text_of(item, "tool"),
            "status": norm_status(item),
            "output": content_items_text(item.get("contentItems")),
        }),
        "collabAgentToolCall" => json!({
            "kind": "tool",
            "toolKind": "collabAgent",
            "name": text_of(item, "tool"),
            "status": norm_status(item),
            "output": "",
        }),
        "webSearch" => json!({
            "kind": "tool",
            "toolKind": "webSearch",
            "name": "webSearch",
            "status": "completed",
            "output": "",
        }),
        "fileChange" => json!({
            "kind": "fileEdit",
            "changes": map_changes(item.get("changes")),
            "status": text_of(item, "status"),
        }),
        "imageView" => json!({
            "kind": "imageView",
            "path": text_of(item, "path"),
        }),
        "imageGeneration" => json!({
            "kind": "imageGeneration",
            "status": text_of(item, "status"),
            "revisedPrompt": item.get("revisedPrompt"),
            "result": item.get("result"),
            "savedPath": item.get("savedPath"),
            "failure": item.get("failure"),
        }),
        "contextCompaction" => json!({
            "kind": "compaction",
            "byUser": false,
            "summarizedCount": Value::Null,
        }),
        "subAgentActivity" => json!({
            "kind": "subAgent",
            "agentThreadId": text_of(item, "agentThreadId"),
            "agentPath": text_of(item, "agentPath"),
            "activity": text_of(item, "kind"),
        }),
        "enteredReviewMode" | "exitedReviewMode" => json!({
            "kind": "reviewMode",
            "mode": if kind == "enteredReviewMode" { "entered" } else { "exited" },
            "review": text_of(item, "review"),
        }),
        "sleep" => json!({
            "kind": "notice",
            "level": "info",
            "text": format!(
                "Agent 主动等待 {}s",
                item.get("durationMs").and_then(Value::as_f64).unwrap_or(0.0) / 1000.0
            ),
        }),
        // 计划正文走右栏的 PlanDocTab，不进消息流——但**必须**带出来。
        // 丢掉的话 `turn.plan` 只由实时 planUpdated/planDelta 填，于是切会话、
        // 重连之后计划面板一律空白，而计划明明还在会话里。
        "plan" => json!({
            "kind": "plan",
            "text": text_of(item, "text"),
        }),
        _ => return None,
    };
    Some(entry)
}

/// 协议工具状态 → `ToolStatus`。缺省与未知值都按 `completed`——它最不容易
/// 让卡片卡在转圈上（空串更糟：它会落到联合类型之外）。
fn norm_status(item: &Value) -> Value {
    match item.get("status").and_then(Value::as_str) {
        Some("inProgress") | Some("in_progress") => json!("inProgress"),
        Some("failed") | Some("error") => json!("failed"),
        Some("declined") => json!("declined"),
        _ => json!("completed"),
    }
}

/// `dynamicToolCall` 的 `contentItems` 是结构化数组，历史条目只要可显示文本。
fn content_items_text(value: Option<&Value>) -> Value {
    let Some(Value::Array(items)) = value else {
        return json!("");
    };
    let parts: Vec<String> = items
        .iter()
        .filter_map(|it| it.get("text").and_then(Value::as_str).map(str::to_string))
        .collect();
    Value::String(parts.join("\n"))
}

fn text_of(item: &Value, key: &str) -> Value {
    item.get(key).cloned().unwrap_or(json!(""))
}

/// 推理的历史形态：`summary` 是分段数组，正文在 `content`。
/// 两段都拼上——只取一半会让回放后的推理少一大截。
///
/// `content` **按字符串或字符串数组都认**：协议这一项两种形态都出现过，
/// 而前端 `baselineMap.ts` 的同名映射是另一边。两边只要有一边认死一种形态，
/// 「切会话回放」与「重连基线」就会长得不一样（一边丢正文）。所以两边都
/// 放宽，消除这种可能的分歧。
fn reasoning_text(item: &Value) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(Value::Array(summary)) = item.get("summary") {
        for part in summary {
            if let Some(s) = part.as_str() {
                parts.push(s.to_string());
            }
        }
    }
    match item.get("content") {
        Some(Value::String(s)) => parts.push(s.clone()),
        Some(Value::Array(arr)) => {
            for part in arr {
                if let Some(s) = part.as_str() {
                    parts.push(s.to_string());
                }
            }
        }
        _ => {}
    }
    parts.join("\n")
}

/// userMessage 的 content 是 UserInput 数组，界面只要纯文本。
fn flatten_content(content: Option<&Value>) -> Value {
    let mut parts: Vec<String> = Vec::new();
    if let Some(Value::Array(items)) = content {
        for item in items {
            if let Some(text) = item.get("text").and_then(Value::as_str) {
                parts.push(text.to_string());
            }
        }
    }
    Value::String(parts.join("\n"))
}
