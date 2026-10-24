//! 入站帧的分帧与分流。
//!
//! 线格式的三类帧（server 请求 / 通知 / 对我方请求的响应）在这里分流。
//! 这是整个桥接最容易错的地方，所以单独成文件——`codex.rs` 只管进程
//! 生命周期与握手，读到一行 JSON 之后的判断全在这。

use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

use super::{PendingMap, PendingServerRequest};
use crate::map::map_notification;

/// 批量缓冲：累积事件，每 16ms 批量 emit 一次。
///
/// # 为什么
///
/// `app.emit` 是 Tauri IPC，每次调用都有序列化/反序列化开销。
/// 高频 delta 场景下每秒 emit 100+ 次，这里改成累积 16ms 再一次性
/// 发数组，emit 频率降到 ~60 次/秒，前端也只需处理一次回调。
///
/// # 尾事件必须靠定时器冲刷（codex.rs 里有一个专职 flush 线程）
///
/// `push` 的"到点自动 flush"只在**下一条事件到达**时才有机会执行。而回合
/// 结束的 `turnComplete` 恰恰是最后一条事件——之后 read thread 就阻塞在等
/// 下一行，缓冲永远不冲，前端收不到 turnComplete：回合收不了口，「停止」
/// 按钮常驻，用户发不出下一条。所以定时 flush 不是优化，是正确性。
pub(super) struct EventBatcher {
    app: AppHandle,
    buffer: Vec<Value>,
    last_flush: Instant,
    channel: &'static str,
}

impl EventBatcher {
    pub(super) const FLUSH_INTERVAL: Duration = Duration::from_millis(16);

    pub(super) fn new(app: AppHandle, channel: &'static str) -> Self {
        Self {
            app,
            buffer: Vec::new(),
            last_flush: Instant::now(),
            channel,
        }
    }

    /// 推送一条事件；到达间隔后自动 flush。
    pub(super) fn push(&mut self, event: Value) {
        self.buffer.push(event);
        if self.last_flush.elapsed() >= Self::FLUSH_INTERVAL {
            self.flush();
        }
    }

    /// 立即 flush 缓冲区。
    pub(super) fn flush(&mut self) {
        if self.buffer.is_empty() {
            return;
        }
        let events = std::mem::take(&mut self.buffer);
        let _ = self.app.emit(self.channel, Value::Array(events));
        self.last_flush = Instant::now();
    }
}
/// 入站帧分流。
pub(super) fn dispatch_frame(
    app: &AppHandle,
    frame: Value,
    pending: &PendingMap,
    server_requests: &Arc<Mutex<HashMap<Value, PendingServerRequest>>>,
    active_turns: &Arc<Mutex<HashMap<String, String>>>,
    batcher: &mut EventBatcher,
) {
    let method = frame
        .get("method")
        .and_then(Value::as_str)
        .map(String::from);
    if let Some(method) = method {
        match frame.get("id") {
            Some(id) => handle_server_request(
                app,
                id,
                &method,
                frame.get("params").unwrap_or(&Value::Null),
                server_requests,
                batcher,
            ),
            None => handle_notification(
                app,
                &method,
                frame.get("params").unwrap_or(&Value::Null),
                active_turns,
                server_requests,
                batcher,
            ),
        }
        return;
    }
    // 对我方请求的响应：按 key 判断，result: null 也合法。
    if let Some(id) = frame.get("id").and_then(Value::as_i64) {
        if let Some(sender) = pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&id)
        {
            if let Some(error) = frame.get("error") {
                let message = error
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("app-server 返回错误")
                    .to_string();
                let _ = sender.send(Err(message));
            } else {
                let _ = sender.send(Ok(frame.get("result").cloned().unwrap_or(Value::Null)));
            }
        }
    }
}

/// server→client 请求：转成界面事件，等用户操作后经 bridge_respond_* 应答。
///
/// 映射规则见 `server_requests.rs`。注意这里是**必须**配对应答的通道——
/// 不应答的请求会让 codex 那一轮一直挂着（这就是「客户端工具闭环断裂」
/// 那个断点的成因）。
fn handle_server_request(
    _app: &AppHandle,
    id: &Value,
    method: &str,
    params: &Value,
    server_requests: &Arc<Mutex<HashMap<Value, PendingServerRequest>>>,
    batcher: &mut EventBatcher,
) {
    server_requests
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(
            id.clone(),
            PendingServerRequest {
                method: method.to_string(),
                params: params.clone(),
            },
        );
    let event = crate::server_requests::map_server_request(method, params, id)
        .unwrap_or_else(|| crate::server_requests::host_capability(method, id));
    batcher.push(event);
}

/// 通知 → AgentEvent 的映射入口（见 map.rs）。
fn handle_notification(
    _app: &AppHandle,
    method: &str,
    params: &Value,
    active_turns: &Arc<Mutex<HashMap<String, String>>>,
    server_requests: &Arc<Mutex<HashMap<Value, PendingServerRequest>>>,
    batcher: &mut EventBatcher,
) {
    // serverRequest/resolved 顺便清掉挂起记录。
    if method == "serverRequest/resolved" {
        if let Some(id) = params.get("requestId") {
            server_requests
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(id);
        }
    }
    // 回合边界维护活跃回合表。**按线程记**，不记单槽位：子代理在各自线程里
    // 并发跑，单槽位只留最后开始的那一个，主会话就从表里消失了 ——
    // 于是「在主会话上点停止」会打断子代理，而主会话继续跑。
    let turn_of = |key: &str| -> Option<(String, String)> {
        match (
            params.get("threadId").and_then(Value::as_str),
            params.pointer(key).and_then(Value::as_str),
        ) {
            (Some(t), Some(n)) => Some((t.to_string(), n.to_string())),
            _ => None,
        }
    };
    if method == "turn/started" {
        if let Some((thread_id, turn_id)) = turn_of("/turn/id") {
            active_turns
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .insert(thread_id, turn_id);
        }
    }
    if method == "turn/completed" || method == "turn/failed" || method == "turn/interrupted" {
        if let Some((thread_id, turn_id)) = turn_of("/turn/id") {
            let mut guard = active_turns.lock().unwrap_or_else(|e| e.into_inner());
            // 只在回合号吻合时才清：同一线程可能已经开始了下一个回合，
            // 那时把新的那个清掉会让「停止」按钮变成空操作。
            if guard.get(&thread_id) == Some(&turn_id) {
                guard.remove(&thread_id);
            }
        }
    }
    let Some(event) = map_notification(method, params) else {
        // 未建模通知：透传不打扰，前端压成一行灰字。
        batcher.push(json!({ "type": "unhandled", "method": method, "params": params }));
        return;
    };
    // Null = 已建模类型但这一侧刻意不发事件（见 map.rs），静默丢弃。
    if event.is_null() {
        return;
    }
    batcher.push(event);
}
