//! 用户终端：`command/exec` 四条命令（10 号板块）。
//!
//! # 与消息流里的命令是两回事
//!
//! 终端是**用户**直接开的进程，不受回合沙箱约束；消息流里的
//! `commandExecution` 是 Agent 在沙箱里跑的东西。UI 上必须能区分，
//! 否则用户会以为自己的终端命令也在走审批。
//!
//! # 最大的坑：`command/exec` 的应答推迟到进程退出
//!
//! 协议文档写得很明确：最终应答在进程退出后才发，且排在所有
//! `outputDelta` 之后。所以
//! - **绝不能**「等应答再显示输出」——那样在进程活着的整个期间界面都是空的
//! - 命令层必须**立即**返回一个 pending 标识，输出纯事件驱动
//! - 应答到达时补一条 `exited` 事件，界面才知道退出码
//!
//! 第二个坑（`processId` 缺省时服务端用内部 id 且不暴露）在
//! `bridge_terminal_exec` 里处理：凡是流式相关的参数都要求前端自带 id。

use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

use super::client;
use crate::codex::EVENT_CHANNEL;
use crate::AppState;

/// 终端会话的最长存活时间。留一天：用户可能开一个跑构建的 shell 忘了关。
const SESSION_TIMEOUT: Duration = Duration::from_secs(24 * 60 * 60);

/// 开一个终端进程。
///
/// **立即返回**，不等进程结束——原因见模块注释。返回的 `processId` 由
/// 前端指定并自己持有：协议里凡是要 `write`/`resize`/`terminate` 的场合
/// 都必须带它，服务端在缺省时用的内部 id 是**不暴露给客户端**的。
#[tauri::command]
pub async fn bridge_terminal_exec(
    app: AppHandle,
    state: State<'_, AppState>,
    process_id: String,
    command: Vec<String>,
    cwd: Option<String>,
    tty: Option<bool>,
) -> Result<Value, String> {
    if command.is_empty() {
        return Err("command 不能为空数组".into());
    }
    if command[0].trim().is_empty() {
        return Err("command[0] 不能是空字符串".into());
    }
    if process_id.trim().is_empty() {
        return Err("必须由前端提供 processId：后续 write/resize/terminate 都要用它关联".into());
    }
    // cwd 必须落在当前工作区内：终端是"用户自己的 shell"，但从中任意脚本
    // 都能经 IPC 调到这里，所以仍受工作区边界约束。校验复用文件命令那套规则。
    if let Some(cwd) = cwd.as_deref() {
        crate::fs::within_workspace(&app, cwd).map_err(|e| format!("终端工作目录无效：{e}"))?;
    }
    let client = client(&state)?;

    // tty 蕴含 stdin/stdout 流式，协议要求这三项同时为真才发 outputDelta。
    let tty = tty.unwrap_or(false);
    let mut params = json!({
        "command": command,
        "processId": process_id,
        "tty": tty,
        "streamStdin": true,
        "streamStdoutStderr": true,
        // 终端要看得见完整输出，不接受服务端默认的截断上限
        "disableOutputCap": true,
        "disableTimeout": true,
    });
    if let Some(cwd) = cwd {
        params["cwd"] = json!(cwd);
    }

    let id = process_id.clone();
    let emit_app = app.clone();
    // 记入活跃终端表：重载后 `bridge_terminal_list` 靠它把孤立终端重挂回界面。
    // 之前这里从不登记，于是 terminal_list 永远返回空，重挂功能形同虚设。
    let terminals = state.terminals.clone();
    terminals
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(process_id.clone());
    // 不 await：进程可能跑几小时，命令通道不能被它堵住。
    tokio::spawn(async move {
        let result = client
            .request_with_timeout("command/exec", params, SESSION_TIMEOUT)
            .await;
        // 进程结束（或连接断开）后摘掉，重挂清单才不会留着死 id。
        terminals
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&id);
        emit_exit(&emit_app, &id, result);
    });

    // 协议没有"进程启动成功"回执（见 10 号文件 §2 的坑 3），
    // 所以前端只能记一个 pending：首个 outputDelta 或这条退出事件到达即定态。
    Ok(json!({ "processId": process_id, "status": "pending" }))
}

/// 往终端写 stdin。回车发送由前端拼 `\r`（tty 模式）。
#[tauri::command]
pub async fn bridge_terminal_write(
    state: State<'_, AppState>,
    process_id: String,
    data: String,
) -> Result<(), String> {
    client(&state)?
        .request(
            "command/exec/write",
            json!({ "processId": process_id, "data": data }),
        )
        .await
        .map(|_| ())
}

/// 通知 PTY 尺寸变化。前端按面板尺寸节流发送。
#[tauri::command]
pub async fn bridge_terminal_resize(
    state: State<'_, AppState>,
    process_id: String,
    rows: u32,
    cols: u32,
) -> Result<(), String> {
    client(&state)?
        .request(
            "command/exec/resize",
            json!({ "processId": process_id, "size": { "rows": rows, "cols": cols } }),
        )
        .await
        .map(|_| ())
}

/// 终止进程。`command/exec` 的应答仍会回来（带退出码），走 `emit_exit`。
#[tauri::command]
pub async fn bridge_terminal_terminate(
    state: State<'_, AppState>,
    process_id: String,
) -> Result<(), String> {
    client(&state)?
        .request("command/exec/terminate", json!({ "processId": process_id }))
        .await
        .map(|_| ())
}

/// `command/exec` 的应答落地成一条 `terminalEvent`。
///
/// 走事件而不是应答：那时命令通道早已返回了，界面只能从事件流知道
/// 退出码与残留输出。
fn emit_exit(app: &AppHandle, process_id: &str, result: Result<Value, String>) {
    let event = match result {
        Ok(value) => json!({
            "type": "terminalEvent",
            "execId": process_id,
            "stream": "result",
            "exitCode": value.get("exitCode"),
            "stdout": value.get("stdout"),
            "stderr": value.get("stderr"),
            "stdoutCapReached": value.get("stdoutCapReached"),
            "stderrCapReached": value.get("stderrCapReached"),
            "exited": true,
        }),
        Err(message) => json!({
            "type": "terminalEvent",
            "execId": process_id,
            "error": message,
            "exited": true,
        }),
    };
    let _ = app.emit(EVENT_CHANNEL, event);
}
