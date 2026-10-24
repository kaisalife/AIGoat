//! `CodexClient` 的请求/通知 API：发出去的那一半。
//!
//! 与 `framing.rs` 的分界：那边处理「进来的帧怎么分流」，这边只管
//! 「怎么发」。`respond_server_request` 的应答形状分流在 `respond.rs`，
//! 因为它长得跟其它应答完全不一样（按 method 决定 payload 结构）。

use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use std::time::Duration;

use super::CodexClient;

/// 一般请求的超时。终端那条走 `request_with_timeout` 自己给。
pub(super) const DEFAULT_TIMEOUT: Duration = Duration::from_secs(90);

impl CodexClient {
    /// 发一个 client→server 请求并等待应答。
    pub async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        self.request_with_timeout(method, params, DEFAULT_TIMEOUT)
            .await
    }

    /// 同上，超时可指定。
    ///
    /// 终端要用：默认的 90s 对一个还开着的 shell 来说太短，会在用户
    /// 什么都没干的时候误报超时。
    pub async fn request_with_timeout(
        &self,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst) + 1;
        let (tx, rx) = tokio::sync::oneshot::channel();
        let frame = json!({ "id": id, "method": method, "params": params }).to_string();
        // 取发送端：已 drop（连接销毁中）就别插入挂起项。
        let sender = self
            .tx
            .as_ref()
            .ok_or_else(|| "codex 进程已退出".to_string())?;
        self.pending
            .lock()
            .map_err(|e| format!("pending lock poisoned: {e}"))?
            .insert(id, tx);
        if sender.send(frame).is_err() {
            // 发送失败：把刚插入的挂起项摘掉，否则表里会留下一个永远等不到的 id。
            self.pending
                .lock()
                .map_err(|e| format!("pending lock poisoned: {e}"))?
                .remove(&id);
            return Err("codex 进程已退出".to_string());
        }
        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(Ok(value))) => Ok(value),
            Ok(Ok(Err(err))) => Err(err),
            Ok(Err(_)) => Err("应答通道已关闭".to_string()),
            Err(_) => {
                self.pending
                    .lock()
                    .map_err(|e| format!("pending lock poisoned: {e}"))?
                    .remove(&id);
                Err(format!("{method} 请求超时"))
            }
        }
    }

    /// 发一个通知（不需要应答）。
    pub(super) fn notify(&self, method: &str, params: Value) -> Result<(), String> {
        let mut frame = json!({ "method": method });
        if !params.is_null() {
            frame["params"] = params;
        }
        self.tx
            .as_ref()
            .ok_or_else(|| "codex 进程已退出".to_string())?
            .send(frame.to_string())
            .map_err(|_| "codex 进程已退出".to_string())
    }

    /// 应答 server→client 请求。
    ///
    /// 返回 `Err` 时表示应答**没有发出去**（进程已退出或通道关闭）。调用方
    /// 必须把失败透传给用户——静默 `Ok` 会让界面显示「已应答」，而 codex
    /// 那一轮永远挂着，用户还没有重试入口。
    pub(super) fn respond(
        &self,
        id: &Value,
        result: Result<Value, (i64, String)>,
    ) -> Result<(), String> {
        let frame = match result {
            Ok(value) => json!({ "id": id, "result": value }),
            Err((code, message)) => {
                json!({ "id": id, "error": { "code": code, "message": message } })
            }
        };
        self.tx
            .as_ref()
            .ok_or_else(|| "codex 进程已退出，应答未送达".to_string())?
            .send(frame.to_string())
            .map_err(|_| "codex 进程已退出，应答未送达".to_string())
    }

    /// 某个线程当前活跃的回合。
    ///
    /// 删会话时要判断的是「**这个**线程是否在跑」，而不是「有没有任意线程在
    /// 跑」——子代理在跑时不该让删除主会话走进"先打断"那条路。
    pub fn active_turn_of(&self, thread_id: &str) -> Option<String> {
        self.active_turns
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(thread_id)
            .cloned()
    }
}
