//! 注册表 → 界面用的行（含本机状态探测）。
//!
//! 与 `mod.rs` 分开是因为这里的每一步都在**探测文件系统**（exe 是否存在、
//! 工程根在哪、能力清单在哪），而 `mod.rs` 只管读写 JSON。混在一起会让
//! "改注册表格式"这件事看起来像要动文件系统代码。

use std::path::{Path, PathBuf};

use super::{load, AgentKind, SubAgentRow};
/// `<root>/src-tauri/target/release/<exe>` → `<root>`；其它布局返回 None。
pub fn project_root(exe: &str) -> Option<PathBuf> {
    let path = Path::new(exe);
    let release = path.parent()?; // .../target/release
    if release.file_name()?.to_str()? != "release" && release.file_name()?.to_str()? != "debug" {
        return None;
    }
    let target = release.parent()?; // .../target
    if target.file_name()?.to_str()? != "target" {
        return None;
    }
    let src_tauri = target.parent()?; // .../src-tauri
    if src_tauri.file_name()?.to_str()? != "src-tauri" {
        return None;
    }
    src_tauri.parent().map(Path::to_path_buf)
}

fn first_existing(candidates: Vec<PathBuf>) -> Option<String> {
    candidates
        .into_iter()
        .find(|p| p.is_file())
        .map(|p| p.to_string_lossy().to_string())
}

/// 组装界面用的行（含本机状态）。
pub fn rows() -> Vec<SubAgentRow> {
    load()
        .agents
        .iter()
        .map(|(name, entry)| {
            let root = project_root(&entry.path);
            let manifest = root
                .as_ref()
                .and_then(|r| first_existing(vec![r.join("docs").join("agent-card.json")]));
            let skill = root.as_ref().and_then(|r| {
                first_existing(vec![
                    r.join(".trae")
                        .join("skills")
                        .join(format!("{name}-agent"))
                        .join("SKILL.md"),
                    r.join(".claude")
                        .join("skills")
                        .join(format!("{name}-agent"))
                        .join("SKILL.md"),
                ])
            });
            // codex 原生成员没有 exe，本机探测都不适用，恒为"就绪"。
            let exe_exists = entry.kind != AgentKind::Codex || Path::new(&entry.path).is_file();
            SubAgentRow {
                name: name.clone(),
                path: entry.path.clone(),
                desc: entry.desc.clone(),
                registered_at: entry.registered_at,
                kind: entry.kind,
                team: entry.team.clone(),
                model: entry.model.clone(),
                skills: entry.skills.clone(),
                mcp_servers: entry.mcp_servers.clone(),
                prompt: entry.prompt.clone(),
                exe_exists,
                project_root: root.map(|p| p.to_string_lossy().to_string()),
                capability_manifest: manifest,
                skill_doc: skill,
            }
        })
        .collect()
}
