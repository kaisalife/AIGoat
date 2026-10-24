//! 运行期数据归拢：安装目录下的 `cache\`。
//!
//! 所有落盘数据按写入方分四类，互不交叉：
//! - `shell\`          壳配置三 json（settings / workspaces / ui-state）
//! - `codex\`          CODEX_HOME：codex 子进程的全部数据（会话 / 配置 / 技能）
//! - `agent-registry\` 子代理注册表 registry.json
//! - `tmp\`            壳临时文件
//!
//! cache 根在首次调用 [`root()`] 时定位一次（OnceLock），运行期不再变：
//! 1. exe 旁 `cache\`（写探针可写）——安装形态的常规位置；
//! 2. 不可写（装进 Program Files 等）→ `%APPDATA%\dev.aigoat.app\cache` 兜底。
//!
//! [`init()`] 在 main 最前面调用：建目录、把旧布局的数据**拷贝**迁入
//! （只拷不删，失败只打日志不阻塞启动）、把 CODEX_HOME 注入本进程环境——
//! registry 的角色文件目录与 codex 子进程读同一处，避免两边分家。

use std::path::PathBuf;
use std::sync::OnceLock;

static ROOT: OnceLock<PathBuf> = OnceLock::new();

/// cache 根定位：exe 旁可写优先，否则回落 AppData。
fn resolve_root() -> PathBuf {
    if let Some(exe_dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
    {
        let dir = exe_dir.join("cache");
        let probe = dir.join(".write-probe");
        if std::fs::create_dir_all(&dir).is_ok() && std::fs::write(&probe, b"").is_ok() {
            let _ = std::fs::remove_file(&probe);
            return dir;
        }
    }
    // exe 旁不可写（只读安装目录）：回落 AppData 兜底，保证应用仍可用。
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(appdata).join("dev.aigoat.app").join("cache")
}

/// cache 根目录（首次调用时定位并锁定）。
pub fn root() -> PathBuf {
    ROOT.get().cloned().unwrap_or_else(|| {
        let dir = resolve_root();
        let _ = ROOT.set(dir.clone());
        dir
    })
}

/// 壳配置三 json 的目录。
pub fn shell_dir() -> PathBuf {
    root().join("shell")
}

/// CODEX_HOME：codex 子进程的数据根。
pub fn codex_home() -> PathBuf {
    root().join("codex")
}

/// 子代理注册表文件。
pub fn registry_path() -> PathBuf {
    root().join("agent-registry").join("registry.json")
}

/// 壳临时文件目录。
pub fn tmp_dir() -> PathBuf {
    root().join("tmp")
}

/// 启动初始化：建目录、迁移旧布局数据、注入 CODEX_HOME。
/// 每步失败都只打日志——cache 没就绪最多丢功能，不该拦着应用起来。
pub fn init() {
    let dirs = [
        shell_dir(),
        codex_home(),
        root().join("agent-registry"),
        tmp_dir(),
    ];
    for dir in &dirs {
        if let Err(err) = std::fs::create_dir_all(dir) {
            eprintln!("[cache] 无法创建目录 {}：{err}", dir.display());
        }
    }
    migrate_shell_json();
    migrate_registry();
    // 进程级注入：codex 子进程经环境继承，壳内 codex_agents_dir() 也读这里。
    // 只在 spawn 时 .env() 的话壳自己看不到，角色文件会与 codex 数据分家。
    std::env::set_var("CODEX_HOME", codex_home());
}

/// 三个壳配置 json：旧布局（exe 旁散放 / AppData 配置目录）→ `cache\shell\`。
/// 只拷贝不删除：迁移失败旧文件还在，改回旧路径即回滚。
fn migrate_shell_json() {
    let names = [
        crate::settings::SETTINGS_FILE,
        crate::settings::UI_STATE_FILE,
        crate::workspaces::WORKSPACES_FILE,
    ];
    for name in names {
        let target = shell_dir().join(name);
        // 新位置已有就不动：那可能是用户改过的最新数据。
        if target.exists() {
            continue;
        }
        for legacy in legacy_shell_dirs() {
            let source = legacy.join(name);
            if source.exists() {
                if let Err(err) = std::fs::copy(&source, &target) {
                    eprintln!("[cache] 迁移 {} 失败：{err}", source.display());
                }
                break;
            }
        }
    }
}

/// 旧布局可能的壳配置目录：exe 旁（散放）与 AppData 配置目录。
fn legacy_shell_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(exe_dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
    {
        dirs.push(exe_dir);
    }
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    dirs.push(PathBuf::from(appdata).join("dev.aigoat.app"));
    dirs
}

/// 子代理注册表：`~/.agent-registry/registry.json` → `cache\agent-registry\`。
fn migrate_registry() {
    let target = registry_path();
    if target.exists() {
        return;
    }
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".into());
    let source = PathBuf::from(home)
        .join(".agent-registry")
        .join("registry.json");
    if source.exists() {
        if let Err(err) = std::fs::copy(&source, &target) {
            eprintln!("[cache] 迁移 {} 失败：{err}", source.display());
        }
    }
}
