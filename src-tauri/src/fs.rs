//! 文件系统命令的后端（受当前工作区约束）。
//!
//! 安全规则：任何路径必须先 canonicalize，再确认落在「当前工作区根」之内，
//! 否则一律拒绝。前端可访问的路径永远来自文件树，不手填；即使手填也过不了
//! 这道检查。当前工作区根来自 workspaces.json 的 active，没打开工作区时
//! 这些命令直接返回"请先打开工作区"。

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

/// 树里默认不展开的目录：噪音大、和编辑源码无关。
pub const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    "target",
    "dist",
    "build",
    "out",
    ".idea",
    ".vscode",
    "__pycache__",
    ".next",
    "coverage",
    "bin",
    "obj",
];

/// 文本读取上限：再大就不是"打开看看"，而是拖垮界面。
const TEXT_LIMIT: u64 = 2 * 1024 * 1024;
/// 图片读取上限：预览用，超大的先问要不要看。
const IMAGE_LIMIT: u64 = 8 * 1024 * 1024;

pub fn active_root(app: &tauri::AppHandle) -> Result<String, String> {
    let list = crate::workspaces::load(app);
    list.active.ok_or_else(|| "请先打开一个工作区".to_string())
}

/// 规范化一个必须已存在的路径，并确认它在工作区内。
pub(crate) fn within_workspace(app: &tauri::AppHandle, path: &str) -> Result<String, String> {
    let root = active_root(app)?;
    let root_path = Path::new(&root);
    let canonical = Path::new(path)
        .canonicalize()
        .map_err(|e| format!("路径无效：{e}"))?;
    // Windows 的 canonicalize 会带 `\\?\` 前缀，而工作区根是剥过前缀存的，
    // 不统一的话同一个目录的 starts_with 会失败。
    let text = canonical.to_string_lossy().to_string();
    let normalized = text.strip_prefix(r"\\?\").unwrap_or(&text);
    if !Path::new(normalized).starts_with(root_path) {
        return Err("路径在工作区之外".into());
    }
    Ok(normalized.to_string())
}

/// 写入路径可能还不存在，canonicalize 会失败；这里只校验父目录在工作区内。
fn workspace_parent(app: &tauri::AppHandle, path: &str) -> Result<PathBuf, String> {
    let root = active_root(app)?;
    let root_path = Path::new(&root);
    let target = Path::new(path);
    let parent = target
        .parent()
        .ok_or_else(|| "路径无效：缺少父目录".to_string())?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|e| format!("路径无效：{e}"))?;
    let text = canonical_parent.to_string_lossy().to_string();
    let normalized = text.strip_prefix(r"\\?\").unwrap_or(&text);
    if !Path::new(normalized).starts_with(root_path) {
        return Err("路径在工作区之外".into());
    }
    Ok(target.to_path_buf())
}

/// 列出一层目录。`include_ignored` 为真时显示忽略集（隐藏项始终不显示）。
pub fn list(
    app: &tauri::AppHandle,
    dir: &str,
    include_ignored: bool,
) -> Result<Vec<Value>, String> {
    let dir = within_workspace(app, dir)?;
    let read = std::fs::read_dir(&dir).map_err(|e| format!("无法读取目录：{e}"))?;
    let mut out = Vec::new();
    for entry in read {
        let entry = entry.map_err(|e| format!("读取目录项失败：{e}"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if !include_ignored && IGNORED_DIRS.contains(&name.as_str()) {
            continue;
        }
        let file_type = entry
            .file_type()
            .map_err(|e| format!("读取类型失败：{e}"))?;
        let is_dir = file_type.is_dir();
        let has_children = if is_dir {
            // 用**与列表同一套过滤**判断有没有子项：否则「只含 node_modules /
            // 隐藏项」的目录会画出展开箭头，点开却是空的。
            std::fs::read_dir(entry.path())
                .map(|rd| {
                    rd.filter_map(Result::ok).any(|child| {
                        let n = child.file_name().to_string_lossy().to_string();
                        !n.starts_with('.')
                            && (include_ignored || !IGNORED_DIRS.contains(&n.as_str()))
                    })
                })
                .unwrap_or(false)
        } else {
            false
        };
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        out.push(json!({
            "name": name,
            "path": entry.path().to_string_lossy().to_string(),
            "isDir": is_dir,
            "size": size,
            "hasChildren": has_children,
        }));
    }
    out.sort_by(|a, b| {
        let ad = a["isDir"].as_bool().unwrap_or(false);
        let bd = b["isDir"].as_bool().unwrap_or(false);
        bd.cmp(&ad).then_with(|| {
            a["name"]
                .as_str()
                .unwrap_or("")
                .cmp(b["name"].as_str().unwrap_or(""))
        })
    });
    Ok(out)
}

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .map(|e| {
            matches!(
                e.as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico" | "svg"
            )
        })
        .unwrap_or(false)
}

/// 读文件：文本 / 图片（base64）/ 二进制 / 超大。
pub fn read(app: &tauri::AppHandle, path: &str) -> Result<Value, String> {
    let path = within_workspace(app, path)?;
    let p = Path::new(&path);
    let meta = p.metadata().map_err(|e| format!("读取文件信息失败：{e}"))?;
    if !meta.is_file() {
        return Err("不是文件".into());
    }
    let size = meta.len();

    if is_image(p) {
        if size > IMAGE_LIMIT {
            return Ok(json!({ "kind": "tooLarge", "size": size }));
        }
        let bytes = std::fs::read(p).map_err(|e| format!("读取图片失败：{e}"))?;
        return Ok(json!({
            "kind": "image",
            "content": BASE64.encode(bytes),
            "size": size,
        }));
    }

    if size > TEXT_LIMIT {
        return Ok(json!({ "kind": "tooLarge", "size": size }));
    }
    match std::fs::read_to_string(p) {
        Ok(text) => Ok(json!({ "kind": "text", "content": text, "size": size })),
        Err(_) => Ok(json!({ "kind": "binary", "size": size })),
    }
}

/// 文本写入上限：防止一次误操作/恶意调用写爆磁盘。
const WRITE_LIMIT: usize = 8 * 1024 * 1024;

pub fn write(app: &tauri::AppHandle, path: &str, content: &str) -> Result<Value, String> {
    if content.len() > WRITE_LIMIT {
        return Err(format!("内容过大（{} 字节），超过写入上限", content.len()));
    }
    let target = Path::new(path);
    // 目标**已存在**时，必须连它自己一起 canonicalize 再校验：只校验父目录
    // 挡不住「最后一段是符号链接/junction 指向工作区外」的情况——`fs::write`
    // 会跟着链接写到外面去。目标不存在时，末段不可能已经是链接。
    let resolved: PathBuf = if target.exists() {
        PathBuf::from(within_workspace(app, path)?)
    } else {
        workspace_parent(app, path)?
    };
    std::fs::write(&resolved, content).map_err(|e| format!("写入失败：{e}"))?;
    Ok(json!({ "ok": true }))
}

/// 在资源管理器里选中该文件。
pub fn reveal(app: &tauri::AppHandle, path: &str) -> Result<(), String> {
    let path = within_workspace(app, path)?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|e| format!("无法打开资源管理器：{e}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("当前平台暂不支持直接打开目录".into())
    }
}
