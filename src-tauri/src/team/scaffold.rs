//! `aigoat agent-scaffold`：把「适配壳」模板落到目标目录。
//!
//! 生成的是**一个独立的小 Rust 工程**：壳本体（`src-tauri/src/main.rs`）已写死，
//! 换上游只改 `adapter.json`。目录布局与 `registry/rows.rs` 的探测逻辑绑定：
//! `src-tauri/target/release/<exe>` 反推工程根，再找 `docs/agent-card.json` 与
//! `.trae/skills/<名>-agent/SKILL.md`——所以 `src-tauri` 这个名字不能改。
//!
//! 幂等：已存在的文件一律跳过，不覆盖用户/模型改过的映射与能力清单。

use serde_json::{json, Value};
use std::path::Path;

use super::report::{error_report, finish, option_value, split_out};

/// 固定模板：相对路径 → 内容。
const TEMPLATES: &[(&str, &str)] = &[
    (
        "src-tauri/Cargo.toml",
        include_str!("assets/template/src-tauri/Cargo.toml"),
    ),
    (
        "src-tauri/src/main.rs",
        include_str!("assets/template/src-tauri/src/main.rs"),
    ),
    ("adapter.json", include_str!("assets/template/adapter.json")),
    (
        "docs/agent-card.json",
        include_str!("assets/template/agent-card.json"),
    ),
];

/// 派单细则模板（路径随成员名变化，单独处理）。
const AGENT_SKILL: &str = include_str!("assets/template/agent-skill.md");

/// `agent-scaffold <目录> --name <名> [--desc <说明>] [--out report.json]`。
/// 返回 CLI 退出码（0 成功 / 1 失败，沿用 AF 任务单协议）。
pub fn run(args: &[String]) -> i32 {
    let (positional, out) = split_out(args);
    let Some(dir) = positional.first().copied() else {
        let msg = "用法：aigoat agent-scaffold <目标目录> --name <成员名> \
                   [--desc <说明>] [--out report.json]";
        return finish(&error_report(msg), out.as_deref());
    };
    let Some(name) = option_value(args, "--name") else {
        return finish(&error_report("agent-scaffold 缺 --name"), out.as_deref());
    };
    let desc = option_value(args, "--desc").unwrap_or_default();
    match scaffold(dir, &name, &desc) {
        Ok(data) => finish(
            &json!({ "status": "ok", "message": "骨架已生成", "data": data, "error": Value::Null }),
            out.as_deref(),
        ),
        Err(error) => finish(&error_report(error), out.as_deref()),
    }
}

/// 生成骨架。返回报告里的 `data` 段；名字不合法或写盘失败返回中文错误。
pub fn scaffold(dir: &str, name: &str, desc: &str) -> Result<Value, String> {
    let name = name.trim();
    crate::registry::check_name(name)?;
    let root = Path::new(dir.trim());
    if root.as_os_str().is_empty() {
        return Err("目标目录不能为空".into());
    }
    std::fs::create_dir_all(root).map_err(|e| format!("无法创建目录 {}：{e}", root.display()))?;

    let desc = if desc.trim().is_empty() {
        format!("{name} 团队成员")
    } else {
        desc.trim().to_string()
    };
    let mut created = Vec::new();
    let mut skipped = Vec::new();
    for (rel, body) in TEMPLATES {
        write_one(
            root,
            rel,
            &render(body, name, &desc),
            &mut created,
            &mut skipped,
        )?;
    }
    let skill_rel = format!(".trae/skills/{name}-agent/SKILL.md");
    write_one(
        root,
        &skill_rel,
        &render(AGENT_SKILL, name, &desc),
        &mut created,
        &mut skipped,
    )?;

    let target = root.join("src-tauri").join("target").join("release");
    Ok(json!({
        "root": root.to_string_lossy(),
        "memberName": name,
        "created": created,
        "skipped": skipped,
        "detected": {
            "exe": target.join(format!("{name}.exe")).to_string_lossy(),
            "capabilityManifest": root.join("docs").join("agent-card.json").to_string_lossy(),
            "skillDoc": root.join(&skill_rel).to_string_lossy(),
        },
    }))
}

fn render(body: &str, name: &str, desc: &str) -> String {
    body.replace("{{NAME}}", name).replace("{{DESC}}", desc)
}

fn write_one(
    root: &Path,
    rel: &str,
    body: &str,
    created: &mut Vec<String>,
    skipped: &mut Vec<String>,
) -> Result<(), String> {
    let path = root.join(rel);
    if path.is_file() {
        skipped.push(rel.to_string());
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("无法创建目录 {}：{e}", parent.display()))?;
    }
    crate::settings::config::write_text(&path, body)
        .map_err(|e| format!("写入 {rel} 失败：{e}"))?;
    created.push(rel.to_string());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::scaffold;
    use std::path::PathBuf;

    fn temp_dir(tag: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("aigoat-scaffold-{tag}-{nanos}"))
    }

    #[test]
    fn 首次生成五份文件_重跑全部跳过() {
        let dir = temp_dir("idempotent");
        let first = scaffold(dir.to_string_lossy().as_ref(), "demo-member", "演示成员").unwrap();
        assert_eq!(first["created"].as_array().unwrap().len(), 5);
        assert!(first["skipped"].as_array().unwrap().is_empty());
        assert!(dir.join("src-tauri/src/main.rs").is_file());
        assert!(dir
            .join(".trae/skills/demo-member-agent/SKILL.md")
            .is_file());

        // 占位符必须全部替换干净：残留 {{NAME}} 会让 codex 看到假名字。
        let card = std::fs::read_to_string(dir.join("docs/agent-card.json")).unwrap();
        assert!(card.contains("demo-member"));
        assert!(!card.contains("{{"));

        let second = scaffold(dir.to_string_lossy().as_ref(), "demo-member", "演示成员").unwrap();
        assert!(second["created"].as_array().unwrap().is_empty());
        assert_eq!(second["skipped"].as_array().unwrap().len(), 5);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 非法名字被拒绝() {
        let dir = temp_dir("bad-name");
        assert!(scaffold(dir.to_string_lossy().as_ref(), "bad name", "").is_err());
        assert!(scaffold(dir.to_string_lossy().as_ref(), "", "").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
