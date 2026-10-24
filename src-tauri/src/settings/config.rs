//! settings.json 读写与落盘路径。
//!
//! 落盘策略（00 铁律「配置落盘」）：三个 json（settings / workspaces /
//! ui-state）统一放在安装目录的 `cache\shell\`——cache 根的定位与回落
//! （exe 旁不可写才回落 AppData）在 `crate::cache`，本文件只管读写。
//! 旧布局（exe 旁散放 / AppData）的一次性拷贝迁移也由 `cache::init()` 负责。
//!
//! 模块分工见 `mod.rs`。

use super::Settings;
use std::path::{Path, PathBuf};

/// 应用数据目录（三个 json 都放这里）：安装目录的 `cache\shell\`。
pub fn app_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let _ = app; // 目录定位已不依赖 Tauri；签名保留以少动调用点。
    Ok(crate::cache::shell_dir())
}

/// 配置文件实际落盘位置：`cache\shell\` 下的 `name`。
pub fn file_path(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join(name))
}

pub fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    file_path(app, super::SETTINGS_FILE)
}

pub fn load(app: &tauri::AppHandle) -> Settings {
    if let Ok(path) = settings_path(app) {
        if let Ok(text) = std::fs::read_to_string(&path) {
            match serde_json::from_str::<Settings>(&text) {
                Ok(settings) => return settings,
                Err(err) => {
                    let _ = std::fs::write(path.with_extension("json.bad"), text);
                    eprintln!("[settings] 配置解析失败，已备份为 .json.bad：{err}");
                }
            }
        }
    }
    Settings::default()
}

/// 配置文件路径（只读展示用；无法确定时返回空串）。
pub fn config_path(app: &tauri::AppHandle) -> String {
    settings_path(app)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// 在资源管理器里选中配置文件，省得用户自己找路径。
pub fn reveal_in_explorer(app: &tauri::AppHandle) -> Result<(), String> {
    reveal_path(app, &settings_path(app)?)
}

/// 通用「在资源管理器里定位一个文件」。路径不存在时如实报错。
pub fn reveal_path(app: &tauri::AppHandle, path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err("文件还不存在，保存一次即可生成".into());
    }
    let _ = app;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .spawn()
            .map_err(|e| format!("无法打开资源管理器：{e}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    Err("当前平台暂不支持直接打开目录".into())
}

pub fn save(app: &tauri::AppHandle, settings: &Settings) -> Result<PathBuf, String> {
    let path = settings_path(app)?;
    write_json(&path, settings)?;
    Ok(path)
}

/// 序列化并落盘，父目录不存在就建。ui-state.json 走同一条路径。
///
/// **原子写**：先写 `<name>.json.tmp` 再 rename 覆盖目标。直接 `fs::write`
/// 覆盖时若中途崩溃/断电，会留下被截断的配置——下次启动解析失败就退回默认，
/// 用户数据丢了。rename 在同一卷上是原子的。
pub(crate) fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    write_text(path, &text)
}

/// 原子写纯文本（codex 角色文件等非 JSON 落盘共用同一条路径）。
pub(crate) fn write_text(path: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("无法创建配置目录：{e}"))?;
    }
    let tmp = path.with_extension("aigoat-tmp");
    std::fs::write(&tmp, text).map_err(|e| format!("无法写入配置文件：{e}"))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("无法保存配置文件：{e}")
    })
}
