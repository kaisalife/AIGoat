//! item 生命周期事件里**各类型的载荷构造**。
//!
//! 与 `items.rs` 的分工：那里决定「哪种 item 在哪一侧发不发电」，这里只
//! 负责「这类 item 的事件长什么样」。分文件是因为这个文件天生会长——
//! 上游每加一种 item 类型就要在这里加一段构造。

use serde_json::{json, Value};

type Base<'a> = &'a Value;

pub fn command_event(item: &Value, base: Base<'_>, completed: bool) -> Value {
    let name = item.get("command").unwrap_or(&Value::Null);
    let status_fallback = json!("completed");
    if completed {
        json!({
            "type": "toolCallEnd",
            "itemId": base["itemId"],
            "toolKind": "command",
            "name": name,
            "status": item.get("status").unwrap_or(&status_fallback),
            "exitCode": item.get("exitCode"),
            "durationMs": item.get("durationMs"),
            "output": item.get("aggregatedOutput"),
            "error": Value::Null,
        })
    } else {
        json!({
            "type": "toolCallStart",
            "itemId": base["itemId"],
            "toolKind": "command",
            "name": name,
            "input": { "command": item.get("command"), "cwd": item.get("cwd") },
        })
    }
}

pub fn mcp_event(item: &Value, base: Base<'_>, completed: bool) -> Value {
    let name = item.get("tool").unwrap_or(&Value::Null);
    let status_fallback = json!("completed");
    if completed {
        json!({
            "type": "toolCallEnd",
            "itemId": base["itemId"],
            "toolKind": "mcp",
            "name": name,
            "status": item.get("status").unwrap_or(&status_fallback),
            "exitCode": Value::Null,
            "durationMs": item.get("durationMs"),
            // 失败时 result 是空的，错误在 error 上；两者都带上，界面自己挑。
            "output": item
                .get("result")
                .or_else(|| item.get("error"))
                .unwrap_or(&Value::Null),
            "error": item.get("error"),
        })
    } else {
        json!({
            "type": "toolCallStart",
            "itemId": base["itemId"],
            "toolKind": "mcp",
            "name": name,
            "input": {
                "server": item.get("server"),
                "tool": item.get("tool"),
                "arguments": item.get("arguments"),
            },
        })
    }
}

/// 没有专属结构的工具（webSearch 这类）：只有名字，没有参数也没有输出。
pub fn simple_tool_event(base: Base<'_>, completed: bool, tool_kind: &str, name: &str) -> Value {
    if completed {
        json!({
            "type": "toolCallEnd",
            "itemId": base["itemId"],
            "toolKind": tool_kind,
            "name": name,
            "status": "completed",
        })
    } else {
        json!({
            "type": "toolCallStart",
            "itemId": base["itemId"],
            "toolKind": tool_kind,
            "name": name,
        })
    }
}

pub fn dynamic_tool_event(item: &Value, base: Base<'_>, completed: bool) -> Value {
    let name = item.get("tool").unwrap_or(&Value::Null);
    if completed {
        // 协议的 dynamicToolCall **没有 error 字段**（只有 status / contentItems /
        // success / durationMs）。之前这里读 `item.get("error")`，恒为 null。
        //
        // 真正的失败信号是 `success`：它是「跑完了但结果是失败」，与 status 的
        // 「跑到哪了」是两个维度。所以 status 原样透传，另外把
        // `success === false` 折成 failed——不折的话界面会显示「完成」，
        // 而这一次调用其实是失败的（ToolCards 的徽标与 tone 都看 status）。
        let raw = item
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("completed");
        let failed = item.get("success").and_then(Value::as_bool) == Some(false);
        let status = if failed { "failed" } else { raw };
        json!({
            "type": "toolCallEnd",
            "itemId": base["itemId"],
            "toolKind": "dynamicTool",
            "name": name,
            "status": status,
            "durationMs": item.get("durationMs"),
            // contentItems 是数组（{type,text|imageUrl|audioUrl}[]），不是字符串。
            // 前端 ToolEntry.output 声明成 string，但渲染走 JsonBody 的
            // JSON.stringify，所以数组会按 JSON 漂亮地显示出来，不会崩。
            "output": item.get("contentItems"),
            "error": Value::Null,
        })
    } else {
        json!({
            "type": "toolCallStart",
            "itemId": base["itemId"],
            "toolKind": "dynamicTool",
            "name": name,
            "input": item.get("arguments"),
        })
    }
}

pub fn collab_event(item: &Value, base: Base<'_>, completed: bool) -> Value {
    let name = item.get("tool").unwrap_or(&Value::Null);
    let status_fallback = json!("completed");
    if completed {
        json!({
            "type": "toolCallEnd",
            "itemId": base["itemId"],
            "toolKind": "collabAgent",
            "name": name,
            "status": item.get("status").unwrap_or(&status_fallback),
        })
    } else {
        json!({
            "type": "toolCallStart",
            "itemId": base["itemId"],
            "toolKind": "collabAgent",
            "name": name,
            "input": {
                "prompt": item.get("prompt"),
                "receiverThreadIds": item.get("receiverThreadIds"),
            },
        })
    }
}

pub fn review_event(item: &Value, base: Base<'_>, mode: &str) -> Value {
    json!({
        "type": "reviewMode",
        "itemId": base["itemId"],
        "mode": mode,
        "review": item.get("review").unwrap_or(&Value::Null),
    })
}

/// PatchChangeKind 是内嵌 tag 形状（{"type":"add"}），前端要的是扁平 kind 字符串。
pub fn map_changes(changes: Option<&Value>) -> Value {
    let Some(Value::Array(items)) = changes else {
        return json!([]);
    };
    let empty_kind = json!({});
    Value::Array(
        items
            .iter()
            .map(|c| {
                let kind_obj = c.get("kind").unwrap_or(&empty_kind);
                let kind = kind_obj
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or("update");
                json!({
                    "kind": kind,
                    "path": c.get("path").unwrap_or(&Value::Null),
                    "diff": c.get("diff").unwrap_or(&Value::Null),
                    "movePath": kind_obj.get("move_path").unwrap_or(&Value::Null),
                })
            })
            .collect(),
    )
}
