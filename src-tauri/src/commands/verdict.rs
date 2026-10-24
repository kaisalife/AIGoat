//! 复核裁决（11 号板块；出口形态见 docs/17 §5.7 的核实记录）。
//!
//! `thread/approveGuardianDeniedAction` 的参数**不是一段文本**，而是把当初
//! 那份 `GuardianAssessmentEvent` **原样回灌**（`{threadId, event}`）。所以
//! 前端传两样：评估事件本体 + 裁决（批 / 驳 + 理由）。
//!
//! 裁决文字挂在哪里是个真问题：协议只认 `event`，多出来的字段会被忽略。
//! 所以把它**塞进 event 自身**（`_aigoatVerdict` 键）——那份评估对象由我们
//! 在前端持有，回灌时它就是裁决的正式载体，而不是只给用户看的一句话。

use serde_json::{json, Value};
use tauri::State;

use super::client;
use crate::AppState;

/// 裁决一次复核。
///
/// `assessment` 是当初 `strictReviewRequired` 通知里的那个对象；`reason`
/// 只在驳回时有意义（批准不需要理由）。响应是空对象——调完即定稿，没有
/// 东西要读回来。
#[tauri::command]
pub async fn bridge_review_verdict(
    state: State<'_, AppState>,
    thread_id: String,
    assessment: Value,
    approved: bool,
    reason: Option<String>,
) -> Result<(), String> {
    if !assessment.is_object() {
        return Err("缺少评估事件：裁决必须把当初那份 GuardianAssessmentEvent 原样回灌".into());
    }
    let mut event = assessment;
    if let Some(map) = event.as_object_mut() {
        map.insert("_aigoatVerdict".into(), json!({ "approved": approved }));
        if let Some(reason) = reason.as_deref().filter(|r| !r.trim().is_empty()) {
            map.insert("_aigoatReason".into(), json!(reason));
        }
    }
    client(&state)?
        .request(
            "thread/approveGuardianDeniedAction",
            json!({ "threadId": thread_id, "event": event }),
        )
        .await
        .map(|_| ())
}

/// 活动终端实例清单（10 号文件 §4.1 的「重载重挂」）。
///
/// Tauri 的网页重载（dev 热重载 / 用户刷新）会丢掉前端状态，但**进程还在**——
/// 它们是 codex 那边的 `command/exec` 子进程。所以这里记一份"本会话开过哪些
/// 终端"，重载后前端据此重挂显示。
///
/// 存在 Rust 侧而不是 `ui-state.json`：它是**运行期**状态（进程活着的证据），
/// 落盘会在下次启动时列出早就死掉的进程。落盘的只有布局，进程清单不落。
///
/// 这份清单由 `bridge_terminal_exec` 在进程起来/退出时**自行**增删（见
/// `commands/terminal.rs`），不需要前端再调什么——原先还暴露了一对
/// `bridge_terminal_track/untrack`，但前端从不调用、`exec` 也已内联登记，
/// 故删除，避免"看起来有个接口其实没人用"。
#[tauri::command]
pub fn bridge_terminal_list(state: State<'_, AppState>) -> Result<Value, String> {
    let instances: Vec<String> = state
        .terminals
        .lock()
        .map_err(|e| format!("terminals lock poisoned: {e}"))?
        .iter()
        .cloned()
        .collect();
    Ok(json!({ "instances": instances }))
}
