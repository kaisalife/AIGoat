//! server→client 请求的应答。
//!
//! 单独成文件是因为这段的形状和 `api.rs` 里的其它应答**完全不同**：
//! 同一个 `respond_server_request` 入口，要按 method 决定发出去的 payload
//! 结构——审批是 `{decision}`、permissions 是 `{permissions, scope}`、
//! legacy 方法是另一套 ReviewDecision 词汇、工具结果是 `{contentItems, success}`。
//! 把这些摆在一起才看得出"应答形状是按 method 分的"，拆开就看不出。

use serde_json::{json, Value};

use super::CodexClient;
use crate::codex::take_pending;

/// JSON-RPC 标准错误码：Method not found / Invalid request。
const JSON_RPC_METHOD_NOT_FOUND: i64 = -32601;

impl CodexClient {
    /// 用户对审批 / 工具调用 / 宿主能力请求的应答。
    ///
    /// 三个参数互斥：给了哪个就走哪条路。`error_message` 优先级最高——
    /// 请求已经无法应答时，报错比装死有用。
    pub async fn respond_server_request(
        &self,
        request_id: &Value,
        decision: Option<String>,
        tool_result: Option<(Value, bool)>,
        error_message: Option<String>,
    ) -> Result<(), String> {
        let Some(req) = take_pending(&self.server_requests, request_id) else {
            return Err("该请求已处理或不存在".to_string());
        };

        if let Some(message) = error_message {
            self.respond(request_id, Err((JSON_RPC_METHOD_NOT_FOUND, message)))?;
            return Ok(());
        }
        if let Some((content_items, success)) = tool_result {
            // item/tool/call：执行结果原样回传（本壳不注册执行器时走 error）。
            self.respond(
                request_id,
                Ok(json!({ "contentItems": content_items, "success": success })),
            )?;
            return Ok(());
        }
        let Some(decision) = decision else {
            self.respond(
                request_id,
                Err((JSON_RPC_METHOD_NOT_FOUND, "缺少应答内容".into())),
            )?;
            return Ok(());
        };

        // 审批应答形状按 method 分流，绝不混用。
        let payload = match req.method.as_str() {
            "item/commandExecution/requestApproval" | "item/fileChange/requestApproval" => {
                json!({ "decision": decision })
            }
            "item/permissions/requestApproval" => {
                // 接受 = 回显请求里的 profile；拒绝 = 空 profile（不授予任何权限）。
                let granted = if decision == "accept" {
                    req.params.get("permissions").unwrap_or(&json!({})).clone()
                } else {
                    json!({})
                };
                json!({ "permissions": granted, "scope": "turn" })
            }
            // legacy 方法名的应答是另一套 ReviewDecision 词汇。
            "execCommandApproval" | "applyPatchApproval" => {
                let legacy = match decision.as_str() {
                    "accept" => json!("approved"),
                    "acceptForSession" => json!("approved_for_session"),
                    "decline" => json!({ "denied": { "rejection": "用户已拒绝" } }),
                    _ => json!("abort"),
                };
                json!({ "decision": legacy })
            }
            other => {
                return Err(format!("不是审批请求：{other}"));
            }
        };
        self.respond(request_id, Ok(payload))?;
        Ok(())
    }

    /// 用户对 `item/tool/requestUserInput` 的应答。
    ///
    /// 形状是 `{answers: {questionId: answer}}`——注意不是审批那套
    /// `{decision}`。混用会被 codex 当成非法应答丢掉，用户点了没反应。
    pub async fn respond_user_input(
        &self,
        request_id: &Value,
        answers: Value,
    ) -> Result<(), String> {
        if take_pending(&self.server_requests, request_id).is_none() {
            return Err("该请求已处理或不存在".to_string());
        }
        self.respond(request_id, Ok(json!({ "answers": answers })))?;
        Ok(())
    }

    /// 用户对 `mcpServer/elicitation/request` 的应答。
    ///
    /// 应答形状跟着请求里的 `requestedSchema` 走（协议未强制统一），
    /// 所以这里原样透传前端交上来的对象，不替 MCP 服务器猜字段。
    pub async fn respond_elicitation(
        &self,
        request_id: &Value,
        content: Value,
    ) -> Result<(), String> {
        if take_pending(&self.server_requests, request_id).is_none() {
            return Err("该请求已处理或不存在".to_string());
        }
        self.respond(request_id, Ok(content))?;
        Ok(())
    }
}
