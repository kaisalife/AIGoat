//! codex 通知 → 前端 AgentEvent 的映射。
//!
//! 字段名与 `web/src/bridge/types/events.ts` 一一对应。上游新增的
//! 通知一律返回 None，由调用方落进 `unhandled` 透传——宽容解析，
//! 上游发什么都不会打断事件流。
//!
//! 分片：thread/turn/goal 走 `threads.rs`，item 生命周期走 `items.rs`、
//! item 增量走 `deltas.rs`，guard 走 `guard.rs`，host/terminal/debug 走
//! `host.rs`，历史回放走 `history.rs`。本文件只做分派与「已知不接」的
//! 显式声明。
//!
//! # None 与 Null 的区别（重要）
//!
//! - `None` = **真没见过**：落 `unhandled`，界面上留一行灰字。
//!   这样上游新增能力时用户和开发者都看得见。
//! - `Some(Value::Null)` = **见过且刻意不发**：静默丢弃。
//!
//! 两种"不处理"必须区分。否则拒绝消费的协议方法（比如账号体系）会和
//! "上游升级了"混为一筹，真实的新能力被淹没在噪音里。

use serde_json::{json, Value};

mod deltas;
mod guard;
mod history;
mod host;
mod item_kinds;
mod items;
mod threads;

pub use history::map_history;

/// 已知但**故意不消费**的通知。
///
/// 列出来而不是让它们落 `unhandled`：这些是协议里有、我们也看得见的能力，
/// 但按 18-排除清单拍过板不做。落 unhandled 会让真正的新能力混在噪音里。
/// 每条后面的依据是决策，不是实现状态——将来要接回来，删掉对应行即可。
const DECLINED: &[(&str, &str)] = &[
    // 账号体系整体排除（18 号文件）：配额/登录态不进 AIGoat。
    ("account/login/completed", "账号体系排除"),
    ("account/rateLimits/updated", "账号体系排除"),
    ("account/updated", "账号体系排除"),
    // 远程控制：AIGoat 只有本机单实例。
    ("remoteControl/status/changed", "远程控制排除"),
    // 外部 agent 配置导入：自定义模型配置以本地目录为唯一真源（00 铁律 3），
    // 不接受从外部导入覆盖用户自己配的目录。
    (
        "externalAgentConfig/import/completed",
        "模型配置以本地目录为唯一真源",
    ),
    ("externalAgentConfig/import/progress", "同上"),
    // 多实例协作：宿主只有一个窗口，没有 app 列表可言。
    ("app/list/updated", "单实例宿主"),
    // 实时语音/视频流：AIGoat 没有这个场景。整组丢弃，否则一旦上游
    // 因为别的原因开始推送，会把消息流刷满。
    ("thread/realtime/started", "实时音视频场景不存在"),
    ("thread/realtime/closed", "实时音视频场景不存在"),
    ("thread/realtime/error", "实时音视频场景不存在"),
    ("thread/realtime/sdp", "实时音视频场景不存在"),
    ("thread/realtime/itemAdded", "实时音视频场景不存在"),
    ("thread/realtime/item/started", "实时音视频场景不存在"),
    ("thread/realtime/item/completed", "实时音视频场景不存在"),
    (
        "thread/realtime/item/transcript/delta",
        "实时音视频场景不存在",
    ),
    ("thread/realtime/transcript/delta", "实时音视频场景不存在"),
    ("thread/realtime/transcript/done", "实时音视频场景不存在"),
    ("thread/realtime/outputAudio/delta", "实时音视频场景不存在"),
];

/// 通知映射主入口。返回 None 表示未建模（调用方落 unhandled）。
pub fn map_notification(method: &str, p: &Value) -> Option<Value> {
    threads::map(method, p)
        .or_else(|| items::map(method, p))
        .or_else(|| deltas::map(method, p))
        .or_else(|| guard::map(method, p))
        .or_else(|| host::map(method, p))
        .or_else(|| declined(method))
}

/// 通道事件的统一外壳：`{type, method, event:{kind, ...fields}}`。
///
/// guard 与 host 共用它——两条通道形状一样，只有 `type` 和 `kind` 不同，
/// 各写一遍容易漏字段。
pub(crate) fn wrap(event_type: &str, method: &str, kind: &str, fields: Value) -> Value {
    json!({
        "type": event_type,
        "method": method,
        "event": guard::event_with_kind(kind, fields),
    })
}

/// 该通知是否属于"看过但决定不做"。
fn is_declined(method: &str) -> bool {
    DECLINED.iter().any(|(m, _)| *m == method)
}

fn declined(method: &str) -> Option<Value> {
    is_declined(method).then_some(Value::Null)
}
