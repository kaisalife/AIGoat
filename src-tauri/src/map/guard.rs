//! guard 通道：**模型侧发生了什么**。
//!
//! 与 host 通道的界线：host 报「宿主资源的状态」，guard 报「模型/安全
//! 状态的变化」。两者都发给右栏，但用户看到的是两件事——一个是"技能
//! 服务器连上了"，一个是"你选的模型被换掉了"。
//!
//! 前端早就声明了 `GuardEvent` 形状（`web/src/bridge/types/events.ts`），
//! 但 Rust 侧一直不产生它——真源在这里补上。`kind` 就是前端
//! `GuardEventKind` 的成员名，两边一一对应。

use serde_json::{json, Value};

pub fn map(method: &str, p: &Value) -> Option<Value> {
    let (kind, fields): (&str, Value) = match method {
        // 模型被改写：用户选 A 模型，实际跑的是 B。头部徽标必须显示出来。
        "model/rerouted" => (
            "modelRerouted",
            json!({
                "fromModel": p.get("fromModel"),
                "toModel": p.get("toModel"),
                "reason": p.get("reason"),
                "threadId": p.get("threadId"),
                "turnId": p.get("turnId"),
            }),
        ),
        // 模型自检结果（是否走了预期的模型）。
        "model/verification" => (
            "modelVerified",
            json!({
                "success": p.get("success"),
                "error": p.get("error"),
                "model": p.get("model"),
                "verifications": p.get("verifications"),
                "threadId": p.get("threadId"),
            }),
        ),
        // 安全缓冲：内容审核期间界面要显示"缓冲中"而不是"卡住"。
        "model/safetyBuffering/updated" => (
            "safetyBuffering",
            json!({
                "showBufferingUi": p.get("showBufferingUi"),
                "fasterModel": p.get("fasterModel"),
                "threadId": p.get("threadId"),
                "turnId": p.get("turnId"),
            }),
        ),
        "modelProvider/authRecoveryStarted" => (
            "authRecovery",
            json!({
                "provider": p.get("provider"),
                "phase": "started",
                "threadId": p.get("threadId"),
            }),
        ),
        "modelProvider/authRecoveryCompleted" => (
            "authRecovery",
            json!({
                "provider": p.get("provider"),
                "phase": "completed",
                "success": p.get("success"),
                "error": p.get("error"),
                "message": p.get("message"),
                "threadId": p.get("threadId"),
            }),
        ),
        // Windows 沙箱：目录可写性警告要在权限 tab 里显式提示。
        "windows/worldWritableWarning" => (
            "worldWritableWarning",
            json!({
                "samplePaths": p.get("samplePaths"),
                "extraCount": p.get("extraCount"),
                "failedScan": p.get("failedScan"),
                "threadId": p.get("threadId"),
            }),
        ),
        "windowsSandbox/setupCompleted" => (
            "sandboxSetupCompleted",
            json!({
                "success": p.get("success"),
                "error": p.get("error"),
                "threadId": p.get("threadId"),
            }),
        ),
        "autoApprovalReview/strictReviewRequired" => (
            "strictReviewRequired",
            json!({
                "reviewId": p.get("reviewId"),
                "targetItemId": p.get("targetItemId"),
                "riskLevel": p.get("riskLevel"),
                "userAuthorization": p.get("userAuthorization"),
                "rationale": p.get("rationale"),
                "action": p.get("action"),
                "threadId": p.get("threadId"),
                "turnId": p.get("turnId"),
            }),
        ),
        // 自动复核的起止：与 strictReviewRequired 同一组，共三条。
        // 少了起止两条，界面只会在"需要严格复核"那一刻闪一下，
        // 用户不知道复核跑完了没有。
        "item/autoApprovalReview/started" => (
            "review",
            json!({
                "reviewId": p.get("reviewId"),
                "targetItemId": p.get("targetItemId"),
                "phase": "started",
                "startedAtMs": p.get("startedAtMs"),
                "threadId": p.get("threadId"),
                "turnId": p.get("turnId"),
            }),
        ),
        "item/autoApprovalReview/completed" => (
            "review",
            json!({
                "reviewId": p.get("reviewId"),
                "targetItemId": p.get("targetItemId"),
                "phase": "completed",
                "completedAtMs": p.get("completedAtMs"),
                "status": p.get("status"),
                "riskLevel": p.get("riskLevel"),
                "rationale": p.get("rationale"),
                "threadId": p.get("threadId"),
                "turnId": p.get("turnId"),
            }),
        ),
        _ => return None,
    };
    Some(crate::map::wrap("guardEvent", method, kind, fields))
}

/// 统一包一层 `{type, method, event:{kind, ...}}`。
pub(crate) fn event_with_kind(kind: &str, fields: Value) -> Value {
    let mut event = json!({ "kind": kind });
    if let (Value::Object(target), Value::Object(src)) = (&mut event, fields) {
        for (key, value) in src {
            target.insert(key, value);
        }
    }
    event
}
