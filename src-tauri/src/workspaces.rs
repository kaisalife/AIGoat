//! 工作区 = 一个文件夹。
//!
//! 关键约定（与总览一致）：
//! - **会话不归我们存**。codex 的 thread 自带 cwd，`thread/list` 支持 cwd 过滤，
//!   所以"按工作区分会话"完全靠过滤，不需要第二份会话数据库
//! - 这里的 workspaces.json 只记"用户打开过哪些文件夹"与"当前是哪个"
//! - 删除工作区只删这条记录，**绝不碰磁盘上的文件**；要不要连带删会话由用户选

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const WORKSPACES_FILE: &str = "workspaces.json";

/// 最近打开的最多留这么多条，超出丢最旧的（list 头部永远是最近用过的）。
const MAX_WORKSPACES: usize = 20;

const VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkspaceEntry {
    pub path: String,
    /// Unix 秒。只用于排序展示，不参与任何协议。
    pub last_opened_at: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Workspaces {
    pub version: u32,
    pub workspaces: Vec<WorkspaceEntry>,
    pub active: Option<String>,
}

/// 界面用的行：路径 + 文件夹名 + 是否当前。
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub path: String,
    pub name: String,
    pub last_opened_at: u64,
    pub active: bool,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 规范化路径：canonicalize → 必须是目录 → 去掉 Windows 的 `\\?\` 前缀。
///
/// 去掉前缀不是美化：`\\?\D:\x` 和 `D:\x` 在字符串比较里不相等，
/// 不统一的话同一个文件夹会在列表里出现两次，去重也去不掉。
pub fn normalize(path: &Path) -> Result<String, String> {
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("无法访问该文件夹：{e}"))?;
    if !canonical.is_dir() {
        return Err(format!("{} 不是文件夹。", canonical.display()));
    }
    let text = canonical.to_string_lossy().to_string();
    Ok(text.strip_prefix(r"\\?\").unwrap_or(&text).to_string())
}

pub fn workspaces_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(crate::settings::app_dir(app)?.join(WORKSPACES_FILE))
}

pub fn load(app: &tauri::AppHandle) -> Workspaces {
    let default = Workspaces {
        version: VERSION,
        ..Workspaces::default()
    };
    let Ok(path) = workspaces_path(app) else {
        return default;
    };
    let mut list: Workspaces = match std::fs::read_to_string(&path) {
        Ok(text) => match serde_json::from_str::<Workspaces>(&text) {
            Ok(list) => list,
            Err(err) => {
                // 解析失败不能静默当空：下一次 save 会把损坏文件直接覆盖掉，
                // 用户的工作区清单就永久没了。先备份再退默认。
                let _ = std::fs::write(path.with_extension("json.bad"), &text);
                eprintln!("[workspaces] 配置解析失败，已备份为 .json.bad：{err}");
                default
            }
        },
        // 文件不存在是正常情况（首次启动）；其它 IO 错误也退默认但不覆盖。
        Err(_) => default,
    };
    if list.version == 0 {
        list.version = VERSION;
    }
    // active 指向的路径可能已被用户删掉：这种陈旧状态不能让界面显示"已打开"。
    if let Some(active) = list.active.clone() {
        if !list.workspaces.iter().any(|w| w.path == active) {
            list.active = list.workspaces.first().map(|w| w.path.clone());
        }
    }
    list
}

pub fn save(app: &tauri::AppHandle, list: &Workspaces) -> Result<PathBuf, String> {
    let path = workspaces_path(app)?;
    // 复用 settings 的原子写，避免各写一份"先写后 rename"。
    crate::settings::config::write_json(&path, list)
        .map_err(|e| format!("无法写入工作区配置：{e}"))?;
    Ok(path)
}

/// 加入（或刷新）一个工作区，置顶并去重。返回规范化后的路径。
pub fn add_or_touch(list: &mut Workspaces, path: &str) -> Result<String, String> {
    let normalized = normalize(Path::new(path.trim()))?;
    list.workspaces.retain(|w| w.path != normalized);
    list.workspaces.insert(
        0,
        WorkspaceEntry {
            path: normalized.clone(),
            last_opened_at: now_secs(),
        },
    );
    list.workspaces.truncate(MAX_WORKSPACES);
    list.version = VERSION;
    Ok(normalized)
}

pub fn set_active(list: &mut Workspaces, path: &str) -> Result<(), String> {
    // 只允许激活已登记的路径：否则界面会显示"当前工作区"却查不到它的会话。
    if !list.workspaces.iter().any(|w| w.path == path) {
        return Err("该工作区不在列表里，请先打开它。".into());
    }
    // 登记之后文件夹可能已被删掉或改名。这时不能设为当前：会话列表、技能、
    // 钩子全都会指向一个不存在的目录，用户看到的却是"已连接"。
    if !Path::new(path).is_dir() {
        return Err(format!("{} 已不存在，请重新选择文件夹。", path));
    }
    list.active = Some(path.to_string());
    if let Some(entry) = list.workspaces.iter_mut().find(|w| w.path == path) {
        entry.last_opened_at = now_secs();
    }
    list.workspaces
        .sort_by_key(|w| std::cmp::Reverse(w.last_opened_at));
    Ok(())
}

/// 移出列表。删掉的正好是当前工作区时，改选剩下的第一个。
pub fn remove(list: &mut Workspaces, path: &str) {
    list.workspaces.retain(|w| w.path != path);
    if list.active.as_deref() == Some(path) {
        list.active = list.workspaces.first().map(|w| w.path.clone());
    }
}

pub fn summaries(list: &Workspaces) -> Vec<WorkspaceSummary> {
    list.workspaces
        .iter()
        .map(|w| WorkspaceSummary {
            name: folder_name(&w.path),
            path: w.path.clone(),
            last_opened_at: w.last_opened_at,
            active: list.active.as_deref() == Some(w.path.as_str()),
        })
        .collect()
}

fn folder_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| path.to_string())
}

/// 弹系统目录选择框。必须在已初始化 COM 的线程上调用（见 commands 里的说明）。
pub fn pick_folder() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("选择工作区文件夹")
        .pick_folder()
        .and_then(|p| normalize(&p).ok())
}
