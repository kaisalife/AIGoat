//! codex 可执行文件的解析顺序。
//!
//! 部署形态与开发形态走同一套代码：
//! 1. exe 旁 `bin\codex.exe` —— 安装包捆绑的魔改版（优先）；
//! 2. 环境变量 `AIGOAT_CODEX_EXE` —— 开发调试时显式指定；
//! 3. PATH 中的 `codex` —— 既有行为兜底（开发机 PATH 里通常有）。

/// 解析出本次 spawn 用的 codex 可执行文件路径。
pub(crate) fn resolve() -> String {
    if let Some(exe_dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
    {
        let bundled = exe_dir.join("bin").join("codex.exe");
        if bundled.is_file() {
            return bundled.to_string_lossy().into_owned();
        }
    }
    if let Ok(path) = std::env::var("AIGOAT_CODEX_EXE") {
        if !path.trim().is_empty() {
            return path;
        }
    }
    "codex".into()
}
