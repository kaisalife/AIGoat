//! 适配壳：AF 任务单协议 ↔ 上游 agent（{{NAME}} 的内化壳）。
//!
//! 只做四件事：读任务单 → 按 adapter.json 拉起上游 → 收结果 → 写标准报告。
//! 无异步运行时、无常驻、无网络；换上游只改 adapter.json，不必重编。

use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Deserialize)]
struct Task {
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    workspace: Option<String>,
    #[serde(default)]
    prompt: Option<String>,
    #[serde(default)]
    params: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Adapter {
    command: String,
    #[serde(default)]
    args: Vec<String>,
    /// `arg`（默认）/ `stdin-text`。
    #[serde(default)]
    input: Option<String>,
    /// `stdout-json` / `stdout-text` / `file-json`。
    output: String,
    #[serde(default)]
    output_path: Option<String>,
    #[serde(default)]
    timeout_sec: Option<u64>,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    env: BTreeMap<String, String>,
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut task_path = None;
    let mut out_path = None;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--agent" => {
                task_path = args.get(i + 1).cloned();
                i += 2;
            }
            "--out" => {
                out_path = args.get(i + 1).cloned();
                i += 2;
            }
            _ => i += 1,
        }
    }
    let report = match task_path.as_deref() {
        Some(path) => execute(path),
        None => fail("usage", "用法：<exe> --agent <task.json> --out <report.json>".into()),
    };
    std::process::exit(emit(out_path.as_deref(), &report));
}

fn execute(task_path: &str) -> Value {
    let task = match std::fs::read_to_string(task_path) {
        Ok(text) => match serde_json::from_str::<Task>(text.trim_start_matches('\u{feff}')) {
            Ok(task) => task,
            Err(err) => return fail("task-read", format!("任务单 JSON 解析失败：{err}")),
        },
        Err(err) => return fail("task-read", format!("读不了任务单 {task_path}：{err}")),
    };
    let adapter_path = find_adapter();
    let adapter = match std::fs::read_to_string(&adapter_path) {
        // 容忍 BOM：PowerShell 5 等写 UTF-8 带 BOM，serde_json 不认。
        Ok(text) => match serde_json::from_str::<Adapter>(text.trim_start_matches('\u{feff}')) {
            Ok(adapter) => adapter,
            Err(err) => {
                let path = adapter_path.display();
                return fail("adapter-read", format!("{path} 解析失败：{err}"));
            }
        },
        Err(err) => {
            let path = adapter_path.display();
            return fail("adapter-read", format!("读不了 {path}：{err}"));
        }
    };
    run_upstream(&adapter, &task, task_path)
}

/// adapter.json 的查找顺序：exe 同级 → 工程根（target/release 上三级）→ 当前目录。
fn find_adapter() -> PathBuf {
    let mut candidates = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("adapter.json"));
            candidates.push(dir.join("..").join("..").join("..").join("adapter.json"));
        }
    }
    candidates.push(PathBuf::from("adapter.json"));
    candidates
        .iter()
        .find(|p| p.is_file())
        .cloned()
        .unwrap_or_else(|| PathBuf::from("adapter.json"))
}

fn run_upstream(adapter: &Adapter, task: &Task, task_path: &str) -> Value {
    let render = |tpl: &str| render(tpl, task, task_path);
    let cwd = adapter
        .cwd
        .as_deref()
        .map(render)
        .or_else(|| task.workspace.clone())
        .unwrap_or_default();
    let mut cmd = Command::new(render(&adapter.command));
    for arg in &adapter.args {
        cmd.arg(render(arg));
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    if !cwd.trim().is_empty() {
        cmd.current_dir(&cwd);
    }
    for (key, value) in &adapter.env {
        cmd.env(key, render(value));
    }
    let stdin_text = match adapter.input.as_deref() {
        Some("stdin-text") => Some(render(task.prompt.as_deref().unwrap_or(""))),
        _ => None,
    };
    if stdin_text.is_some() {
        cmd.stdin(Stdio::piped());
    }

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(err) => return fail("spawn", format!("上游启动失败：{err}")),
    };
    if let (Some(mut pipe), Some(text)) = (child.stdin.take(), stdin_text) {
        std::thread::spawn(move || {
            let _ = pipe.write_all(text.as_bytes());
        });
    }
    let mut out_pipe = child.stdout.take();
    let mut err_pipe = child.stderr.take();
    let out_handle = std::thread::spawn(move || read_all(&mut out_pipe));
    let err_handle = std::thread::spawn(move || read_all(&mut err_pipe));

    // std 没有 wait_timeout：50ms 轮询 + 超时 kill，够用且不引 crate。
    let limit = adapter.timeout_sec.unwrap_or(600);
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {
                if limit > 0 && started.elapsed() > Duration::from_secs(limit) {
                    let _ = child.kill();
                    let _ = child.wait();
                    break None;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(err) => return fail("spawn", format!("等待上游失败：{err}")),
        }
    };
    let stdout = out_handle.join().unwrap_or_default();
    let stderr = err_handle.join().unwrap_or_default();

    let Some(status) = status else {
        return fail("timeout", format!("上游超过 {limit} 秒未结束，已终止"));
    };
    if !status.success() {
        let code = status.code().unwrap_or(-1);
        let tail = tail(&stderr);
        return fail("upstream-failed", format!("上游退出码 {code}：{tail}"));
    }

    match adapter.output.as_str() {
        "stdout-json" => match serde_json::from_str::<Value>(&stdout) {
            Ok(value) => ok(json!({ "upstream": value })),
            Err(err) => {
                let tail = tail(&stdout);
                fail("output-parse", format!("stdout 不是 JSON：{err}；尾部：{tail}"))
            }
        },
        "file-json" => {
            let Some(path) = adapter.output_path.as_deref().map(render) else {
                return fail("adapter-read", "output=file-json 时必须给 outputPath".into());
            };
            match std::fs::read_to_string(&path) {
                Ok(text) => match serde_json::from_str::<Value>(&text) {
                    Ok(value) => ok(json!({ "upstream": value, "upstreamPath": path })),
                    Err(err) => fail("output-parse", format!("{path} 不是 JSON：{err}")),
                },
                Err(err) => fail("output-read", format!("读不了上游产物 {path}：{err}")),
            }
        }
        _ => ok(json!({ "text": stdout.trim() })),
    }
}

fn render(tpl: &str, task: &Task, task_path: &str) -> String {
    let mut text = tpl
        .replace("{prompt}", task.prompt.as_deref().unwrap_or(""))
        .replace("{name}", &task.name)
        .replace("{type}", &task.kind)
        .replace("{workspace}", task.workspace.as_deref().unwrap_or(""))
        .replace("{task}", task_path);
    if let Value::Object(map) = &task.params {
        for (key, value) in map {
            let value = match value {
                Value::String(text) => text.clone(),
                other => other.to_string(),
            };
            text = text.replace(&format!("{{params.{key}}}"), &value);
        }
    }
    text
}

fn read_all<R: Read>(pipe: &mut Option<R>) -> String {
    let mut buf = Vec::new();
    if let Some(pipe) = pipe {
        let _ = pipe.read_to_end(&mut buf);
    }
    String::from_utf8_lossy(&buf).to_string()
}

/// 错误信息只留尾部 2KB：上游常在 stderr 刷依赖安装日志。
fn tail(text: &str) -> String {
    let text = text.trim();
    let start = text.len().saturating_sub(2048);
    let start = (start..=text.len())
        .find(|i| text.is_char_boundary(*i))
        .unwrap_or(text.len());
    text[start..].to_string()
}

fn ok(data: Value) -> Value {
    json!({ "status": "ok", "message": "", "data": data, "error": Value::Null })
}

fn fail(code: &str, message: String) -> Value {
    json!({ "status": "error", "message": message, "data": Value::Null, "error": { "code": code } })
}

fn emit(out: Option<&str>, report: &Value) -> i32 {
    let text = serde_json::to_string_pretty(report).unwrap_or_else(|_| "{}".into());
    if let Some(path) = out {
        if let Some(parent) = std::path::Path::new(path).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Err(err) = std::fs::write(path, &text) {
            eprintln!("[adapter] 报告写入失败（{path}）：{err}");
            return 1;
        }
    } else {
        println!("{text}");
    }
    i32::from(report["status"] != "ok")
}
