//! `ui-state.json`：前端 UI 状态的落盘通道。
//!
//! 为什么不用 localStorage（00 铁律「配置落盘」）：WebView 的 localStorage
//! 落在 C 盘 AppData，与「配置跟着安装目录走、卸载即带走」的原则冲突，
//! 而且用户没法直接编辑或备份。布局这类状态必须能被用户找到。
//!
//! 文件形状由前端决定，这里只当一个透明的 JSON 文档存取：
//! ```json
//! {
//!   "layout": { "sidebar": 280, "rightbar": 380, "collapsed": false },
//!   "dock":   { "<threadId>": { "activeTab": "files", "width": 420 } }
//! }
//! ```
//! 用 `serde_json::Value` 而不是具体结构体，是为了新板块加字段时后端
//! 不用跟着改——老版本读到的未知键会原样保留再写回。

use super::config::{file_path, write_json};
use super::UI_STATE_FILE;
use serde_json::{json, Value};

/// ui-state.json 的落盘位置（设置中心「会话数据」域展示用）。
pub fn ui_state_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    file_path(app, UI_STATE_FILE)
}

/// 读整个文件。没有文件、读失败、不是对象，一律回落到空对象——
/// UI 状态丢了不该挡住启动。
pub fn load(app: &tauri::AppHandle) -> Value {
    let Ok(path) = ui_state_file(app) else {
        return json!({});
    };
    match std::fs::read_to_string(&path) {
        Ok(text) => match serde_json::from_str::<Value>(&text) {
            Ok(value) if value.is_object() => value,
            // 坏文件不阻塞启动：备份后当空状态，用户改回来即可。
            _ => {
                let _ = std::fs::rename(&path, path.with_extension("json.bad"));
                json!({})
            }
        },
        Err(_) => json!({}),
    }
}

/// 整文件覆盖写。前端 500ms 防抖后调这里。
pub fn save(app: &tauri::AppHandle, state: &Value) -> Result<(), String> {
    if !state.is_object() {
        return Err("ui-state 必须是 JSON 对象".into());
    }
    write_json(&file_path(app, UI_STATE_FILE)?, state)
}

/// 清掉 dock 段的残留条目：会话被删后布局还留着，文件只会一直变大。
/// `keep` 是仍需保留的会话 id 集合。
pub fn prune_dock(app: &tauri::AppHandle, keep: &[String]) -> Result<(), String> {
    let mut state = load(app);
    let Some(dock) = state.get_mut("dock").and_then(Value::as_object_mut) else {
        return Ok(());
    };
    dock.retain(|thread_id, _| keep.iter().any(|k| k == thread_id));
    save(app, &state)
}
