//! 本地文件命令（工作区约束）。
//!
//! **不走协议的 `fs/*`**：codex 有一套自己的 fs 方法，但宿主已经有一套
//! bridge_fs_* 在工作（见 docs/17「明确不接」）。双通道只会让「到底谁的
//! 路径解析生效」变成长期谜题，所以维持单通道。

use serde_json::Value;
use tauri::AppHandle;

/// 列出一层目录；`include_ignored` 为真时显示忽略集（node_modules 等）。
#[tauri::command]
pub fn bridge_fs_list(
    app: AppHandle,
    dir: String,
    include_ignored: Option<bool>,
) -> Result<Value, String> {
    Ok(Value::Array(crate::fs::list(
        &app,
        &dir,
        include_ignored.unwrap_or(false),
    )?))
}

#[tauri::command]
pub fn bridge_fs_read(app: AppHandle, path: String) -> Result<Value, String> {
    crate::fs::read(&app, &path)
}

#[tauri::command]
pub fn bridge_fs_write(app: AppHandle, path: String, content: String) -> Result<Value, String> {
    crate::fs::write(&app, &path, &content)
}

#[tauri::command]
pub fn bridge_fs_reveal(app: AppHandle, path: String) -> Result<(), String> {
    crate::fs::reveal(&app, &path)
}
