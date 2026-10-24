//! thread/* 与 turn/* 通知的映射。
//!
//! 回合边界（turn/started|completed）也在这里产出——`codex.rs` 另外用它们
//! 维护 `active_turn`，但事件本身仍走这条通道，避免同一份映射写两遍。
//!
//! 历史回放（`thread/resume` 的应答）在 `history.rs`。

use serde_json::{json, Value};

pub fn map(method: &str, p: &Value) -> Option<Value> {
    let thread_id = || p.get("threadId").unwrap_or(&Value::Null);
    let turn_id = || p.get("turnId").unwrap_or(&Value::Null);

    match method {
        "turn/started" => Some(json!({
            "type": "turnStarted",
            "threadId": thread_id(),
            "turnId": p.pointer("/turn/id"),
        })),
        "turn/completed" => Some(json!({
            "type": "turnComplete",
            "threadId": thread_id(),
            "turnId": p.pointer("/turn/id"),
            "status": p.pointer("/turn/status"),
            "error": p.pointer("/turn/error"),
        })),
        // 失败 / 被打断同样是**回合结束**：`framing.rs` 已经用它们清活跃回合，
        // 但此前没有对应事件，前端收不到 turnComplete，回合就一直不收口
        // （流式正文不冻结、状态点常亮）。这里补成 turnComplete，状态缺省
        // 按方法名兜底。
        "turn/failed" | "turn/interrupted" => {
            let status = p.pointer("/turn/status").cloned().unwrap_or_else(|| {
                json!(if method == "turn/failed" {
                    "failed"
                } else {
                    "interrupted"
                })
            });
            Some(json!({
                "type": "turnComplete",
                "threadId": thread_id(),
                "turnId": p.pointer("/turn/id"),
                "status": status,
                "error": p.pointer("/turn/error"),
            }))
        }
        "turn/plan/updated" => Some(json!({
            "type": "planUpdated",
            "threadId": thread_id(),
            "turnId": turn_id(),
            "explanation": p.get("explanation"),
            "steps": p.get("plan"),
        })),
        "turn/diff/updated" => Some(json!({
            "type": "turnDiffUpdated",
            "threadId": thread_id(),
            "turnId": turn_id(),
            "diff": p.get("diff"),
        })),
        "thread/tokenUsage/updated" => {
            Some(map_token_usage(p, thread_id().clone(), turn_id().clone()))
        }
        // ---------------------------------------------------------------- 目标
        "thread/goal/updated" => Some(goal_event(p, "updated", thread_id().clone())),
        "thread/goal/cleared" => Some(goal_event(p, "cleared", thread_id().clone())),

        // ------------------------------------------------------- 线程生命周期
        "thread/started" => Some(thread_event(p, "started", None)),
        "thread/closed" => Some(thread_event(p, "closed", None)),
        "thread/archived" => Some(thread_event(p, "archived", None)),
        "thread/unarchived" => Some(thread_event(p, "unarchived", None)),
        "thread/deleted" => Some(thread_event(p, "deleted", None)),
        "thread/compacted" => Some(thread_event(p, "compacted", None)),
        "thread/reverted" => Some(thread_event(p, "reverted", None)),
        "thread/queue/changed" => Some(thread_event(p, "queueChanged", None)),
        "thread/name/updated" => Some(thread_event(p, "renamed", p.get("threadName"))),
        "thread/project/updated" => Some(thread_event(p, "projectChanged", p.get("projectId"))),
        "thread/attachment/updated" => Some(attachment_event(p, thread_id().clone())),
        "thread/status/changed" => Some(thread_event(p, "statusChanged", p.get("status"))),
        "thread/settings/updated" => Some(thread_event(p, "settingsChanged", None)),
        "thread/environment/connected" => Some(thread_event(p, "environmentConnected", None)),
        "thread/environment/disconnected" => Some(thread_event(p, "environmentDisconnected", None)),

        // --------------------------------------------------------- 通用提示
        "error" => Some(json!({
            "type": "error",
            "threadId": thread_id(),
            "turnId": turn_id(),
            "message": p.pointer("/error/message"),
            "willRetry": p.get("willRetry").unwrap_or(&json!(false)).clone(),
        })),
        "warning" => Some(json!({
            "type": "warning",
            "threadId": thread_id(),
            "message": p.get("message"),
        })),
        "serverRequest/resolved" => Some(json!({
            "type": "serverRequestResolved",
            "threadId": thread_id(),
            "requestId": p.get("requestId"),
        })),
        _ => None,
    }
}

/// tokenUsage 报的是**本回合累计**（`total`）与最近一次增量（`last`）两套。
/// 界面画的是累计那条——只取 last 会让用量条在每轮开始时突然归零。
fn map_token_usage(p: &Value, thread_id: Value, turn_id: Value) -> Value {
    let total = p
        .pointer("/tokenUsage/total")
        .cloned()
        .unwrap_or(Value::Null);
    json!({
        "type": "tokenUsage",
        "threadId": thread_id,
        "turnId": turn_id,
        "totalTokens": total.get("totalTokens"),
        "inputTokens": total.get("inputTokens"),
        "cachedInputTokens": total.get("cachedInputTokens"),
        "outputTokens": total.get("outputTokens"),
        "reasoningOutputTokens": total.get("reasoningOutputTokens"),
    })
}

/// goal 是整个 Goal 对象（见 07 号文件），整体透传。
/// 前端只取 `text`/`status`/`elapsedMs`，但把对象整体送过去，
/// 上游加字段时前端不用跟着改桥接层。
fn goal_event(p: &Value, kind: &str, thread_id: Value) -> Value {
    json!({
        "type": "goalEvent",
        "threadId": thread_id,
        "turnId": p.get("turnId").unwrap_or(&Value::Null),
        "kind": kind,
        "goal": p.get("goal").unwrap_or(&Value::Null),
    })
}

fn thread_event(p: &Value, kind: &str, extra: Option<&Value>) -> Value {
    let mut event = json!({
        "type": "threadEvent",
        "threadId": p.get("threadId").unwrap_or(&Value::Null),
        "event": { "kind": kind },
    });
    if let Some(extra) = extra {
        match kind {
            "renamed" => event["event"]["threadName"] = extra.clone(),
            "projectChanged" => event["event"]["projectId"] = extra.clone(),
            "statusChanged" => {
                event["event"]["statusType"] = extra.get("type").unwrap_or(&Value::Null).clone();
                event["event"]["activeFlags"] =
                    extra.get("activeFlags").unwrap_or(&json!([])).clone();
            }
            _ => {}
        }
    }
    event
}

/// 附件变更（11 号板块）。附件本体由 `thread/attachment/list` 拉，
/// 这里只送"变了"，让界面去重拉——事件里带全量附件会重复传输。
fn attachment_event(p: &Value, thread_id: Value) -> Value {
    json!({
        "type": "threadEvent",
        "threadId": thread_id,
        "event": {
            "kind": "attachmentChanged",
            "attachmentId": p.pointer("/attachment/id"),
            "attachmentType": p.pointer("/attachment/type"),
            "operation": p.get("operation"),
        },
    })
}
