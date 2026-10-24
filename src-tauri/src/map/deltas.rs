//! item 的**增量流**通知（不是生命周期）。
//!
//! 与 `items.rs` 的分工：那里管 `item/started` / `item/completed` 的
//! 完整状态，这里管一条 item 正在生成时源源不断送来的片段。
//! 分开是因为两边改动频率差很多——生命周期映射几乎不动，增量流跟协议
//! 演进走。

use serde_json::{json, Value};

pub fn map(method: &str, p: &Value) -> Option<Value> {
    let item_id = || p.get("itemId").unwrap_or(&Value::Null);
    let thread_id = || p.get("threadId").unwrap_or(&Value::Null);
    let turn_id = || p.get("turnId").unwrap_or(&Value::Null);

    match method {
        "item/agentMessage/delta" => Some(json!({
            "type": "textDelta",
            "threadId": thread_id(),
            "turnId": turn_id(),
            "itemId": item_id(),
            "delta": p.get("delta"),
        })),
        "item/reasoning/textDelta" => Some(reasoning_delta(p, false)),
        "item/reasoning/summaryTextDelta" => Some(reasoning_delta(p, true)),
        // summary 分段标题（04 号文件）：只带位置不带内容，内容走上面的
        // summaryTextDelta。留着是因为它决定"哪一段推理结束了"。
        "item/reasoning/summaryPartAdded" => Some(json!({
            "type": "reasoningPartAdded",
            "threadId": thread_id(),
            "turnId": turn_id(),
            "itemId": item_id(),
            "summaryIndex": p.get("summaryIndex"),
        })),

        "item/commandExecution/outputDelta" => Some(json!({
            "type": "toolCallDelta",
            "threadId": thread_id(),
            "turnId": turn_id(),
            "itemId": item_id(),
            "stream": "stdout",
            "delta": p.get("delta"),
        })),
        "item/mcpToolCall/progress" => Some(json!({
            // 进度不是输出，单独字段：混进 output 会让"最终结果"被进度文案污染。
            "type": "toolCallDelta",
            "threadId": thread_id(),
            "turnId": turn_id(),
            "itemId": item_id(),
            "stream": "progress",
            "delta": p.get("message"),
        })),
        // 文件变更的补丁增量：并进已有的 fileEdit 条目，不新增消息。
        "item/fileChange/patchUpdated" => Some(json!({
            "type": "fileEditPatch",
            "threadId": thread_id(),
            "turnId": turn_id(),
            "itemId": item_id(),
            "changes": super::items::map_changes(p.get("changes")),
        })),
        // 文件写入的逐行输出：独立事件，界面并进 fileEdit 条目的输出侧。
        "item/fileChange/outputDelta" => Some(json!({
            "type": "fileChangeOutput",
            "threadId": thread_id(),
            "turnId": turn_id(),
            "itemId": item_id(),
            "stream": p.get("stream"),
            "delta": p.get("delta"),
        })),
        "item/plan/delta" => Some(json!({
            "type": "planDelta",
            "threadId": thread_id(),
            "turnId": turn_id(),
            "itemId": item_id(),
            "delta": p.get("delta"),
        })),

        _ => None,
    }
}

fn reasoning_delta(p: &Value, is_summary: bool) -> Value {
    json!({
        "type": "reasoningDelta",
        "threadId": p.get("threadId").unwrap_or(&Value::Null),
        "turnId": p.get("turnId").unwrap_or(&Value::Null),
        "itemId": p.get("itemId").unwrap_or(&Value::Null),
        "delta": p.get("delta"),
        "isSummary": is_summary,
    })
}
