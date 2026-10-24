//! CLI 的报告与参数小工具（`team-apply` / `team-list` / `agent-scaffold` 共用）。
//!
//! 本程序是 Windows GUI 子系统 exe：stdout 没接管道时写不出去，所以报告一律
//! 走 `--out <文件>` 落盘；`println!` 只是管道场景下的附赠。退出码沿用 AF
//! 任务单协议：0 成功 / 1 失败。

use serde_json::{json, Value};

/// 取 `--flag <值>`：数组里第一次出现的位置生效。
pub fn option_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

/// 解析 `--out <路径>`，其余位置参数原样返回。
pub fn split_out(args: &[String]) -> (Vec<&str>, Option<String>) {
    let mut positional = Vec::new();
    let mut out = None;
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--out" {
            if let Some(path) = args.get(i + 1) {
                out = Some(path.clone());
            }
            i += 2;
        } else {
            positional.push(args[i].as_str());
            i += 1;
        }
    }
    (positional, out)
}

/// 落盘（或打印）报告并给退出码：status=ok → 0，否则 1。
pub fn finish(report: &Value, out: Option<&str>) -> i32 {
    if let Some(out) = out {
        let text = serde_json::to_string_pretty(report).unwrap_or_else(|_| "{}".into());
        if let Err(err) = crate::settings::config::write_text(std::path::Path::new(out), &text) {
            eprintln!("[team] 报告写入失败（{out}）：{err}");
            return 1;
        }
    } else {
        println!("{report}");
    }
    i32::from(report["status"] != "ok")
}

/// 顶层错误（参数 / 文件问题，没执行任何 op）。
pub fn error_report(message: impl std::fmt::Display) -> Value {
    json!({ "status": "error", "message": message.to_string(), "data": Value::Null, "error": { "code": "spec-error" } })
}
